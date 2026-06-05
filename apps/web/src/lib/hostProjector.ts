import type { RoomSnapshot } from "@drift/shared";

export type HostProjectorView =
  | {
      phase: "drawing";
      round: number;
      totalTurns: number;
      activePlayerName: string;
      promptType: "word";
      word: string;
    }
  | {
      phase: "drawing";
      round: number;
      totalTurns: number;
      activePlayerName: string;
      promptType: "redraw";
      imageUrl: string;
    }
  | {
      phase: "generating";
      round: number;
      totalTurns: number;
      activePlayerName: string;
      drawingUrl?: string;
    };

function mainChain(room: RoomSnapshot) {
  return room.chains.find((c) => c.chainIndex === 0);
}

function isRenderableImageUrl(url: string | undefined): url is string {
  if (!url) return false;
  if (url.length > 2_000_000) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:image/")
  );
}

export function buildHostProjectorView(
  room: RoomSnapshot | null
): HostProjectorView | null {
  if (!room) return null;
  const chain = mainChain(room);
  if (!chain) return null;

  const totalTurns = room.config.numRounds;
  const round = room.round;
  const active = room.players.find((p) => p.id === room.config.activePlayerId);
  const activePlayerName = active?.name ?? "Player";

  const drawingForRound = chain.links
    .filter((l) => l.type === "drawing" && l.round === round)
    .at(-1);

  if (room.state === "GENERATING") {
    return {
      phase: "generating",
      round,
      totalTurns,
      activePlayerName,
      drawingUrl: isRenderableImageUrl(drawingForRound?.content)
        ? drawingForRound.content
        : undefined,
    };
  }

  if (room.state !== "DRAWING") return null;

  if (round === 1) {
    return {
      phase: "drawing",
      round,
      totalTurns,
      activePlayerName,
      promptType: "word",
      word: chain.seedWord,
    };
  }

  const images = chain.links.filter((l) => l.type === "image");
  const ref = images[images.length - 1];
  const imageUrl = isRenderableImageUrl(ref?.content) ? ref.content : "";
  return {
    phase: "drawing",
    round,
    totalTurns,
    activePlayerName,
    promptType: "redraw",
    imageUrl,
  };
}
