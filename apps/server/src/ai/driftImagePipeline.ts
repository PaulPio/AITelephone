/**

 * Doodle → AI image: one OpenRouter call per room turn; same URL for all consumers.

 */

import sharp from "sharp";

import { config } from "../config.js";

import { uploadAiImage, uploadPlaceholder } from "../storage/upload.js";

import {
  renderDoodleViaOpenRouter,
  type TransformContext,
} from "./openRouterImageClient.js";
import { runTurnTransformOnce } from "./turnAiLimit.js";

export type { TransformContext };



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

    const out = await renderDoodleViaOpenRouter(doodleB64, styleSuffix, ctx);

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


