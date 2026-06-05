export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "http://localhost:3001";
export const PUBLIC_APP_URL =
  import.meta.env.VITE_PUBLIC_APP_URL ?? "http://localhost:5173";
/** Matches server SKIP_AI — UI copy only; generation is disabled on the server. */
export const skipAiMode = import.meta.env.VITE_SKIP_AI === "true";
