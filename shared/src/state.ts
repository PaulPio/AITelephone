import type { Chain, Player, PublicRoom, Room, RoomConfig } from "./types";

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  numRounds: 4,
  drawTimerSec: 30,
  model: "image-to-image",
  styleSuffix:
    "realistic uncanny cursed funny-horrible interpretation, detailed texture, unsettling but recognizable"
};

type CreateInitialRoomInput = {
  code: string;
  hostId: string;
  players: Player[];
  seedWords: string[];
  config?: Partial<RoomConfig>;
};

export function createInitialRoom(input: CreateInitialRoomInput): Room {
  if (input.players.length !== input.seedWords.length) {
    throw new Error("room needs one seed word per player");
  }

  const now = new Date().toISOString();
  const chains: Chain[] = input.seedWords.map((seedWord, index) => ({
    id: `chain-${index + 1}`,
    seedWord,
    links: [
      {
        type: "word",
        authorId: "system",
        content: seedWord,
        createdAt: now
      }
    ]
  }));

  return {
    code: input.code,
    hostId: input.hostId,
    state: "LOBBY",
    round: 0,
    revealIndex: 0,
    config: { ...DEFAULT_ROOM_CONFIG, ...input.config },
    players: input.players,
    chains,
    submissions: {},
    createdAt: now,
    updatedAt: now
  };
}

export function latestImageForChain(chain: Chain): string | undefined {
  return [...chain.links].reverse().find((link) => link.type === "image")?.content;
}

export function isPlayerFinished(room: Room, playerId: string): boolean {
  return Boolean(room.submissions[playerId]);
}

export function toPublicRoom(room: Room): PublicRoom {
  const { submissions: _submissions, ...publicRoom } = room;
  return {
    ...publicRoom,
    submittedPlayerIds: Object.keys(room.submissions)
  };
}
