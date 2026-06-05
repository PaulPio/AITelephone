import { S3Client } from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@gartic-ai/shared";
import { createDrawingRouter } from "./api/drawing";
import { createHttpImageProvider, createImageToImagePipeline } from "./ai/imageToImage";
import { loadConfig } from "./config";
import { createGameEngine } from "./game/gameEngine";
import { createRoomService } from "./game/roomService";
import { MemoryRoomStore, RedisRoomStore } from "./game/roomStore";
import { registerSocketHandlers } from "./socket/handlers";
import { MemoryObjectStorage, S3ObjectStorage } from "./storage/objectStorage";

const config = loadConfig();
const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

const storage =
  config.s3Bucket && config.s3AccessKeyId && config.s3SecretAccessKey
    ? new S3ObjectStorage(
        new S3Client({
          endpoint: config.s3Endpoint,
          region: config.s3Region,
          credentials: {
            accessKeyId: config.s3AccessKeyId,
            secretAccessKey: config.s3SecretAccessKey
          },
          forcePathStyle: Boolean(config.s3Endpoint)
        }),
        config.s3Bucket,
        config.publicAssetBaseUrl
      )
    : new MemoryObjectStorage(config.publicAssetBaseUrl);

const roomStore =
  config.redisUrl && config.redisToken
    ? new RedisRoomStore(
        new Redis({ url: config.redisUrl, token: config.redisToken }),
        config.roomTtlSeconds
      )
    : new MemoryRoomStore();

const imageProvider =
  config.aiEndpoint && config.aiApiKey
    ? createHttpImageProvider(config.aiEndpoint, config.aiApiKey)
    : async () => ({ imageUrl: config.fallbackImageUrl });
const imagePipeline = createImageToImagePipeline({
  fallbackImageUrl: config.fallbackImageUrl,
  timeoutMs: config.aiTimeoutMs,
  provider: imageProvider
});
const roomService = createRoomService(roomStore);
const gameEngine = createGameEngine(roomStore, imagePipeline);

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/fallback-cursed.svg", (_request, response) => {
  response.type("image/svg+xml").send(`
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#140f18"/>
  <circle cx="512" cy="430" r="210" fill="#f4e6cf"/>
  <circle cx="430" cy="390" r="35" fill="#140f18"/>
  <circle cx="600" cy="390" r="35" fill="#140f18"/>
  <path d="M390 560 Q512 710 640 560" fill="none" stroke="#140f18" stroke-width="38" stroke-linecap="round"/>
  <text x="512" y="875" text-anchor="middle" fill="#f05d5e" font-family="monospace" font-size="54">AI DREAM FAILED SO THIS THING ARRIVED</text>
</svg>`);
});

app.use("/api/drawing", createDrawingRouter(storage));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: config.clientOrigin,
    credentials: true
  }
});

registerSocketHandlers({
  io,
  store: roomStore,
  roomService,
  gameEngine,
  autoSubmitDrawingUrl: config.fallbackImageUrl
});

httpServer.listen(config.port, () => {
  console.log(`Gartic AI server listening on ${config.port}`);
});
