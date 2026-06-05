import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@drift/shared";
import {
  BLANK_DRAWING,
  canSupersedeBlankDrawing,
  isBlankDrawing,
} from "./turnSubmission.js";

function roomWithBlankSubmitted(): RoomSnapshot {
  return {
    id: "room-1",
    code: "ABCD",
    hostPlayerId: "host",
    state: "GENERATING",
    round: 1,
    maxPlayers: 8,
    minPlayers: 3,
    config: {
      drawTimerSec: 30,
      numRounds: 3,
      styleSuffix: "style",
      activePlayerId: "p1",
    },
    players: [
      {
        id: "p1",
        name: "Alice",
        displayIndex: 0,
        connected: true,
        submitted: true,
        isHost: true,
      },
    ],
    chains: [
      {
        id: "chain-1",
        chainIndex: 0,
        seedWord: "cat",
        links: [
          {
            id: "link-blank",
            type: "drawing",
            authorId: "p1",
            content: BLANK_DRAWING,
            round: 1,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ],
    revealChainIndex: 0,
    deadline: null,
  };
}

describe("isBlankDrawing", () => {
  it("detects timer placeholder doodle", () => {
    expect(isBlankDrawing(BLANK_DRAWING)).toBe(true);
    expect(isBlankDrawing("https://cdn.example/doodle.png")).toBe(false);
  });
});

describe("canSupersedeBlankDrawing", () => {
  it("allows replacing a timer blank when AI image not created yet", () => {
    const room = roomWithBlankSubmitted();
    const result = canSupersedeBlankDrawing(room, "p1", "https://cdn.example/real.png");
    expect(result).toEqual({ ok: true, linkId: "link-blank" });
  });

  it("rejects supersede when turn already has an image", () => {
    const room = roomWithBlankSubmitted();
    room.chains[0]!.links.push({
      id: "img-1",
      type: "image",
      authorId: null,
      content: "https://cdn.example/ai.png",
      round: 1,
      createdAt: "2026-01-01T00:01:00Z",
    });
    expect(canSupersedeBlankDrawing(room, "p1", "https://cdn.example/real.png")).toEqual({
      ok: false,
    });
  });

  it("rejects supersede when player has not submitted", () => {
    const room = roomWithBlankSubmitted();
    room.players[0]!.submitted = false;
    expect(canSupersedeBlankDrawing(room, "p1", "https://cdn.example/real.png")).toEqual({
      ok: false,
    });
  });
});
