#!/usr/bin/env bash
# Set Railway service variables from repo root .env (server keys only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ -f "$HOME/.railway/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.railway/env"
fi

RAILWAY="${RAILWAY:-railway}"
if ! command -v "$RAILWAY" >/dev/null 2>&1; then
  RAILWAY="npx @railway/cli@latest"
fi

KEYS=(
  PORT
  NODE_ENV
  CORS_ORIGIN
  OPENROUTER_API_KEY
  OPENROUTER_VISION_MODEL
  OPENROUTER_IMAGE_MODEL
  AI_CONCURRENCY
  AI_TIMEOUT_MS
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  DRAW_TIMER_SEC
  DEMO_AUTH_BYPASS
  SKIP_AI
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env"
  exit 1
fi

cd "$ROOT"

for key in "${KEYS[@]}"; do
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -1 || true)
  [[ -z "$line" ]] && continue
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  [[ -z "$value" ]] && continue
  echo "Setting Railway $key..."
  npx @railway/cli@latest variables set "${key}=${value}" --service "${RAILWAY_SERVICE:-}" 2>/dev/null || \
    npx @railway/cli@latest variables set "${key}=${value}"
done

echo "Railway variables synced."
