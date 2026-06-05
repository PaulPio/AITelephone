# AITelephone

Localhost demo for a cursed Gartic Phone-style drawing game.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

For phones on the same network, use the network URL printed by Vite, such as:

```text
http://YOUR-LAN-IP:5173/
```

For a public phone-friendly URL, run Cloudflare Tunnel in a separate terminal:

```bash
~/.local/bin/cloudflared tunnel --url http://localhost:3001
```

If the default QUIC tunnel seems to interfere with WiFi or internet access, force HTTP/2:

```bash
~/.local/bin/cloudflared tunnel --protocol http2 --url http://localhost:3001
```

## Current Demo

- Host creates a room and can also play.
- 2 to 10 players can join a room.
- Host can start the game, reset to lobby, and move through the reveal.
- Players can submit up to three prompt ideas before the game starts.
- Prompt choices exclude the player's own submitted prompts.
- Players alternate between drawing text prompts and describing mock AI images.
- The drawing canvas has brush, undo, clear, colors, and a bucket fill tool.
- The app uses Fal Flux Kontext for image-to-image generation when an API key is present.
- If Fal is not configured or generation fails, the app falls back to a mock AI image so the game keeps moving.
- Drawings and mock AI images are saved locally in `uploads/`.
- Room state is in memory, so restarting the server clears active games.

## AI Setup

Create a `.env` file with one of these keys:

```bash
FAL_KEY=your_fal_key
```

The server also accepts `FAL_API_KEY` or `API_KEY`.

To force the cheap mock generator even when a key exists:

```bash
MOCK_AI=true
```

The current model endpoint is:

```text
fal-ai/flux-pro/kontext
```

## Plain-Language Architecture

The browser is the game controller. It shows the host screen, player lobby, drawing canvas, description form, timer, and reveal.

The server is the referee. It creates rooms, tracks players, starts turns, assigns each player a chain, watches for submissions, and moves the game forward.

Socket.IO is the live connection. It tells browsers when players join, when a round starts, who has submitted, when mock generation is happening, and what to show during reveal.

HTTP upload is used for drawings. A player's canvas becomes a PNG, the browser posts it to the server, and the server saves it under `uploads/`.

The AI step uploads the player's drawing to Fal storage, calls Flux Kontext image-to-image, and returns the generated image URL. If that fails, the mock AI step creates a fake cursed render after each drawing. The next player describes that image, then another player draws from the new description.

Later, the mock AI function can be replaced with a real image-to-image API call while keeping the rest of the game flow the same.
