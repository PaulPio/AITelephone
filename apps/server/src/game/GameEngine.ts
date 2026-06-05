import {
  pickSeedWords,
  SERVER_EVENTS,
  type AiImageReadyPayload,
  type GeneratingPayload,
  type RevealStepPayload,
  type RoomSnapshot,
  type RoundStartPayload,
  type TurnWaitingPayload,
} from "@drift/shared";
import type { Server } from "socket.io";
import { config } from "../config.js";
import { transformDoodle } from "../ai/driftImagePipeline.js";
import {
  getCachedTurnImageUrl,
  turnAiKey,
} from "../ai/turnAiLimit.js";
import { RoomRepository } from "./RoomRepository.js";

type TimerHandle = ReturnType<typeof setTimeout>;

const BLANK_DRAWING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export class GameEngine {
  private readonly repo = new RoomRepository();
  private readonly timers = new Map<string, TimerHandle>();
  private readonly deadlines = new Map<string, string>();
  /** One in-flight generation job per room+turn (all callers await the same work). */
  private readonly generationJobs = new Map<string, Promise<void>>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  private roomChannel(roomId: string) {
    return `room:${roomId}`;
  }

  private roomTurnKey(roomId: string, turn: number) {
    return turnAiKey(roomId, turn);
  }

  private imageUrlForRound(
    chain: RoomSnapshot["chains"][0],
    round: number
  ): string | undefined {
    const link = chain.links.find(
      (l) => l.type === "image" && l.round === round
    );
    return link?.content;
  }

  private broadcastAiImageReady(
    roomId: string,
    round: number,
    imageUrl: string
  ): void {
    const payload: AiImageReadyPayload = { round, imageUrl };
    this.io
      .to(this.roomChannel(roomId))
      .emit(SERVER_EVENTS.AI_IMAGE_READY, payload);
  }

  private sortedPlayers(room: RoomSnapshot) {
    return [...room.players].sort((a, b) => a.displayIndex - b.displayIndex);
  }

  private mainChain(room: RoomSnapshot) {
    const chain = room.chains.find((c) => c.chainIndex === 0);
    if (!chain) throw new Error("Game chain missing");
    return chain;
  }

  private latestImage(chain: RoomSnapshot["chains"][0]) {
    const images = chain.links.filter((l) => l.type === "image");
    return images[images.length - 1];
  }

  private async setActivePlayer(
    roomId: string,
    activePlayerId: string | null
  ): Promise<RoomSnapshot> {
    const room = await this.repo.loadRoom(roomId);
    await this.repo.updateRoomState(roomId, {
      config: { ...room.config, activePlayerId },
    });
    return this.repo.loadRoom(roomId);
  }

  async broadcastRoom(roomId: string): Promise<RoomSnapshot> {
    const room = await this.repo.loadRoom(roomId);
    const deadline = this.deadlines.get(roomId) ?? null;
    const payload = { ...room, deadline };
    this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.ROOM_UPDATE, {
      room: payload,
    });
    return payload;
  }

  async createRoom(
    authUserId: string,
    hostName: string,
    minPlayers?: number
  ) {
    return this.repo.createRoom(authUserId, hostName, minPlayers);
  }

  async joinRoom(code: string, authUserId: string, name: string) {
    return this.repo.joinRoom(code, authUserId, name);
  }

  async startGame(roomId: string, hostPlayerId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.hostPlayerId !== hostPlayerId) throw new Error("Only host can start");
    if (room.state !== "LOBBY") throw new Error("Already started");

    const players = this.sortedPlayers(room);
    const n = players.length;
    if (n < room.minPlayers) throw new Error(`Need at least ${room.minPlayers} players`);
    if (n > room.maxPlayers) throw new Error("Too many players");

    const seedWord = pickSeedWords(1)[0]!;
    await this.repo.createSingleChain(roomId, seedWord);

    const first = players[0]!;
    await this.repo.updateRoomState(roomId, {
      state: "DRAWING",
      round: 1,
      config: {
        ...room.config,
        numRounds: n,
        drawTimerSec: config.drawTimerSec,
        activePlayerId: first.id,
      },
    });

    await this.beginDrawingTurn(roomId);
  }

  async submitDrawing(
    roomId: string,
    playerId: string,
    drawingUrl: string
  ): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;
    if (room.config.activePlayerId !== playerId) {
      throw new Error("Not your turn");
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.submitted) return;

    const turnKey = this.roomTurnKey(roomId, room.round);
    if (this.generationJobs.has(turnKey)) return;

    const chain = this.mainChain(room);
    const alreadyHasImage = chain.links.some(
      (l) => l.type === "image" && l.round === room.round
    );
    if (alreadyHasImage) return;

    await this.repo.addLink(chain.id, room.round, "drawing", playerId, drawingUrl);
    await this.repo.setPlayerSubmitted(roomId, playerId, true);
    this.clearTimer(roomId);
    await this.enterGenerating(roomId);
  }

  async hostNext(roomId: string, hostPlayerId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.hostPlayerId !== hostPlayerId) throw new Error("Only host can advance");
    if (room.state !== "REVEAL") return;

    await this.repo.updateRoomState(roomId, { state: "GAME_OVER" });
    const final = await this.broadcastRoom(roomId);
    this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.GAME_OVER, { room: final });
  }

  private async beginDrawingTurn(roomId: string): Promise<void> {
    await this.repo.resetSubmissions(roomId);
    let room = await this.repo.loadRoom(roomId);
    const players = this.sortedPlayers(room);
    const turn = room.round;
    const active = players[turn - 1];
    if (!active) throw new Error("Invalid turn");

    room = await this.setActivePlayer(roomId, active.id);
    const chain = this.mainChain(room);
    const deadline = new Date(
      Date.now() + room.config.drawTimerSec * 1000
    ).toISOString();
    this.deadlines.set(roomId, deadline);

    this.clearTimer(roomId);
    const handle = setTimeout(() => {
      void this.onTurnTimerExpired(roomId);
    }, room.config.drawTimerSec * 1000);
    this.timers.set(roomId, handle);

    let roundStart: RoundStartPayload;
    let waiting: TurnWaitingPayload;

    if (turn === 1) {
      const word = chain.seedWord;
      roundStart = {
        type: "word",
        word,
        deadline,
        round: turn,
        totalTurns: room.config.numRounds,
        chainId: chain.id,
        playerName: active.name,
      };
      waiting = {
        round: turn,
        totalTurns: room.config.numRounds,
        activePlayerId: active.id,
        activePlayerName: active.name,
        promptType: "word",
        word,
      };
    } else {
      const ref = this.latestImage(chain);
      const image = ref?.content ?? "";
      roundStart = {
        type: "redraw",
        image,
        deadline,
        round: turn,
        totalTurns: room.config.numRounds,
        chainId: chain.id,
        playerName: active.name,
      };
      waiting = {
        round: turn,
        totalTurns: room.config.numRounds,
        activePlayerId: active.id,
        activePlayerName: active.name,
        promptType: "redraw",
        image,
      };
    }

    const sockets = await this.io.in(this.roomChannel(roomId)).fetchSockets();
    for (const s of sockets) {
      const pid = (s.data as { playerId?: string }).playerId;
      if (pid === active.id) {
        s.emit(SERVER_EVENTS.ROUND_START, roundStart);
      } else {
        s.emit(SERVER_EVENTS.TURN_WAITING, waiting);
      }
    }

    await this.broadcastRoom(roomId);
  }

  private async onTurnTimerExpired(roomId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    const activeId = room.config.activePlayerId;
    if (!activeId) return;

    const player = room.players.find((p) => p.id === activeId);
    if (!player || player.submitted) return;

    const chain = this.mainChain(room);
    await this.repo.addLink(
      chain.id,
      room.round,
      "drawing",
      activeId,
      BLANK_DRAWING
    );
    await this.repo.setPlayerSubmitted(roomId, activeId, true);
    await this.enterGenerating(roomId);
  }

  private clearTimer(roomId: string): void {
    const t = this.timers.get(roomId);
    if (t) clearTimeout(t);
    this.timers.delete(roomId);
  }

  private async enterGenerating(roomId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING" && room.state !== "GENERATING") return;

    const turnKey = this.roomTurnKey(roomId, room.round);
    const existingJob = this.generationJobs.get(turnKey);
    if (existingJob) {
      await existingJob;
      return;
    }

    const job = this.runGeneratingTurn(roomId);
    this.generationJobs.set(turnKey, job);
    try {
      await job;
    } finally {
      this.generationJobs.delete(turnKey);
    }
  }

  private async runGeneratingTurn(roomId: string): Promise<void> {
    this.clearTimer(roomId);
    let room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING" && room.state !== "GENERATING") return;

    const turn = room.round;
    const activeId = room.config.activePlayerId;
    const active = room.players.find((p) => p.id === activeId);
    let chain = this.mainChain(room);

    let imageUrl =
      this.imageUrlForRound(chain, turn) ??
      getCachedTurnImageUrl(roomId, turn);

    if (imageUrl) {
      this.broadcastAiImageReady(roomId, turn, imageUrl);
      await this.advanceAfterTurnImage(roomId);
      return;
    }

    const drawingLinks = chain.links.filter(
      (l) => l.type === "drawing" && l.round === turn
    );
    const drawing = drawingLinks[drawingLinks.length - 1];
    if (!drawing) return;

    await this.repo.updateRoomState(roomId, { state: "GENERATING" });
    await this.broadcastRoom(roomId);

    const emitProgress = (completed: number, failed: number) => {
      const payload: GeneratingPayload = { count: 1, completed, failed };
      this.io
        .to(this.roomChannel(roomId))
        .emit(SERVER_EVENTS.GENERATING, payload);
    };

    emitProgress(0, 0);

    imageUrl = await transformDoodle(
      drawing.content,
      roomId,
      room.config.styleSuffix,
      {
        playerName: active?.name,
        turn,
        seedWord: chain.seedWord,
      }
    );
    emitProgress(1, 0);

    room = await this.repo.loadRoom(roomId);
    chain = this.mainChain(room);
    if (!this.imageUrlForRound(chain, turn)) {
      await this.repo.addLink(chain.id, turn, "image", null, imageUrl);
    }

    this.broadcastAiImageReady(roomId, turn, imageUrl);
    await this.advanceAfterTurnImage(roomId);
  }

  private async advanceAfterTurnImage(roomId: string): Promise<void> {
    const after = await this.repo.loadRoom(roomId);
    if (after.state !== "GENERATING" && after.state !== "DRAWING") return;

    if (after.round >= after.config.numRounds) {
      await this.repo.updateRoomState(roomId, {
        state: "REVEAL",
        reveal_chain_index: 0,
        config: { ...after.config, activePlayerId: null },
      });
      await this.emitRevealStep(roomId);
      return;
    }

    await this.repo.updateRoomState(roomId, {
      state: "DRAWING",
      round: after.round + 1,
    });
    await this.beginDrawingTurn(roomId);
  }

  private async emitRevealStep(roomId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    const chain = this.mainChain(room);

    const payload: RevealStepPayload = {
      chainId: chain.id,
      chainIndex: 0,
      links: chain.links,
      chainCount: 1,
    };

    this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.REVEAL_STEP, payload);
    await this.broadcastRoom(roomId);
  }
}
