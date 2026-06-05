import type { RoomSnapshot } from "@drift/shared";

export type HostProjectorView =
  | {
      phase: "drawing";
      round: number;
      totalRounds: number;
      submittedCount: number;
      playerCount: number;
    }
  | {
      phase: "generating";
      round: number;
      totalRounds: number;
      submittedCount: number;
      playerCount: number;
    };

export function buildHostProjectorView(
  room: RoomSnapshot | null
): HostProjectorView | null {
  if (!room) return null;
  if (room.state !== "DRAWING" && room.state !== "GENERATING") return null;

  const submittedCount = room.players.filter((p) => p.submitted).length;
  const base = {
    round: room.round,
    totalRounds: room.config.numRounds,
    submittedCount,
    playerCount: room.players.length,
  };

  if (room.state === "GENERATING") {
    return { phase: "generating", ...base };
  }

  return { phase: "drawing", ...base };
}
