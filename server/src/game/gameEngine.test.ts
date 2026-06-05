import { describe, expect, it } from "vitest";
import { createInitialRoom } from "@gartic-ai/shared";
import { createGameEngine } from "./gameEngine";
import { MemoryRoomStore } from "./roomStore";

describe("game engine", () => {
  it("generates AI images when all players submit and starts the next round", async () => {
    const store = new MemoryRoomStore();
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [
        { id: "p1", name: "Alex", connected: true },
        { id: "p2", name: "Rae", connected: true },
        { id: "p3", name: "Mika", connected: true }
      ],
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"],
      config: { numRounds: 2 }
    });
    await store.save(room);
    const engine = createGameEngine(store, {
      generate: async ({ drawingUrl }) => ({ imageUrl: `ai-${drawingUrl}`, fallback: false })
    });

    await engine.startGame("ABCD", "host");
    await engine.submitDrawing("ABCD", "p1", "d1.png");
    await engine.submitDrawing("ABCD", "p2", "d2.png");
    const result = await engine.submitDrawing("ABCD", "p3", "d3.png");

    expect(result.room.state).toBe("DRAWING");
    expect(result.room.round).toBe(2);
    expect(result.room.chains[0].links.map((link) => link.type)).toEqual(["word", "drawing", "image"]);
  });

  it("moves to reveal after the final generated round", async () => {
    const store = new MemoryRoomStore();
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [
        { id: "p1", name: "Alex", connected: true },
        { id: "p2", name: "Rae", connected: true },
        { id: "p3", name: "Mika", connected: true }
      ],
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"],
      config: { numRounds: 1 }
    });
    await store.save(room);
    const engine = createGameEngine(store, {
      generate: async ({ drawingUrl }) => ({ imageUrl: `ai-${drawingUrl}`, fallback: false })
    });

    await engine.startGame("ABCD", "host");
    await engine.submitDrawing("ABCD", "p1", "d1.png");
    await engine.submitDrawing("ABCD", "p2", "d2.png");
    const result = await engine.submitDrawing("ABCD", "p3", "d3.png");

    expect(result.room.state).toBe("REVEAL");
    expect(result.revealStep?.links.at(-1)).toMatchObject({ type: "image", content: "ai-d1.png" });
  });
});
