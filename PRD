# DRIFT — AI Broken Telephone (Draw Edition)
### Product Requirements Document (Hackathon build)

*Working name; swap freely. Drawing-flavored options: Scribble Relay, Doodle Drift, Sketchphone.*

**One-liner:** A real-time party game — *broken telephone meets Pictionary, refereed by AI.* You're given a word and **30 seconds to draw it**. The AI turns your doodle into a polished image. The next player only sees that AI image and has 30 seconds to **redraw it by hand** — then the AI reinterprets *their* doodle, and so on around the room. At the end you reveal each chain and watch the meaning mutate through the human-doodle → AI-render → human-doodle loop.

**Build context:** 4-person team, ~4 hours, built in Cursor, must run a live demo. Played on phones (each player draws) + one shared "host" screen (projector/laptop).

---

## 1. Why this wins
- **Visual + hilarious.** Every link is an image, so the drift plays out *on screen*. The gap between a scrappy 30-second sketch and the AI's confident, ornate interpretation of it is the joke — and it repeats every hop.
- **Novel + timely.** It's Gartic Phone's beloved format, but the "AI turns your scribble into art" twist is fresh and immediately legible to judges.
- **Built for a team demo.** Four people drawing on their phones *are* the cast. Judges can scan a QR and join, making the demo a room-wide moment.
- **Finishable in 4 hours.** No database, no auth, no payments. In-memory state, one image-to-image API, websockets, a canvas, done.

