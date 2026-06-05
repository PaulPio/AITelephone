import { describe, expect, it } from "vitest";
import { createInitialRoom } from "@gartic-ai/shared";
import { MemoryRoomStore } from "./roomStore";

describe("MemoryRoomStore", () => {
  it("saves and loads a room without sharing object references", async () => {
    const store = new MemoryRoomStore();
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [{ id: "p1", name: "Alex", connected: true }],
      seedWords: ["robot chef"]
    });

    await store.save(room);
    const loaded = await store.get("ABCD");
    loaded!.players[0].connected = false;

    expect((await store.get("ABCD"))!.players[0].connected).toBe(true);
  });

  it("updates a room atomically and refreshes updatedAt", async () => {
    const store = new MemoryRoomStore();
    const room = createInitialRoom({
      code: "ABCD",
      hostId: "host",
      players: [{ id: "p1", name: "Alex", connected: true }],
      seedWords: ["robot chef"]
    });
    await store.save(room);

    const updated = await store.update("ABCD", (current) => ({
      ...current,
      state: "DRAWING"
    }));

    expect(updated.state).toBe("DRAWING");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(room.updatedAt).getTime()
    );
  });
});
