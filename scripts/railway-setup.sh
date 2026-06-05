#!/usr/bin/env bash
# One-shot Railway setup: link project, sync env, deploy. Run after: railway login
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$HOME/.railway/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.railway/env"
elif [[ -f "/c/Users/paulr/.railway/env" ]]; then
  # shellcheck source=/dev/null
  source "/c/Users/paulr/.railway/env"
fi

RAILWAY="${RAILWAY:-railway}"
if ! command -v "$RAILWAY" >/dev/null 2>&1; then
  RAILWAY="npx @railway/cli@latest"
fi

echo "==> Checking Railway auth..."
if ! $RAILWAY whoami 2>/dev/null; then
  echo "Not logged in. In your own terminal run:"
  echo "  railway login"
  echo "Or set RAILWAY_TOKEN from Railway → Project → Settings → Tokens"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and fill keys."
  exit 1
fi

# Production CORS for Vercel (override localhost in .env for deploy)
export CORS_ORIGIN="${CORS_ORIGIN:-https://web-paulpios-projects.vercel.app}"

if [[ ! -f .railway/config.json ]] 2>/dev/null && [[ ! -d .railway ]]; then
  echo "==> Link this folder to your Railway project/service..."
  echo "    Choose: courageous-nature → AITelephone (or your server service)"
  $RAILWAY link
fi

echo "==> Syncing variables from .env (CORS_ORIGIN=$CORS_ORIGIN)..."
CORS_ORIGIN="$CORS_ORIGIN" bash "$ROOT/scripts/sync-railway-env.sh"

echo "==> Deploying (build + release)..."
$RAILWAY up --ci

echo ""
echo "==> Fetch public URL:"
$RAILWAY domain 2>/dev/null || true
echo ""
echo "Then wire Vercel:"
echo "  bash scripts/finish-deploy.sh https://YOUR-SERVICE.up.railway.app"