**Judging alignment:** novelty (fresh AI twist on a known format), execution (real-time multiplayer drawing working live), usefulness (it's a game — fun *is* the metric), demo polish (a built-in crowd moment with a big visual payoff).

---

## 2. Goals & non-goals

**Goals (P0 — required for a working demo)**
- 4 players join a room from their phones via a short code (and ideally a QR).
- A full game runs end-to-end: each chain starts from a **given word**; players **draw**; the AI does **image-to-image** on each drawing; the next player **redraws** the AI image; repeat for the configured rounds.
- A responsive **touch drawing canvas** on phones (draw, undo, clear, submit) with a hard 30-second timer.
- A reveal that walks each chain link-by-link on the shared screen: word → doodle → AI image → doodle → AI image → … ending on **starting word vs. final AI image**.
- The game **never stalls**: timer auto-submits the current canvas (even if blank), and an AI failure falls back to a placeholder so a chain always advances.

**Non-goals (explicitly cut for 4 hours)**
- ❌ User accounts, persistence, or a database. State lives in server memory and dies with the game.
- ❌ A fancy drawing tool. One brush, maybe a couple of colors, undo, clear. No layers/shapes/fill.
- ❌ Perfect mobile coverage across every device. Target modern phones in portrait.
- ❌ Matchmaking or many concurrent rooms at scale.
- ❌ Native apps. It's a mobile web app.

---

## 3. Players & context of use
- **Optimal:** exactly 4 players (your team). **Supported:** 3–8. Logic generalizes to N players / N chains; lock N at game start.
- Co-located: phones are drawing surfaces, the shared screen is the stage for AI images and the reveal.
- Session length target: **3–5 minutes** start to reveal, to fit a demo slot.

---

## 4. Core game loop

A "chain" is one idea being garbled. With N players there are **N parallel chains**, each seeded with a different **given word**, so all players draw simultaneously and nobody waits.

**Link types alternate:** (system **WORD** seed) → human **DRAWING** → AI **IMAGE** → human **DRAWING** → AI **IMAGE** → …
Humans only ever *draw*. The AI only ever does *image-to-image*. Crucially, after round 1 a player **never sees the word or the previous doodle** — only the most recent AI image, which they must redraw from scratch.

**Round sequence (for 4 players, 4 rounds — all drawing rounds):**
1. **Round 1 (draw the word):** each player is shown a different chain's seed **word** and draws it (30s). → AI image-to-image on all 4 doodles in parallel.
2. **Round 2 (redraw the image):** each player is handed a *different* chain's latest **AI image** and redraws it by hand (30s). → 4 AI images.
3. **Round 3 (redraw):** rotate again, redraw the assigned AI image. → 4 AI images.
4. **Round 4 (redraw):** rotate again. → 4 final AI images.
5. **Reveal:** for each chain, animate the full sequence on the shared screen.

### 4.1 Rotation schedule (Latin square)
Assignment rule: **player index `i` (0-based) draws chain `(i + round − 1) mod N`.** This guarantees each player draws each chain exactly once and never repeats a chain.

| Round | P1 | P2 | P3 | P4 |
|------|----|----|----|----|
| R1 (word) | C1 | C2 | C3 | C4 |
| R2 | C2 | C3 | C4 | C1 |
| R3 | C3 | C4 | C1 | C2 |
| R4 | C4 | C1 | C2 | C3 |

Resulting contributor order for **chain C1**: word → `P1 → P4 → P3 → P2`. Every chain ends up with 1 seed word, 4 hand drawings, and 4 AI images (9 reveal links); the final link is the 4th AI image.

### 4.2 Round timing
- Draw timer: **30s** every round (configurable). A subtle warning at 5s left.
- On expiry, **auto-submit** the current canvas (blank is allowed — a blank canvas the AI then "interprets" is its own kind of funny). The round must always advance.
- AI generation runs between rounds, masked by a loading animation. Generate all N images **in parallel**.

### 4.3 Seed words
Bundle a curated list of ~50 fun, drawable prompts (mix of simple and absurd): e.g. *"a cat astronaut", "haunted lighthouse", "robot chef", "a dragon eating spaghetti", "surfing grandma"*. Each chain draws a distinct random word at game start.

---

## 5. Screens & UX

### 5.1 Player (phone) — mobile-first, portrait
1. **Join:** name + room code (or pre-filled from a QR deep link). Big "Join".
2. **Lobby:** player list; "Waiting for host to start…"
3. **Draw — two modes (the core screen):**
   - *Round 1 (word mode):* header "Draw this: **a cat astronaut**", canvas, 30s countdown, brush + undo + clear, "Submit".
   - *Later rounds (copy mode):* the previous **AI image** shown at top, header "Redraw what you see — you have 30s", same canvas controls. (Show the reference image for a few seconds, then optionally shrink it — don't let them trace forever; the imperfect memory is part of the fun.)
4. **Waiting between rounds:** "The AI is reimagining your drawing… 🤖🎨" loop; other players' submit status (✓).
5. **Done:** "You're done! Watch the big screen 🍿"

*Canvas requirements:* pointer/touch events, smooth lines (draw straight to canvas in an animation frame — do **not** re-render React per point), at least undo + clear, export to a downscaled PNG (~512px) for the AI step. Keep it instant; lag here kills the feel.
*Reconnection:* rejoin by re-entering the same name; dropped back into the current screen.

### 5.2 Host / shared screen — the stage
1. **Create room:** large **room code** + **QR** + join URL; live player list; "Start Game" (enabled at ≥3).
2. **Round status:** "Round 2 of 4 — drawing…", per-player ✓ indicators, big countdown.
3. **Generating:** "Reimagining 4 drawings…" shimmer.
4. **Reveal (the centerpiece):** chain-by-chain. For each chain animate: seed **word** card → first player's **doodle** → cross-fade to the **AI image** → next **doodle** → next **AI image** → … culminating in **starting word vs. final AI image** side-by-side. Label each link ("✏️ Alex drew" / "🤖 AI saw"). Host-controlled "Next", drumroll/whoosh SFX, big readable type. *This is where the laughs are — give it the most polish.*
5. **Awards (P1):** "Biggest Drift", "Most Cursed Render", "Best Doodle".

---

## 6. Technical architecture

**Recommended stack (optimized for "ship in 4 hours, in Cursor"):**
- **Client:** Vite + React + TypeScript. Two views: `/play` (phone, includes the canvas) and `/host` (shared screen). Mobile-first.
- **Server:** Node + Express + **Socket.IO**, same repo. **All game state in memory** (one `Room` object, or a `Map` of rooms). No DB.
- **Drawing transport:** canvas → downscaled PNG → **HTTP POST** to the server (keeps big payloads off the socket). Server stores it, runs the AI step, and broadcasts only the **resulting image URL**. Use sockets for control/turn signaling, HTTP for image bytes.
- **AI image step:** an **image-to-image / sketch-conditioned** endpoint (see §7) — *not* text-to-image. Call it **server-side** so keys never ship to the client.
- **LLM:** *optional* (e.g., an end-of-game "drift summary", or an AI stand-in player if short-handed). Not needed for P0.

**Hosting for the demo:** simplest reliable path — run the server locally and expose it via a tunnel (Cloudflare/ngrok) so phones connect over any network; or deploy server (Render/Railway/Fly) + static client. **Test on the venue's actual WiFi early.**

### 6.1 State machine
`LOBBY → DRAWING(round k) → GENERATING → DRAWING(round k+1) → GENERATING → … → REVEAL → GAME_OVER`
- Transitions fire on: all players submitted **or** timer expired.
- Server is the single source of truth; clients render whatever state they're told.

### 6.2 Data model (in-memory)
```
Room {
  code: string
  hostId: string
  state: GameState
  round: number            // 1..numRounds
  config: { numRounds, drawTimerSec, model, styleSuffix }
  players: Player[]
  chains: Chain[]
}
Player { id, name, connected }
Chain  { id, seedWord, links: Link[] }
Link   { type: 'word' | 'drawing' | 'image', authorId, content, createdAt }
        // content = the word, the drawing URL, or the AI image URL
```
- `assignment(round)` → `{ playerId: chainId }` via §4.1.
- Round 1 hands each player their assigned chain's **seedWord**; later rounds hand them the chain's **latest image link**.

### 6.3 Socket events + HTTP (the integration contract — agree first)
| Direction | Event / Route | Payload |
|-----------|---------------|---------|
| C→S | `createRoom` | `{ }` → `{ code }` |
| C→S | `joinRoom` | `{ code, name }` |
| C→S | `startGame` | `{ }` (host) |
| C→HTTP | `POST /api/drawing` | PNG (≈512px) → `{ drawingUrl }` |
| C→S | `submitDrawing` | `{ drawingUrl }` |
| C→S | `hostNext` | `{ }` (advance reveal) |
| S→C | `roomUpdate` | `{ players, state, round }` |
| S→C | `roundStart` | `{ type: 'word'\|'redraw', word?, image?, deadline }` |
| S→C | `generating` | `{ count }` |
| S→C | `revealStep` | `{ chainId, links }` |
| S→C | `gameOver` | `{ awards? }` |

---

## 7. The AI step (image-to-image) — get the "interpretation" right
This is the heart of the comedy, and the main tuning task. The AI should take a crude doodle and produce a **coherent, polished image that recognizably follows the lines but confidently invents a subject** — not a near-copy, and not something that ignores the drawing.

**Recommended approach:** **sketch/scribble-conditioned generation** — ControlNet *scribble* or *lineart* on the user's PNG, with a **generic style prompt and no semantic hint** (e.g. *"a detailed, vivid digital illustration, coherent subject, clean rendering"*). Withholding any description of *what* the doodle is forces the model to hallucinate a subject from the lines — that's where the funny misreadings come from. Tune the ControlNet weight (~0.7–0.9) so results are recognizable-but-transformed.

**Alternative (plain img2img):** if you only have an img2img endpoint, run it on the doodle with the same generic prompt at **strength ~0.65–0.8**. Higher strength → more AI invention (funnier drift); lower → more faithful (less drift). Tune live.

**Fallback (only if no image-conditioned endpoint is available):** vision-caption the doodle → text-to-image from the caption. This is the original mechanic's text-mediated path; it's less "cool" and reintroduces a hidden text link, so use it only as a backstop.

**Latency mitigations (the one real risk):**
1. Use a **fast** model (schnell/turbo-class, ideally with ControlNet) — a few seconds per image.
2. **Batch in parallel** (`Promise.all`) — all N images per round at once.
3. **Mask the wait** with the "AI is reimagining…" animation.
4. **Pre-warm** with one throwaway call at game start.
5. **Fail soft:** on error/timeout (cap ~15s) substitute a placeholder image so the chain never breaks.
6. **Fixed style suffix** on every call for a coherent visual set.

**Safety:** drawings are low-risk vs. typed prompts, but keep the provider's safety filter on; if you open it to the audience, add a quick review step.

---

## 8. The 4-hour plan & team split

**Roles**
- **Dev A — Realtime + game-state server.** Socket.IO, rooms, state machine, rotation, timers + auto-submit. The backbone.
- **Dev B — AI image-to-image service.** Endpoint integration, the doodle→image **tuning** (ControlNet weight / strength / style), parallel batch, pre-warm, timeout/fallback. The risk-owner.
- **Dev C — Player client + the drawing canvas.** Join → lobby → canvas (word mode + copy mode) → waiting → done. Smooth touch drawing + PNG export + reconnect. The other long-pole.
- **Dev D — Host screen + reveal + polish + demo.** The shared-screen stage and the reveal animation; owns the demo and the backup video.

**Hour-by-hour (240 min)**

| Time | What happens |
|------|--------------|
| **0:00–0:20** | **Kickoff & contract.** Whiteboard the state machine (§6.1), lock the events + `POST /api/drawing` shape (§6.3) and a shared `types.ts`, scaffold the repo, get the AI key into `.env`. All four now build in parallel against the contract. |
| **0:20–1:30** | **Sprint 1 — prove the two long-poles early.** A: room create/join + lobby + state skeleton + rotation. **B: one doodle → one coherent AI image, round-tripped, with the tuning roughly dialed (this is the make-or-break — do it first).** **C: a working canvas you can draw on and export as a 512px PNG, hitting `POST /api/drawing`.** D: host screen (code + QR + player list) + reveal page on **mock** chain data. |
| **1:30** | **Integration checkpoint #1:** a real player draws on a phone → PNG reaches the server → B's image step returns a URL. The full doodle→image hop works once. |
| **1:30–2:45** | **Sprint 2.** A: full round loop (word round → gen → redraw rounds with rotation → final), timers + auto-submit, emit `roundStart` with the right word/image per player. B: hook the AI step into the loop (batch N), pre-warm, loading polish, fallback. C: copy-mode draw screen (reference image + canvas + 30s) + waiting/done + reconnect. D: real reveal animation from real data (word→doodle→image→…) + "Next" + styling pass. |
| **2:45** | **Integration checkpoint #2:** full game playable start → reveal on the team's 4 phones. Hunt and kill breakages. |
| **2:45–3:30** | **Harden + fun.** Reveal transitions & SFX, "Biggest Drift" award, mobile canvas fixes, **verify auto-submit-on-timeout** so nothing stalls, error/timeout handling, seed-word list. Pre-generate a canned backup game. |
| **3:30–3:50** | **Rehearse.** Run it twice end-to-end on the **venue WiFi**. Screen-record a clean run as the fallback. Assign demo roles. |
| **3:50–4:00** | **Freeze.** Stop building. |

---

## 9. Scope tiers
- **P0 (must):** join by code; word round + redraw rounds with §4.1 rotation; responsive canvas with 30s auto-submit; image-to-image per drawing; reveal walking each chain (word → doodles ↔ AI images → final); host screen with code/QR. *A complete, winnable demo.*
- **P1 (if time):** QR deep-link join, loading/reveal SFX & animation polish, "Biggest Drift"/"Best Doodle" awards, reconnection, brush colors, reference-image auto-shrink.
- **P2 (stretch):** audience/judges join (N>4, dynamic chain count); downloadable image-strip of a chain to share; multiple art styles; AI-written drift summary; voting on the funniest chain.

---

## 10. Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| AI ignores the doodle or copies it too literally | ControlNet scribble at tuned weight (or img2img strength ~0.65–0.8) + generic, no-semantic prompt (§7); tune live |
| AI latency makes it drag | Fast model + parallel batch + masking animation + pre-warm (§7) |
| Canvas lags / feels bad on phone | Draw straight to canvas in an animation frame, no per-point React renders; keep brush simple |
| Player AFKs / disconnects | Auto-submit current canvas (even blank) on timer; rejoin-by-name |
| Venue WiFi / socket flakiness | Test on venue network early; local+tunnel option; broadcast URLs not image bytes |
| Live demo breaks | Pre-recorded backup video; the game is short enough to rerun |
| Scope creep | Strict P0/P1/P2; hard freeze at 3:30 |

---

## 11. Demo script (~80 seconds)
1. Host screen up: *"DRIFT — Pictionary broken-telephone, refereed by AI. Scan to join."* (Optionally pull in a judge.)
2. Round 1: the four of you get silly words and scribble for 30 seconds.
3. *"The AI turns each doodle into 'real' art — and now you only get to see the AI's version and redraw it. Watch it spiral."* A couple of fast redraw rounds.
4. **The reveal.** Walk one chain live: word → crude doodle → ornate AI render → wonkier doodle → confidently-wrong render → … Land the laugh on **starting word vs. final image**.
5. Close: *"Real-time, multiplayer, and the worse everyone draws, the better it gets."*

---

## 12. Decisions to lock in the first 5 minutes
- Which **image-to-image endpoint** do you have access to? (ControlNet-scribble preferred; img2img acceptable; caption→txt2img only as fallback.)
- **ControlNet weight / img2img strength** starting point and the **style suffix** string.
- **Local + tunnel** or **deploy**? (Either — decide and test on venue WiFi.)
- **Round count** — recommend **4** for 4 players.
- **Reference-image visibility** in copy mode — full-time, or shrink after a few seconds for more drift?
