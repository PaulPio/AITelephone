import { chainIndexForPlayer } from "@drift/shared";
import type { ChainSnapshot, RoomSnapshot } from "@drift/shared";

export const BLANK_DRAWING =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function isBlankDrawing(content: string): boolean {
  return content === BLANK_DRAWING;
}

export function chainForPlayer(
  room: RoomSnapshot,
  playerId: string
): ChainSnapshot | undefined {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  const n = room.players.length;
  if (n === 0) return undefined;
  const idx = chainIndexForPlayer(player.displayIndex, room.round, n);
  return room.chains.find((c) => c.chainIndex === idx);
}

export function latestDrawingForRound(chain: ChainSnapshot, round: number) {
  const drawings = chain.links.filter(
    (l) => l.type === "drawing" && l.round === round
  );
  return drawings[drawings.length - 1];
}

export type SupersedeBlankResult =
  | { ok: true; linkId: string }
  | { ok: false };

export function canSupersedeBlankDrawing(
  room: RoomSnapshot,
  playerId: string,
  drawingUrl: string
): SupersedeBlankResult {
  if (isBlankDrawing(drawingUrl)) return { ok: false };

  const player = room.players.find((p) => p.id === playerId);
  if (!player?.submitted) return { ok: false };

  const chain = chainForPlayer(room, playerId);
  if (!chain) return { ok: false };

  if (chain.links.some((l) => l.type === "image" && l.round === room.round)) {
    return { ok: false };
  }

  const drawing = latestDrawingForRound(chain, room.round);
  if (!drawing || drawing.authorId !== playerId) return { ok: false };
  if (!isBlankDrawing(drawing.content)) return { ok: false };

  return { ok: true, linkId: drawing.id };
}
