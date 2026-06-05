import { describe, expect, it } from "vitest";
import { createInitialRoom, isPlayerFinished, latestImageForChain } from "./state";

describe("shared room helpers", () => {
  it("creates one chain per player with distinct seed words", () => {
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [
        { id: "p1", name: "Alex", connected: true },
        { id: "p2", name: "Rae", connected: true }
      ],
      seedWords: ["haunted lighthouse", "robot chef"]
    });

    expect(room.state).toBe("LOBBY");
    expect(room.chains.map((chain) => chain.seedWord)).toEqual([
      "haunted lighthouse",
      "robot chef"
    ]);
    expect(room.chains[0].links[0]).toMatchObject({
      type: "word",
      content: "haunted lighthouse"
    });
  });

  it("finds the latest AI image link for redraw rounds", () => {
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [{ id: "p1", name: "Alex", connected: true }],
      seedWords: ["haunted lighthouse"]
    });

    room.chains[0].links.push(
      { type: "drawing", authorId: "p1", content: "drawing.png", createdAt: "2026-06-04T00:00:00.000Z" },
      { type: "image", authorId: "ai", content: "image.png", createdAt: "2026-06-04T00:00:01.000Z" }
    );

    expect(latestImageForChain(room.chains[0])).toBe("image.png");
  });

  it("marks a player finished after they submit for the current round", () => {
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [{ id: "p1", name: "Alex", connected: true }],
      seedWords: ["haunted lighthouse"]
    });
    room.round = 1;
    room.submissions = { p1: { chainId: "chain-1", drawingUrl: "drawing.png" } };

    expect(isPlayerFinished(room, "p1")).toBe(true);
    expect(isPlayerFinished(room, "missing")).toBe(false);
  });
});
