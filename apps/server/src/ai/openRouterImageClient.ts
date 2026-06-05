import { config } from "../config.js";
import { extractImageBufferFromOpenRouterCompletion } from "./extractImageBuffer.js";

export type TransformContext = {
  playerName?: string;
  turn?: number;
  chainIndex?: number;
  seedWord?: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function renderDoodleViaOpenRouter(
  doodleB64: string,
  styleSuffix: string,
  ctx: TransformContext
): Promise<Buffer> {
  const who = ctx.playerName ? `Player ${ctx.playerName}` : "The player";
  const turn = ctx.turn ? ` (turn ${ctx.turn})` : "";
  const seedHint = ctx.seedWord
    ? `The game started from the word "${ctx.seedWord}". `
    : "";

  const prompt = `${seedHint}${who} drew this doodle${turn}. Study every line and shape, then output exactly ONE polished illustration that matches what was drawn — same subjects, pose, and layout. ${styleSuffix}. You must include an image in your response.`;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.corsOrigins[0] ?? "https://drift.game",
      "X-Title": "DRIFT",
    },
    body: JSON.stringify({
      model: config.openRouterImageModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${doodleB64}`,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
    signal: AbortSignal.timeout(Math.max(config.aiTimeoutMs, 45_000)),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenRouter HTTP ${response.status}: ${raw.slice(0, 400)}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`OpenRouter invalid JSON: ${raw.slice(0, 200)}`);
  }

  const buf = extractImageBufferFromOpenRouterCompletion(json);
  if (!buf) {
    const err = (json as { error?: { message?: string } }).error?.message;
    throw new Error(
      err
        ? `OpenRouter error: ${err}`
        : "No image in OpenRouter completion response"
    );
  }
  return buf;
}
