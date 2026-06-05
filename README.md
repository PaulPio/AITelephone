# DRIFT — AI Broken Telephone (Draw Edition)

Real-time party game: draw a word, AI reimagines your doodle, next player redraws only the AI image — repeat until the chain drifts hilariously.

## Stack

- **Web** (`apps/web`): Vite + React → Vercel
- **Server** (`apps/server`): Express + Socket.IO → Railway
- **DB / Auth / Storage**: Supabase
- **AI**: OpenRouter (Gemini image + vision fallback), multi-step pipeline in `apps/server/src/ai/`

## Quick start (local)

1. Copy `.env.example` to `.env` and fill keys.
2. Supabase project **DRIFT** (`bheyteevxvktyxlenzkm`) — schema + storage applied via MCP.
3. Tables: `rooms`, `players`, `chains`, `links`. Storage buckets: **`drawings`**, **`ai-images`** (public).
4. Add **`SUPABASE_SERVICE_ROLE_KEY`** to `.env` from [Dashboard → API](https://supabase.com/dashboard/project/bheyteevxvktyxlenzkm/settings/api).
4. Install and build shared package:

```bash
npm install
npm run build -w @drift/shared
```

5. Dev (two terminals):

```bash
npm run dev:server
npm run dev:web
```

6. Open http://localhost:5173/host — create room, scan QR on http://localhost:5173/play?code=XXXX

### Demo auth (no email)

Set `DEMO_AUTH_BYPASS=true` on server and `VITE_DEMO_AUTH_BYPASS=true` on web for local testing without magic links.

## Deploy

| Service | Target |
|---------|--------|
| `apps/web` | Vercel — set `VITE_*` env vars |
| `apps/server` | Railway — `railway.toml`; set `OPENROUTER_*`, `SUPABASE_*`, `CORS_ORIGIN` |
| Database | Supabase hosted |

Point `VITE_WS_URL` and `VITE_API_URL` at your Railway URL.

## Monorepo

- `packages/shared` — types, Latin square, seed words
- `apps/server` — game engine, sockets, AI pipeline
- `apps/web` — host + player UI (retro telephone theme)

See [PRD.md](./PRD.md) for full game design.
