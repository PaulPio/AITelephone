import {
  chainIndexForPlayer,
  pickSeedWords,
  SERVER_EVENTS,
  type GeneratingPayload,
  type RevealStepPayload,
  type RoomSnapshot,
  type RoundStartPayload,
} from "@drift/shared";
import type { Server } from "socket.io";
import { config } from "../config.js";
import { generateBatch, prewarm } from "../ai/driftImagePipeline.js";
import { RoomRepository } from "./RoomRepository.js";

type TimerHandle = ReturnType<typeof setTimeout>;

export class GameEngine {
  private readonly repo = new RoomRepository();
  private readonly timers = new Map<string, TimerHandle>();
  private readonly deadlines = new Map<string, string>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  private roomChannel(roomId: string) {
    return `room:${roomId}`;
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

    const n = room.players.length;
    if (n < room.minPlayers) throw new Error(`Need at least ${room.minPlayers} players`);
    if (n > room.maxPlayers) throw new Error("Too many players");

    const seedWords = pickSeedWords(n);
    await this.repo.createChains(roomId, seedWords);

    const configPatch = {
      ...room.config,
      numRounds: n,
      drawTimerSec: config.drawTimerSec,
    };

    await this.repo.updateRoomState(roomId, {
      state: "DRAWING",
      round: 1,
      config: configPatch,
    });

    void prewarm();
    await this.beginDrawingRound(roomId);
  }

