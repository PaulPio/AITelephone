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

| Service | Target | Status |
|---------|--------|--------|
| `apps/web` | **Vercel** (monorepo root `vercel.json`) | https://web-paulpios-projects.vercel.app |
| `apps/server` | **Railway** (`railway.toml` or `Dockerfile`) | needs `RAILWAY_TOKEN` |
| Database | Supabase **DRIFT** | hosted |

### Web (Vercel)

```bash
npx vercel@latest link --yes --project web   # from repo root
bash scripts/sync-vercel-env.sh
npx vercel@latest --prod --yes
```

### Server (Railway)

1. Create a project at [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** (`PaulPio/AITelephone`) *or* use CLI:
2. Project → **Settings → Tokens** → create token.
3. In a normal terminal (interactive):

```bash
export RAILWAY_TOKEN=your_project_token
bash scripts/sync-railway-env.sh
npx @railway/cli@latest up --ci
```

4. Copy the public HTTPS URL (e.g. `https://drift-production.up.railway.app`).
5. On Railway, set `CORS_ORIGIN=https://web-paulpios-projects.vercel.app`.
6. Finish wiring the web app:

```bash
bash scripts/finish-deploy.sh https://YOUR-RAILWAY-URL.up.railway.app
```

**GitHub Actions:** add repo secret `RAILWAY_TOKEN`, then run workflow **Deploy server to Railway**.

**Render alternative:** connect repo with root `render.yaml` if you prefer Render over Railway.

## Monorepo

- `packages/shared` — types, Latin square, seed words
- `apps/server` — game engine, sockets, AI pipeline
- `apps/web` — host + player UI (retro telephone theme)

See [PRD.md](./PRD.md) for full game design.
