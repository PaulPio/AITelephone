import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedTurnImageUrl,
  resetTurnAiLimitForTests,
  runTurnTransformOnce,
} from "./turnAiLimit.js";

beforeEach(() => {
  resetTurnAiLimitForTests();
});

describe("runTurnTransformOnce", () => {
  it("runs factory only once when two callers share the same room turn", async () => {
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return "https://cdn.example/ai-turn-1.png";
    });

    const [first, second] = await Promise.all([
      runTurnTransformOnce("room-a", 1, factory),
      runTurnTransformOnce("room-a", 1, factory),
    ]);

    expect(first).toBe("https://cdn.example/ai-turn-1.png");
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns cached url on later calls without invoking factory again", async () => {
    const factory = vi.fn(async () => "https://cdn.example/cached.png");

    await runTurnTransformOnce("room-b", 2, factory);
    expect(getCachedTurnImageUrl("room-b", 2)).toBe(
      "https://cdn.example/cached.png"
    );

    await runTurnTransformOnce("room-b", 2, factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("uses separate cache entries per turn", async () => {
    const factory = vi.fn(async (turn: number) => `https://cdn.example/t${turn}.png`);

    await runTurnTransformOnce("room-c", 1, () => factory(1));
    await runTurnTransformOnce("room-c", 2, () => factory(2));

    expect(getCachedTurnImageUrl("room-c", 1)).toBe("https://cdn.example/t1.png");
    expect(getCachedTurnImageUrl("room-c", 2)).toBe("https://cdn.example/t2.png");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
