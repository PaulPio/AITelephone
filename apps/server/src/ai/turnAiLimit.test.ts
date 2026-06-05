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
  it("runs factory only once when two callers share the same room turn chain", async () => {
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return "https://cdn.example/ai-turn-1.png";
    });

    const [first, second] = await Promise.all([
      runTurnTransformOnce("room-a", 1, 0, factory),
      runTurnTransformOnce("room-a", 1, 0, factory),
    ]);

    expect(first).toBe("https://cdn.example/ai-turn-1.png");
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns cached url on later calls without invoking factory again", async () => {
    const factory = vi.fn(async () => "https://cdn.example/cached.png");

    await runTurnTransformOnce("room-b", 2, 1, factory);
    expect(getCachedTurnImageUrl("room-b", 2, 1)).toBe(
      "https://cdn.example/cached.png"
    );

    await runTurnTransformOnce("room-b", 2, 1, factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("uses separate cache entries per chain", async () => {
    const factory = vi.fn(
      async (chain: number) => `https://cdn.example/c${chain}.png`
    );

    await runTurnTransformOnce("room-c", 1, 0, () => factory(0));
    await runTurnTransformOnce("room-c", 1, 1, () => factory(1));

    expect(getCachedTurnImageUrl("room-c", 1, 0)).toBe(
      "https://cdn.example/c0.png"
    );
    expect(getCachedTurnImageUrl("room-c", 1, 1)).toBe(
      "https://cdn.example/c1.png"
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
