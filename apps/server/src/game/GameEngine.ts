import {
  chainIndexForPlayer,
  pickSeedWords,
  SERVER_EVENTS,
  type GeneratingPayload,
  type PlayerSnapshot,
  type RevealStepPayload,
  type RoomSnapshot,
  type RoundStartPayload,
} from "@drift/shared";
import type { Server, Socket } from "socket.io";
import { config } from "../config.js";
import { transformDoodle } from "../ai/driftImagePipeline.js";
import {
  clearTurnAiForTurn,
  getCachedTurnImageUrl,
  turnAiKey,
} from "../ai/turnAiLimit.js";
import { RoomRepository } from "./RoomRepository.js";
import {
  BLANK_DRAWING,
  canSupersedeBlankDrawing,
  chainForPlayer,
  latestDrawingForRound,
} from "./turnSubmission.js";

type TimerHandle = ReturnType<typeof setTimeout>;

/** Extra time after deadline so in-flight uploads can finish before a blank submit. */
const TIMER_SUBMIT_GRACE_MS = 1500;

export class GameEngine {
  private readonly repo = new RoomRepository();
  private readonly timers = new Map<string, TimerHandle>();
  private readonly deadlines = new Map<string, string>();
  /** One in-flight generation job per room+round. */
  private readonly generationJobs = new Map<string, Promise<void>>();
  /** Bumped when a late real drawing replaces a timer blank — stale jobs must not commit. */
  private readonly generationVersion = new Map<string, number>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  private roomChannel(roomId: string) {
    return `room:${roomId}`;
  }

  private roomRoundKey(roomId: string, round: number) {
    return turnAiKey(roomId, round);
  }

  private bumpGenerationVersion(roundKey: string): number {
    const next = (this.generationVersion.get(roundKey) ?? 0) + 1;
    this.generationVersion.set(roundKey, next);
    return next;
  }

