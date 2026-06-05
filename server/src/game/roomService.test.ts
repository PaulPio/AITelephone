import { describe, expect, it } from "vitest";
import { MemoryRoomStore } from "./roomStore";
import { createRoomService } from "./roomService";

describe("room service", () => {
  it("creates a room and lets players join by code", async () => {
    const service = createRoomService(new MemoryRoomStore(), {
      createId: () => "host-1",
      createCode: () => "ABCD",
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"]
    });

    const created = await service.createRoom();
    const joined = await service.joinRoom(created.code, "Alex");

    expect(created.code).toBe("ABCD");
    expect(joined.room.players).toHaveLength(1);
    expect(joined.room.players[0]).toMatchObject({ name: "Alex", connected: true });
  });

  it("reconnects an existing name to the same player slot", async () => {
    let id = 0;
    const service = createRoomService(new MemoryRoomStore(), {
      createId: () => `id-${++id}`,
      createCode: () => "ABCD",
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"]
    });
    await service.createRoom();
    const first = await service.joinRoom("ABCD", "Alex");
    const second = await service.joinRoom("ABCD", " alex ");

    expect(second.playerId).toBe(first.playerId);
    expect(second.room.players).toHaveLength(1);
  });

  it("locks the player list when the game leaves the lobby", async () => {
    const store = new MemoryRoomStore();
    const service = createRoomService(store, {
      createId: () => "id",
      createCode: () => "ABCD",
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"]
    });
    await service.createRoom();
    await store.update("ABCD", (room) => ({ ...room, state: "DRAWING" }));

    await expect(service.joinRoom("ABCD", "Rae")).rejects.toThrow("game has already started");
  });

  it("allows an existing player name to reconnect after the game starts", async () => {
    let id = 0;
    const store = new MemoryRoomStore();
    const service = createRoomService(store, {
      createId: () => `id-${++id}`,
      createCode: () => "ABCD",
      seedWords: ["robot chef", "haunted lighthouse", "surfing grandma"]
    });
    await service.createRoom();
    const joined = await service.joinRoom("ABCD", "Alex");
    await store.update("ABCD", (room) => ({ ...room, state: "DRAWING" }));

    const rejoined = await service.joinRoom("ABCD", "Alex");

    expect(rejoined.playerId).toBe(joined.playerId);
  });
});
