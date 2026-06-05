export const config = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  drawTimerSec: Number(process.env.DRAW_TIMER_SEC ?? 30),
  aiConcurrency: Number(process.env.AI_CONCURRENCY ?? 6),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 15000),
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterVisionModel:
    process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-3.1-flash-lite",
  openRouterImageModel:
    process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  demoAuthBypass: process.env.DEMO_AUTH_BYPASS === "true",
};
