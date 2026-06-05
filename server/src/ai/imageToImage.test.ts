import { describe, expect, it } from "vitest";
import { createImageToImagePipeline } from "./imageToImage";

describe("image-to-image pipeline", () => {
  it("returns the provider image URL when generation succeeds", async () => {
    const pipeline = createImageToImagePipeline({
      fallbackImageUrl: "https://cdn.example.test/fallback.png",
      timeoutMs: 1000,
      provider: async () => ({ imageUrl: "https://cdn.example.test/ai.png" })
    });

    await expect(
      pipeline.generate({ drawingUrl: "https://cdn.example.test/drawing.png", styleSuffix: "cursed" })
    ).resolves.toEqual({ imageUrl: "https://cdn.example.test/ai.png", fallback: false });
  });

  it("returns the placeholder image when generation fails", async () => {
    const pipeline = createImageToImagePipeline({
      fallbackImageUrl: "https://cdn.example.test/fallback.png",
      timeoutMs: 1000,
      provider: async () => {
        throw new Error("provider down");
      }
    });

    await expect(
      pipeline.generate({ drawingUrl: "https://cdn.example.test/drawing.png", styleSuffix: "cursed" })
    ).resolves.toEqual({ imageUrl: "https://cdn.example.test/fallback.png", fallback: true });
  });
});
