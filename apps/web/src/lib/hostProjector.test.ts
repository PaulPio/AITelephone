import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@drift/shared";
import { buildHostProjectorView } from "./hostProjector.js";

function makeRoom(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
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
        submitted: true,
        isHost: false,
      },
    ],
    chains: [
      { id: "chain-1", chainIndex: 0, seedWord: "pizza", links: [] },
      { id: "chain-2", chainIndex: 1, seedWord: "cat", links: [] },
    ],
    revealChainIndex: 0,
    deadline: null,
    ...overrides,
  };
}

describe("buildHostProjectorView", () => {
  it("shows parallel drawing status with submission count", () => {
    const view = buildHostProjectorView(makeRoom({ round: 2 }));

    expect(view).toMatchObject({
      phase: "drawing",
      round: 2,
      totalRounds: 3,
      submittedCount: 1,
      playerCount: 2,
    });
  });

  it("shows generating phase", () => {
    const view = buildHostProjectorView(makeRoom({ state: "GENERATING" }));
    expect(view).toMatchObject({
      phase: "generating",
      round: 1,
      playerCount: 2,
    });
  });

  it("returns null in lobby", () => {
    expect(buildHostProjectorView(makeRoom({ state: "LOBBY" }))).toBeNull();
  });
});
