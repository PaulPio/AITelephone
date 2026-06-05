/**
 * Doodle → AI image: one OpenRouter call per room turn; same URL for all consumers.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import sharp from "sharp";
import { config } from "../config.js";
import { uploadAiImage, uploadPlaceholder } from "../storage/upload.js";
import { extractImageBufferFromResult } from "./extractImageBuffer.js";
import { runTurnTransformOnce } from "./turnAiLimit.js";

const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

export type TransformContext = {
  playerName?: string;
  turn?: number;
  seedWord?: string;
};

async function fetchImageBuffer(url: string): Promise<Buffer> {
  let raw: Buffer;
  if (url.startsWith("data:")) {
    const b64 = url.replace(/^data:image\/\w+;base64,/, "");
    raw = Buffer.from(b64, "base64");
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    raw = Buffer.from(await res.arrayBuffer());
  }
  return sharp(raw)
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
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

  const buf = extractImageBufferFromResult(result);
  if (!buf) {
    const r = result as { text?: string; finishReason?: string };
    console.error(
      `[drift-ai] no image in model response (${config.openRouterImageModel}) finishReason=${r.finishReason ?? "unknown"} textLen=${r.text?.length ?? 0}`
    );
    throw new Error("No image in model response");
  }
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