  private isGenerationCurrent(roundKey: string, version: number): boolean {
    return this.generationVersion.get(roundKey) === version;
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

  private sortedPlayers(room: RoomSnapshot) {
    return [...room.players].sort((a, b) => a.displayIndex - b.displayIndex);
  }

  private buildRoundStartForPlayer(
    room: RoomSnapshot,
    player: PlayerSnapshot,
    deadline: string
  ): RoundStartPayload {
    const n = room.players.length;
    const chainIdx = chainIndexForPlayer(player.displayIndex, room.round, n);
    const chain = room.chains.find((c) => c.chainIndex === chainIdx)!;

    const base = {
      deadline,
      round: room.round,
      totalTurns: room.config.numRounds,
      chainId: chain.id,
      playerName: player.name,
    };

    if (room.round === 1) {
      return { type: "word", word: chain.seedWord, ...base };
    }

    const images = chain.links.filter((l) => l.type === "image");
    const ref = images[images.length - 1];
    return {
      type: "redraw",
      image: ref?.content ?? "",
      ...base,
    };
  }

  private allPlayersSubmitted(room: RoomSnapshot): boolean {
    return room.players.length > 0 && room.players.every((p) => p.submitted);
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

  /** Send personalized round start after join/reconnect during DRAWING. */
  async syncDrawingRound(
    roomId: string,
    socket: Socket,
    playerId: string
  ): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    const player = room.players.find((p) => p.id === playerId);
    const deadline = this.deadlines.get(roomId);
    if (!player || !deadline) return;

    socket.emit(
      SERVER_EVENTS.ROUND_START,
      this.buildRoundStartForPlayer(room, player, deadline)
    );
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

    const seedWords = pickSeedWords(n);
    await this.repo.createChains(roomId, seedWords);

    await this.repo.updateRoomState(roomId, {
      state: "DRAWING",
      round: 1,
      config: {
        ...room.config,
        numRounds: n,
        drawTimerSec: config.drawTimerSec,
        activePlayerId: null,
      },
    });

    await this.beginDrawingRound(roomId);
  }

  async submitDrawing(
    roomId: string,
    playerId: string,
    drawingUrl: string
  ): Promise<void> {
    let room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING" && room.state !== "GENERATING") {
      throw new Error("Not in drawing phase");
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not in room");

    const chain = chainForPlayer(room, playerId);
    if (!chain) throw new Error("No drawing assignment for this player");

    const roundKey = this.roomRoundKey(roomId, room.round);

    if (chain.links.some((l) => l.type === "image" && l.round === room.round)) {
      throw new Error("Round already finished");
    }

    if (player.submitted) {
      const supersede = canSupersedeBlankDrawing(room, playerId, drawingUrl);
      if (!supersede.ok) throw new Error("Already submitted");
      await this.repo.updateLinkContent(supersede.linkId, drawingUrl);
      await this.broadcastRoom(roomId);
      await this.restartGeneratingForRound(roomId, room.round);
      return;
    }

    if (this.generationJobs.has(roundKey)) {
      const supersede = canSupersedeBlankDrawing(room, playerId, drawingUrl);
      if (!supersede.ok) throw new Error("Already submitted");
      await this.repo.updateLinkContent(supersede.linkId, drawingUrl);
      await this.repo.setPlayerSubmitted(roomId, playerId, true);
      await this.broadcastRoom(roomId);
      await this.restartGeneratingForRound(roomId, room.round);
      return;
    }

    await this.repo.addLink(
      chain.id,
      room.round,
      "drawing",
      playerId,
      drawingUrl
    );
    await this.repo.setPlayerSubmitted(roomId, playerId, true);
    await this.broadcastRoom(roomId);

    room = await this.repo.loadRoom(roomId);
    if (this.allPlayersSubmitted(room)) {
      this.clearTimer(roomId);
      await this.enterGenerating(roomId);
    }
  }

  private async restartGeneratingForRound(
    roomId: string,
    round: number
  ): Promise<void> {
    const roundKey = this.roomRoundKey(roomId, round);
    this.bumpGenerationVersion(roundKey);
    clearTurnAiForTurn(roomId, round);

    const existingJob = this.generationJobs.get(roundKey);
    if (existingJob) await existingJob;

    await this.enterGenerating(roomId);
  }

  async hostNext(roomId: string, hostPlayerId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.hostPlayerId !== hostPlayerId) throw new Error("Only host can advance");
    if (room.state !== "REVEAL") return;

    const nextIndex = room.revealChainIndex + 1;
    if (nextIndex >= room.chains.length) {
      await this.repo.updateRoomState(roomId, { state: "GAME_OVER" });
      const final = await this.broadcastRoom(roomId);
      this.io
        .to(this.roomChannel(roomId))
        .emit(SERVER_EVENTS.GAME_OVER, { room: final });
      return;
    }

    await this.repo.updateRoomState(roomId, { reveal_chain_index: nextIndex });
    await this.emitRevealStep(roomId);
  }

  private async beginDrawingRound(roomId: string): Promise<void> {
    await this.repo.resetSubmissions(roomId);
    const room = await this.repo.loadRoom(roomId);
    const players = this.sortedPlayers(room);

    const deadline = new Date(
      Date.now() + room.config.drawTimerSec * 1000
    ).toISOString();
    this.deadlines.set(roomId, deadline);

    this.clearTimer(roomId);
    const handle = setTimeout(() => {
      void this.onRoundTimerExpired(roomId);
    }, room.config.drawTimerSec * 1000);
    this.timers.set(roomId, handle);

    const sockets = await this.io.in(this.roomChannel(roomId)).fetchSockets();
    for (const s of sockets) {
      const pid = (s.data as { playerId?: string }).playerId;
      const player = players.find((p) => p.id === pid);
      if (!player) continue;
      s.emit(
        SERVER_EVENTS.ROUND_START,
        this.buildRoundStartForPlayer(room, player, deadline)
      );
    }

    await this.broadcastRoom(roomId);
  }

