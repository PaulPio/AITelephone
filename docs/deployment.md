# Deployment Guide

## Services

- Client: Vercel, deployed from the repo root with `vercel.json`.
- Server: Railway or Render, deployed from the repo root as a long-running Node process. Railway uses `railway.json`.
- State: Upstash Redis REST database.
- Images: Cloudflare R2 or S3-compatible bucket with a public base URL.
- AI: any image-to-image endpoint that accepts an image URL and returns an image URL.

Vercel Functions cannot host this app's Socket.IO server because they do not support acting as a WebSocket server. Keep the client on Vercel and deploy the server to Railway, Render, Fly, or another long-running Node host.

## Environment

Copy `.env.example` into each service provider and fill only the values needed there.

Client variables:

- `VITE_API_URL`: public server URL, for example `https://gartic-ai-server.up.railway.app`
- `VITE_SOCKET_URL`: same public server URL
- `VITE_JOIN_URL`: public client play URL, for example `https://your-app.vercel.app/play`

Server variables:

- `CLIENT_ORIGIN`: public Vercel client origin, for example `https://your-app.vercel.app`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `PUBLIC_ASSET_BASE_URL`
- `AI_ENDPOINT`
- `AI_API_KEY`
- `FALLBACK_IMAGE_URL`

## Deployment Order

1. Deploy the server to Railway or Render from the repo root.
2. Set the server's `CLIENT_ORIGIN` to the Vercel app origin once you know it.
3. Deploy the client to Vercel from the repo root.
4. Set Vercel's `VITE_API_URL` and `VITE_SOCKET_URL` to the public server URL.
5. Set Vercel's `VITE_JOIN_URL` to `https://<your-vercel-app>/play`.
6. Redeploy both services after changing environment variables.

## Smoke Test

1. Open `/host` on the deployed client and confirm a four-letter room code appears.
2. Scan the QR code from at least three phones and join from `/play`.
3. Start the game from the host screen.
4. Draw and submit on each phone.
5. Confirm images upload to the object bucket and Redis contains room state.
6. Let one phone time out to verify server auto-submit.
7. Confirm the host reveal shows the seed word, drawing links, and AI image links.

## Operations Notes

- Keep server instances at one replica until Socket.IO Redis adapter support is added.
- Redis room keys are TTL-backed and are intended for active or recent games, not permanent history.
- AI provider failure is non-fatal: the server returns `FALLBACK_IMAGE_URL` so the round can continue.
- If image URLs do not load on phones, check bucket public access or signed URL policy before debugging the canvas.
