function parseCorsOrigins(raw: string | undefined): string[] {
  const list = (raw ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ["http://localhost:5173"];
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  drawTimerSec: Number(process.env.DRAW_TIMER_SEC ?? 30),
  aiConcurrency: Number(process.env.AI_CONCURRENCY ?? 6),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90_000),
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterVisionModel:
    process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-3.1-flash-lite",
  openRouterImageModel:
    process.env.OPENROUTER_IMAGE_MODEL ??
    "google/gemini-3.1-flash-image-preview",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  demoAuthBypass: process.env.DEMO_AUTH_BYPASS === "true",
  /** Pass canvas drawings through as round references — no OpenRouter calls. */
  skipAi: process.env.SKIP_AI === "true",
};