  private async onRoundTimerExpired(roomId: string): Promise<void> {
    await new Promise((r) => setTimeout(r, TIMER_SUBMIT_GRACE_MS));

    let room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    const players = this.sortedPlayers(room);
    for (const player of players) {
      if (player.submitted) continue;

      const chain = chainForPlayer(room, player.id);
      if (!chain) continue;

      if (
        chain.links.some(
          (l) => l.type === "image" && l.round === room.round
        )
      ) {
        continue;
      }

      const existing = latestDrawingForRound(chain, room.round);
      if (existing?.authorId === player.id) continue;

      await this.repo.addLink(
        chain.id,
        room.round,
        "drawing",
        player.id,
        BLANK_DRAWING
      );
      await this.repo.setPlayerSubmitted(roomId, player.id, true);
    }

    room = await this.repo.loadRoom(roomId);
    if (!this.allPlayersSubmitted(room)) return;

    this.clearTimer(roomId);
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

    const roundKey = this.roomRoundKey(roomId, room.round);
    const existingJob = this.generationJobs.get(roundKey);
    if (existingJob) {
      await existingJob;
      return;
    }

    const version = this.bumpGenerationVersion(roundKey);
    const job = this.runGeneratingRound(roomId, version);
    this.generationJobs.set(roundKey, job);
    try {
      await job;
    } finally {
      this.generationJobs.delete(roundKey);
    }
  }

  private async runGeneratingRound(
    roomId: string,
    generationVersion: number
  ): Promise<void> {
    this.clearTimer(roomId);
    let room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING" && room.state !== "GENERATING") return;

    const round = room.round;
    const roundKey = this.roomRoundKey(roomId, round);
    const stillCurrent = () =>
      this.isGenerationCurrent(roundKey, generationVersion);

    const chains = [...room.chains].sort(
      (a, b) => a.chainIndex - b.chainIndex
    );
    const pending = chains.filter((chain) => {
      if (this.imageUrlForRound(chain, round)) return false;
      return Boolean(latestDrawingForRound(chain, round));
    });

    if (pending.length === 0) {
      await this.advanceAfterRound(roomId);
      return;
    }

    if (!stillCurrent()) return;

    await this.repo.updateRoomState(roomId, { state: "GENERATING" });
    await this.broadcastRoom(roomId);

    const emitProgress = (completed: number, failed: number) => {
      const payload: GeneratingPayload = {
        count: pending.length,
        completed,
        failed,
      };
      this.io
        .to(this.roomChannel(roomId))
        .emit(SERVER_EVENTS.GENERATING, payload);
    };

    emitProgress(0, 0);

    let completed = 0;
    let failed = 0;

    await Promise.all(
      pending.map(async (chain) => {
        if (!stillCurrent()) return;

        const cached = getCachedTurnImageUrl(
          roomId,
          round,
          chain.chainIndex
        );
        if (cached) {
          room = await this.repo.loadRoom(roomId);
          const fresh = room.chains.find((c) => c.id === chain.id);
          if (fresh && !this.imageUrlForRound(fresh, round)) {
            await this.repo.addLink(
              chain.id,
              round,
              "image",
              null,
              cached
            );
          }
          completed++;
          emitProgress(completed, failed);
          return;
        }

        const drawing = latestDrawingForRound(chain, round);
        if (!drawing) return;

        const author = room.players.find((p) => p.id === drawing.authorId);

        try {
          const imageUrl = await transformDoodle(
            drawing.content,
            roomId,
            room.config.styleSuffix,
            {
              playerName: author?.name,
              turn: round,
              chainIndex: chain.chainIndex,
              seedWord: chain.seedWord,
            }
          );

          if (!stillCurrent()) return;

          room = await this.repo.loadRoom(roomId);
          const fresh = room.chains.find((c) => c.id === chain.id);
          if (fresh && !this.imageUrlForRound(fresh, round)) {
            await this.repo.addLink(
              chain.id,
              round,
              "image",
              null,
              imageUrl
            );
          }
          completed++;
        } catch {
          failed++;
        }

        emitProgress(completed, failed);
      })
    );

    if (!stillCurrent()) return;

    await this.advanceAfterRound(roomId);
  }

  private async advanceAfterRound(roomId: string): Promise<void> {
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
    await this.beginDrawingRound(roomId);
  }

  private async emitRevealStep(roomId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    const chain =
      room.chains.find((c) => c.chainIndex === room.revealChainIndex) ??
      room.chains[0];
    if (!chain) return;

    const payload: RevealStepPayload = {
      chainId: chain.id,
      chainIndex: chain.chainIndex,
      links: chain.links,
      chainCount: room.chains.length,
    };

    this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.REVEAL_STEP, payload);
    await this.broadcastRoom(roomId);
  }
}
