import { describe, expect, it } from "vitest";
import {
  extractImageBufferFromOpenRouterCompletion,
  extractImageBufferFromResult,
} from "./extractImageBuffer.js";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("extractImageBufferFromOpenRouterCompletion", () => {
  it("extracts image from choices[0].message.images (OpenRouter native shape)", () => {
    const completion = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            images: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${TINY_PNG_B64}`,
                },
              },
            ],
          },
        },
      ],
    };

    const buf = extractImageBufferFromOpenRouterCompletion(completion);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(0);
  });
});

describe("extractImageBufferFromResult", () => {
  it("extracts image from OpenRouter-style message.images array", () => {
    const result = {
      response: {
        messages: [
          {
            images: [
              {
                image_url: {
                  url: `data:image/png;base64,${TINY_PNG_B64}`,
                },
              },
            ],
          },
        ],
      },
    };

    const buf = extractImageBufferFromResult(result);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(0);
  });

  it("returns null when response has no image payload", () => {
    expect(
      extractImageBufferFromResult({
        response: { messages: [{ content: "text only" }] },
      })
    ).toBeNull();
  });
});
