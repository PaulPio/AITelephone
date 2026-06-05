#!/usr/bin/env bash
# Sync VITE_* vars from repo root .env to Vercel (production).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"
WEB_DIR="${ROOT}/apps/web"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env at $ENV_FILE"
  exit 1
fi

cd "$WEB_DIR"

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  if [[ ! "$line" =~ ^(VITE_[A-Za-z0-9_]+)= ]]; then
    continue
  fi
  key="${line%%=*}"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  echo "Setting $key (production)..."
  printf '%s' "$value" | npx vercel@latest env add "$key" production --force 2>/dev/null || \
    printf '%s' "$value" | npx vercel@latest env add "$key" production --yes --force
done < "$ENV_FILE"

echo "Done. Run: cd apps/web && npx vercel@latest --prod --yes"
