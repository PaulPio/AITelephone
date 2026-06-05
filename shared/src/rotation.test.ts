import { describe, expect, it } from "vitest";
import { buildRoundAssignments, getAssignedChainId } from "./rotation";

describe("round assignment rotation", () => {
  it("assigns each player to a different chain every round", () => {
    const playerIds = ["p1", "p2", "p3", "p4"];
    const chainIds = ["c1", "c2", "c3", "c4"];

    expect(buildRoundAssignments(playerIds, chainIds, 1)).toEqual({
      p1: "c1",
      p2: "c2",
      p3: "c3",
      p4: "c4"
    });
    expect(buildRoundAssignments(playerIds, chainIds, 2)).toEqual({
      p1: "c2",
      p2: "c3",
      p3: "c4",
      p4: "c1"
    });
  });

  it("wraps assignments with the PRD Latin-square rule", () => {
    expect(getAssignedChainId(3, ["c1", "c2", "c3", "c4"], 2)).toBe("c1");
  });

  it("rejects invalid round and mismatched player/chain counts", () => {
    expect(() => getAssignedChainId(0, ["c1"], 0)).toThrow("round must be at least 1");
    expect(() => buildRoundAssignments(["p1"], ["c1", "c2"], 1)).toThrow(
      "player and chain counts must match"
    );
  });
});
