# AITelephone

DRIFT is a deployed-ready Gartic Phone variant where players draw on phones, an image-to-image model mutates each sketch into a cursed realistic image, and the host screen reveals the full chain.

## Stack

- `client/`: Vite + React + TypeScript, with `/play` for phones and `/host` for the shared screen.
- `server/`: Express + Socket.IO, Redis-backed room state, HTTP drawing upload, and server-side AI calls.
- `shared/`: TypeScript contracts and pure game helpers shared by client and server.
- Storage: Cloudflare R2 or any S3-compatible bucket.
- State: Upstash Redis.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/host` on a laptop and `http://localhost:5173/play` on phones or browser tabs.

## Verification

```bash
npm run test
npm run typecheck
npm run build
```

## Deployment

See [docs/deployment.md](docs/deployment.md) and copy `.env.example` into your deployment providers.