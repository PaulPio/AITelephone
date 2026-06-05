import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { GameEngine } from "./game/GameEngine.js";
import { drawingsRouter } from "./routes/drawings.js";
import { registerSocketHandlers } from "./socket/handlers.js";

const app = express();
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "drift-server", skipAi: config.skipAi });
});

app.use("/api/drawing", drawingsRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.corsOrigins, credentials: true },
});

const engine = new GameEngine(io);
registerSocketHandlers(io, engine);

httpServer.listen(config.port, "0.0.0.0", () => {
  console.log(`DRIFT server listening on 0.0.0.0:${config.port}`);
  if (config.skipAi) {
    console.log("SKIP_AI=true — canvas pass-through mode (no OpenRouter)");
  }
});
