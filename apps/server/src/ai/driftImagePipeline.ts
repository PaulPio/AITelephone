/**
 * Doodle → AI image: one OpenRouter call per room turn; same URL for all consumers.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import sharp from "sharp";
import { config } from "../config.js";
import { uploadAiImage, uploadPlaceholder } from "../storage/upload.js";
import { runTurnTransformOnce } from "./turnAiLimit.js";

const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

export type TransformContext = {
  playerName?: string;
  turn?: number;
  seedWord?: string;
};

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf)
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
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
    const images = (msg as { images?: Array<{ image_url?: { url?: string } }> })
      .images;
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

async function renderOnce(
  doodleB64: string,
  styleSuffix: string,
  ctx: TransformContext
): Promise<Buffer> {
  const who = ctx.playerName ? `Player ${ctx.playerName}` : "The player";
  const turn = ctx.turn ? ` (turn ${ctx.turn})` : "";
  const seedHint = ctx.seedWord
    ? `The game started from the word "${ctx.seedWord}". `
    : "";

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
            text: `${seedHint}${who} drew this doodle${turn}. Study every line and shape, then output exactly ONE polished illustration that matches what was drawn — same subjects, pose, and layout. ${styleSuffix}. Do not return text only; include the image.`,
          },
        ],
      },
    ],
    providerOptions: {
      openrouter: {
        modalities: ["image", "text"],
      },
    },
    abortSignal: AbortSignal.timeout(Math.max(config.aiTimeoutMs, 45_000)),
  });

  const buf = extractImageBuffer(result);
  if (!buf) throw new Error("No image in model response");
  return buf;
}

async function generateOnce(
  drawingUrl: string,
  roomId: string,
  styleSuffix: string,
  ctx: TransformContext
): Promise<string> {
  if (!config.openRouterApiKey) {
    return uploadPlaceholder(roomId);
  }

  try {
    const buffer = await fetchImageBuffer(drawingUrl);
    const doodleB64 = buffer.toString("base64");
    const out = await renderOnce(doodleB64, styleSuffix, ctx);
    return uploadAiImage(roomId, out);
  } catch (err) {
    console.error(
      `[drift-ai] transform failed room=${roomId} turn=${ctx.turn}:`,
      err
    );
    return uploadPlaceholder(roomId);
  }
}

export async function transformDoodle(
  drawingUrl: string,
  roomId: string,
  styleSuffix: string,
  ctx: TransformContext = {}
): Promise<string> {
  const turn = ctx.turn ?? 0;
  return runTurnTransformOnce(roomId, turn, () =>
    generateOnce(drawingUrl, roomId, styleSuffix, ctx)
  );
}

export async function prewarm(): Promise<void> {
  /* no-op */
}
