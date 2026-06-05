import { chainIndexForPlayer } from "./latinSquare.js";
import type { RoundStartPayload, RoomSnapshot } from "./types.js";

/** Build the draw prompt for one player from room state (reconnect / missed socket). */
export function deriveRoundStartForPlayer(
  room: RoomSnapshot,
  playerId: string,
  deadline: string | null
): RoundStartPayload | null {
  if (room.state !== "DRAWING" || !deadline) return null;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;

  const n = room.players.length;
  if (n === 0) return null;

  const chainIdx = chainIndexForPlayer(player.displayIndex, room.round, n);
  const chain = room.chains.find((c) => c.chainIndex === chainIdx);
  if (!chain) return null;

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