  async submitDrawing(
    roomId: string,
    playerId: string,
    drawingUrl: string
  ): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.submitted) return;

    const chainIdx = chainIndexForPlayer(player.displayIndex, room.round, room.players.length);
    const chain = room.chains.find((c) => c.chainIndex === chainIdx);
    if (!chain) return;

    await this.repo.addLink(chain.id, room.round, "drawing", playerId, drawingUrl);
    await this.repo.setPlayerSubmitted(roomId, playerId, true);

    const updated = await this.repo.loadRoom(roomId);
    const allSubmitted = updated.players.every((p) => p.submitted);
    if (allSubmitted) {
      this.clearTimer(roomId);
      await this.enterGenerating(roomId);
    } else {
      await this.broadcastRoom(roomId);
    }
  }

  async hostNext(roomId: string, hostPlayerId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.hostPlayerId !== hostPlayerId) throw new Error("Only host can advance");
    if (room.state !== "REVEAL") return;

    const nextIndex = room.revealChainIndex + 1;
    if (nextIndex >= room.chains.length) {
      await this.repo.updateRoomState(roomId, { state: "GAME_OVER" });
      const final = await this.broadcastRoom(roomId);
      this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.GAME_OVER, { room: final });
      return;
    }

    await this.repo.updateRoomState(roomId, { reveal_chain_index: nextIndex });
    await this.emitRevealStep(roomId, nextIndex);
  }

  private async beginDrawingRound(roomId: string): Promise<void> {
    await this.repo.resetSubmissions(roomId);
    const room = await this.repo.loadRoom(roomId);
    const deadline = new Date(
      Date.now() + room.config.drawTimerSec * 1000
    ).toISOString();
    this.deadlines.set(roomId, deadline);

    this.clearTimer(roomId);
    const handle = setTimeout(() => {
      void this.onRoundTimerExpired(roomId);
    }, room.config.drawTimerSec * 1000);
    this.timers.set(roomId, handle);

    for (const player of room.players) {
      const chainIdx = chainIndexForPlayer(
        player.displayIndex,
        room.round,
        room.players.length
      );
      const chain = room.chains.find((c) => c.chainIndex === chainIdx);
      if (!chain) continue;

      let payload: RoundStartPayload;
      if (room.round === 1) {
        payload = {
          type: "word",
          word: chain.seedWord,
          deadline,
          round: room.round,
          chainId: chain.id,
        };
      } else {
        const images = chain.links.filter((l) => l.type === "image");
        const latestImage = images[images.length - 1];
        payload = {
          type: "redraw",
          image: latestImage?.content ?? "",
          deadline,
          round: room.round,
          chainId: chain.id,
        };
      }

      const sockets = await this.io.in(this.roomChannel(roomId)).fetchSockets();
      for (const s of sockets) {
        const pid = (s.data as { playerId?: string }).playerId;
        if (pid === player.id) {
          s.emit(SERVER_EVENTS.ROUND_START, payload);
        }
      }
    }

    await this.broadcastRoom(roomId);
  }

  private async onRoundTimerExpired(roomId: string): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    const blank =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    for (const player of room.players) {
      if (player.submitted) continue;
      const chainIdx = chainIndexForPlayer(
        player.displayIndex,
        room.round,
        room.players.length
      );
      const chain = room.chains.find((c) => c.chainIndex === chainIdx);
      if (!chain) continue;
      await this.repo.addLink(chain.id, room.round, "drawing", player.id, blank);
      await this.repo.setPlayerSubmitted(roomId, player.id, true);
    }

    await this.enterGenerating(roomId);
  }

  private clearTimer(roomId: string): void {
    const t = this.timers.get(roomId);
    if (t) clearTimeout(t);
    this.timers.delete(roomId);
  }

  private async enterGenerating(roomId: string): Promise<void> {
    this.clearTimer(roomId);
    const room = await this.repo.loadRoom(roomId);
    if (room.state !== "DRAWING") return;

    await this.repo.updateRoomState(roomId, { state: "GENERATING" });
    await this.broadcastRoom(roomId);

    const drawings: { chainId: string; drawingUrl: string; playerId: string }[] = [];
    for (const player of room.players) {
      const chainIdx = chainIndexForPlayer(
        player.displayIndex,
        room.round,
        room.players.length
      );
      const chain = room.chains.find((c) => c.chainIndex === chainIdx);
      if (!chain) continue;
      const drawingLinks = chain.links.filter(
        (l) => l.type === "drawing" && l.round === room.round
      );
      const link = drawingLinks[drawingLinks.length - 1];
      if (link) {
        drawings.push({
          chainId: chain.id,
          drawingUrl: link.content,
          playerId: player.id,
        });
      }
    }

    const count = drawings.length;
    let completed = 0;
    let failed = 0;

    const emitProgress = () => {
      const payload: GeneratingPayload = { count, completed, failed };
      this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.GENERATING, payload);
    };

    emitProgress();

    const urls = await generateBatch(
      drawings.map((d) => ({
        drawingUrl: d.drawingUrl,
        roomId,
        styleSuffix: room.config.styleSuffix,
      })),
      (c, f) => {
        completed = c;
        failed = f;
        emitProgress();
      }
    );

    for (let i = 0; i < drawings.length; i++) {
      const d = drawings[i]!;
      const url = urls[i]!;
      await this.repo.addLink(d.chainId, room.round, "image", null, url);
    }

    const after = await this.repo.loadRoom(roomId);
    if (after.round >= after.config.numRounds) {
      await this.repo.updateRoomState(roomId, {
        state: "REVEAL",
        reveal_chain_index: 0,
      });
      await this.emitRevealStep(roomId, 0);
    } else {
      await this.repo.updateRoomState(roomId, {
        state: "DRAWING",
        round: after.round + 1,
      });
      await this.beginDrawingRound(roomId);
    }
  }

  private async emitRevealStep(roomId: string, chainIndex: number): Promise<void> {
    const room = await this.repo.loadRoom(roomId);
    const chain = room.chains.find((c) => c.chainIndex === chainIndex);
    if (!chain) return;

    const payload: RevealStepPayload = {
      chainId: chain.id,
      chainIndex,
      links: chain.links,
      chainCount: room.chains.length,
    };

    this.io.to(this.roomChannel(roomId)).emit(SERVER_EVENTS.REVEAL_STEP, payload);
    await this.broadcastRoom(roomId);
  }
}
