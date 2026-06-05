import { describe, expect, it } from "vitest";
import { createInitialRoom } from "@gartic-ai/shared";
import { appendGeneratedImages, buildRoundStarts, startNextRound, submitDrawing } from "./stateMachine";

describe("game state machine", () => {
  it("starts round one with word prompts and server deadlines", () => {
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [
        { id: "p1", name: "Alex", connected: true },
        { id: "p2", name: "Rae", connected: true }
      ],
      seedWords: ["robot chef", "haunted lighthouse"],
      config: { drawTimerSec: 30 }
    });

    const drawingRoom = startNextRound(room, new Date("2026-06-04T00:00:00.000Z"));
    const starts = buildRoundStarts(drawingRoom);

    expect(drawingRoom.state).toBe("DRAWING");
    expect(drawingRoom.round).toBe(1);
    expect(starts.p1).toMatchObject({ type: "word", word: "robot chef" });
    expect(starts.p2).toMatchObject({ type: "word", word: "haunted lighthouse" });
    expect(starts.p1.deadline).toBe("2026-06-04T00:00:30.000Z");
  });

  it("records drawings on assigned chains and detects round completion", () => {
    const room = startNextRound(
      createInitialRoom({
        code: "ABCD",
        hostId: "host",
        players: [
          { id: "p1", name: "Alex", connected: true },
          { id: "p2", name: "Rae", connected: true }
        ],
        seedWords: ["robot chef", "haunted lighthouse"]
      })
    );

    const first = submitDrawing(room, "p1", "drawing-1.png");
    const second = submitDrawing(first.room, "p2", "drawing-2.png");

    expect(first.roundComplete).toBe(false);
    expect(second.roundComplete).toBe(true);
    expect(second.room.submissions.p1).toMatchObject({ chainId: "chain-1" });
  });

  it("starts redraw rounds from the latest generated image", () => {
    const room = startNextRound(
      createInitialRoom({
        code: "ABCD",
        hostId: "host",
        players: [
          { id: "p1", name: "Alex", connected: true },
          { id: "p2", name: "Rae", connected: true }
        ],
        seedWords: ["robot chef", "haunted lighthouse"]
      })
    );
    const submitted = submitDrawing(submitDrawing(room, "p1", "d1.png").room, "p2", "d2.png").room;
    const generated = appendGeneratedImages(submitted, {
      "chain-1": "ai-1.png",
      "chain-2": "ai-2.png"
    });
    const redraw = startNextRound(generated);

    expect(buildRoundStarts(redraw).p1).toMatchObject({ type: "redraw", image: "ai-2.png" });
    expect(buildRoundStarts(redraw).p2).toMatchObject({ type: "redraw", image: "ai-1.png" });
  });
});
