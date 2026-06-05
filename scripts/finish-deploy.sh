#!/usr/bin/env bash
# After Railway server is live, point Vercel at it and redeploy.
# Usage: ./scripts/finish-deploy.sh https://your-app.up.railway.app
set -euo pipefail
SERVER_URL="${1:?Usage: $0 https://your-server.up.railway.app}"
SERVER_URL="${SERVER_URL%/}"
WEB_URL="${2:-https://web-paulpios-projects.vercel.app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"
printf '%s' "$SERVER_URL" | npx vercel@latest env add VITE_API_URL production --force
printf '%s' "$SERVER_URL" | npx vercel@latest env add VITE_WS_URL production --force
printf '%s' "$WEB_URL" | npx vercel@latest env add VITE_PUBLIC_APP_URL production --force

echo "Redeploying web..."
npx vercel@latest --prod --yes

echo "Set on Railway: CORS_ORIGIN=$WEB_URL"
echo "Done. Host: $WEB_URL/play  API: $SERVER_URL"
