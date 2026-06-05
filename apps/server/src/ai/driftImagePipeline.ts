/**
 * Multi-step doodle → AI image pipeline (VoltAgent-style workflow via AI SDK + OpenRouter).
 * Primary: reference image generation. Fallback: vision caption → text-to-image.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import pLimit from "p-limit";
import sharp from "sharp";
import { config } from "../config.js";
import { uploadAiImage, uploadPlaceholder } from "../storage/upload.js";

const STYLE_SUFFIX =
  "detailed vivid digital illustration, coherent subject, clean rendering";

const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf).resize(512, 512, { fit: "inside" }).png().toBuffer();
}

function extractImageBuffer(result: unknown): Buffer | null {
  const r = result as {
    files?: Array<{ base64?: string; uint8Array?: Uint8Array }>;
    response?: { messages?: unknown[] };
  };

  if (r.files?.[0]?.uint8Array) {
    return Buffer.from(r.files[0].uint8Array);
  }
  if (r.files?.[0]?.base64) {
    return Buffer.from(r.files[0].base64, "base64");
  }

  const messages = r.response?.messages;
  if (!Array.isArray(messages)) return null;
  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;
    const images = (msg as { images?: Array<{ image_url?: { url?: string } }> }).images;
    if (images?.[0]?.image_url?.url) {
      const url = images[0].image_url.url;
      const b64 = url.replace(/^data:image\/\w+;base64,/, "");
      return Buffer.from(b64, "base64");
    }
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        (part as { type?: string }).type === "image" &&
        (part as { image?: string }).image
      ) {
        const img = (part as { image: string }).image;
        const b64 = img.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(b64, "base64");
      }
    }
  }
  return null;
}

function imageModalities(): string[] {
  const model = config.openRouterImageModel;
  if (model.includes("grok-imagine")) {
    return ["image"];
  }
  return ["image", "text"];
}

async function primaryRender(doodleB64: string, styleSuffix: string): Promise<Buffer> {
  const result = await generateText({
    model: openrouter(config.openRouterImageModel),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: `data:image/png;base64,${doodleB64}`,
          },
          {
            type: "text",
            text: `Turn this crude doodle into art. ${styleSuffix}. Do not name the subject — invent from the lines only.`,
          },
        ],
      },
    ],
    providerOptions: {
      openrouter: {
        modalities: imageModalities(),
      },
    },
    abortSignal: AbortSignal.timeout(config.aiTimeoutMs),
  });

  const buf = extractImageBuffer(result);
  if (!buf) throw new Error("No image in primary render response");
  return buf;
}

async function visionCaption(doodleB64: string): Promise<string> {
  const result = await generateText({
    model: openrouter(config.openRouterVisionModel),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: `data:image/png;base64,${doodleB64}`,
          },
          {
            type: "text",
            text: "Describe only the lines and shapes in this doodle in one short sentence. Do not guess what it is supposed to be.",
          },
        ],
      },
    ],
    abortSignal: AbortSignal.timeout(config.aiTimeoutMs),
  });
  return result.text.trim();
}

async function fallbackRender(caption: string, styleSuffix: string): Promise<Buffer> {
  const result = await generateText({
    model: openrouter(config.openRouterImageModel),
    messages: [
      {
        role: "user",
        content: `Illustration based on: ${caption}. Style: ${styleSuffix}`,
      },
    ],
    providerOptions: {
      openrouter: {
        modalities: imageModalities(),
      },
    },
    abortSignal: AbortSignal.timeout(config.aiTimeoutMs),
  });

  const buf = extractImageBuffer(result);
  if (!buf) throw new Error("No image in fallback render");
  return buf;
}

export async function transformDoodle(
  drawingUrl: string,
  roomId: string,
  styleSuffix: string
): Promise<string> {
  if (!config.openRouterApiKey) {
    return uploadPlaceholder(roomId);
  }

  try {
    const buffer = await fetchImageBuffer(drawingUrl);
    const doodleB64 = buffer.toString("base64");

    let out: Buffer;
    try {
      out = await primaryRender(doodleB64, styleSuffix);
    } catch {
      const caption = await visionCaption(doodleB64);
      out = await fallbackRender(caption, styleSuffix);
    }

    return uploadAiImage(roomId, out);
  } catch {
    return uploadPlaceholder(roomId);
  }
}

export async function generateBatch(
  items: { drawingUrl: string; roomId: string; styleSuffix: string }[],
  onProgress?: (completed: number, failed: number) => void
): Promise<string[]> {
  const limit = pLimit(config.aiConcurrency);
  let completed = 0;
  let failed = 0;

  const results = await Promise.all(
    items.map((item) =>
      limit(async () => {
        try {
          const url = await transformDoodle(
            item.drawingUrl,
            item.roomId,
            item.styleSuffix
          );
          completed++;
          onProgress?.(completed, failed);
          return url;
        } catch {
          failed++;
          completed++;
          onProgress?.(completed, failed);
          return uploadPlaceholder(item.roomId);
        }
      })
    )
  );

  return results;
}

export async function prewarm(): Promise<void> {
  if (!config.openRouterApiKey) return;
  try {
    const tiny = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const b64 = tiny.toString("base64");
    await primaryRender(b64, STYLE_SUFFIX);
  } catch {
    /* ignore prewarm failures */
  }
}
