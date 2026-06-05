import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@drift/shared";
import { buildHostProjectorView } from "./hostProjector.js";

function makeRoom(overrides: Partial<RoomSnapshot> & { seedWord?: string }): RoomSnapshot {
  const seedWord = overrides.seedWord ?? "dragon";
  const { seedWord: _s, ...roomOverrides } = overrides;
  return {
    id: "room-1",
    code: "ABCDEF",
    hostPlayerId: "host-id",
    state: "DRAWING",
    round: 1,
    maxPlayers: 8,
    minPlayers: 3,
    config: {
      drawTimerSec: 30,
      numRounds: 3,
      styleSuffix: "vivid",
      activePlayerId: "host-id",
    },
    players: [
      {
        id: "host-id",
        name: "Host",
        displayIndex: 0,
        connected: true,
        submitted: false,
        isHost: true,
      },
      {
        id: "p2",
        name: "Player2",
        displayIndex: 1,
        connected: true,
        submitted: false,
        isHost: false,
      },
    ],
    chains: [
      {
        id: "chain-1",
        chainIndex: 0,
        seedWord,
        links: [],
      },
    ],
    revealChainIndex: 0,
    deadline: null,
    ...roomOverrides,
  };
}

describe("buildHostProjectorView", () => {
  it("shows seed word on turn 1 when host is the active drawer", () => {
    const view = buildHostProjectorView(makeRoom({ round: 1, seedWord: "pizza" }));

    expect(view).toMatchObject({
      phase: "drawing",
      promptType: "word",
      word: "pizza",
      activePlayerName: "Host",
      round: 1,
      totalTurns: 3,
    });
  });

  it("shows latest AI image on redraw turns", () => {
    const room = makeRoom({
      round: 2,
      chains: [
        {
          id: "chain-1",
          chainIndex: 0,
          seedWord: "pizza",
          links: [
            {
              id: "img-1",
              type: "image",
              authorId: null,
              content: "https://cdn.example/ai-1.png",
              round: 1,
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        },
      ],
    });

    const view = buildHostProjectorView(room);
    expect(view).toMatchObject({
      phase: "drawing",
      promptType: "redraw",
      imageUrl: "https://cdn.example/ai-1.png",
      round: 2,
    });
  });

  it("shows submitted doodle while generating", () => {
    const room = makeRoom({
      state: "GENERATING",
      round: 1,
      chains: [
        {
          id: "chain-1",
          chainIndex: 0,
          seedWord: "pizza",
          links: [
            {
              id: "draw-1",
              type: "drawing",
              authorId: "host-id",
              authorName: "Host",
              content: "https://cdn.example/doodle.png",
              round: 1,
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        },
      ],
    });

    const view = buildHostProjectorView(room);
    expect(view).toMatchObject({
      phase: "generating",
      drawingUrl: "https://cdn.example/doodle.png",
      activePlayerName: "Host",
    });
  });

  it("returns null in lobby", () => {
    expect(buildHostProjectorView(makeRoom({ state: "LOBBY" }))).toBeNull();
  });
});
