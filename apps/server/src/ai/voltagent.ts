/**
 * VoltAgent-style multi-agent orchestration for DRIFT.
 * Agents: Render (primary), Vision (fallback caption), batch supervisor via generateBatch.
 * Implemented with @openrouter/ai-sdk-provider + AI SDK (see driftImagePipeline.ts).
 */
export { transformDoodle, prewarm } from "./driftImagePipeline.js";
