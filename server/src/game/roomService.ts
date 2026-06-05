import { createInitialRoom, toPublicRoom, type JoinRoomAck, type PublicRoom } from "@gartic-ai/shared";
import { randomUUID } from "node:crypto";
import type { RoomStore } from "./roomStore";
import { pickSeedWords } from "./seedWords";

type RoomServiceOptions = {
  createId?: () => string;
  createCode?: () => string;
  seedWords?: string[];
};

export function createRoomService(store: RoomStore, options: RoomServiceOptions = {}) {
  const createId = options.createId ?? (() => randomUUID());
  const createCode = options.createCode ?? createRoomCode;

  return {
    async createRoom(): Promise<{ code: string; hostId: string; room: PublicRoom }> {
      const code = createCode();
      const hostId = createId();
      const room = createInitialRoom({
        code,
        hostId,
        players: [],
        seedWords: []
      });
      await store.save(room);
      return { code, hostId, room: toPublicRoom(room) };
    },

    async joinRoom(code: string, rawName: string): Promise<JoinRoomAck> {
      const name = normalizeName(rawName);
      if (!name) {
        throw new Error("name is required");
      }

      const room = await store.update(code, (current) => {
        const existing = current.players.find(
          (player) => player.name.trim().toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          return {
            ...current,
            players: current.players.map((player) =>
              player.id === existing.id ? { ...player, connected: true } : player
            )
          };
        }

        if (current.state !== "LOBBY") {
          throw new Error("game has already started");
        }

        if (current.players.length >= 8) {
          throw new Error("room is full");
        }

        return {
          ...current,
          players: [...current.players, { id: createId(), name, connected: true }]
        };
      });

      const player = room.players.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
      if (!player) {
        throw new Error("player join failed");
      }
      return { playerId: player.id, room: toPublicRoom(room) };
    },

    async prepareSeeds(code: string) {
      return store.update(code, (room) => ({
        ...room,
        chains: createInitialRoom({
          code: room.code,
          hostId: room.hostId,
          players: room.players,
          seedWords: pickSeedWords(room.players.length, options.seedWords),
          config: room.config
        }).chains
      }));
    }
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
