import { describe, expect, it } from "vitest";
import { MemoryObjectStorage } from "./objectStorage";

describe("MemoryObjectStorage", () => {
  it("stores image bytes behind a public URL", async () => {
    const storage = new MemoryObjectStorage("https://cdn.example.test");

    const saved = await storage.putImage({
      key: "rooms/ABCD/drawings/p1.png",
      body: Buffer.from("png"),
      contentType: "image/png"
    });

    expect(saved).toEqual({
      key: "rooms/ABCD/drawings/p1.png",
      url: "https://cdn.example.test/rooms/ABCD/drawings/p1.png"
    });
    expect(storage.get("rooms/ABCD/drawings/p1.png")?.contentType).toBe("image/png");
  });
});
