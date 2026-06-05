import { describe, expect, it } from "vitest";
import { buildJoinUrl } from "./joinUrl";

describe("buildJoinUrl", () => {
  it("adds the room code as a query parameter", () => {
    expect(buildJoinUrl("https://game.example/play", "ABCD")).toBe("https://game.example/play?code=ABCD");
  });
});
