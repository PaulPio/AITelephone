import { Router } from "express";
import multer from "multer";
import { verifyAccessToken } from "../auth/verifyToken.js";
import { RoomRepository } from "../game/RoomRepository.js";
import { uploadDrawing } from "../storage/upload.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const repo = new RoomRepository();

export const drawingsRouter = Router();

drawingsRouter.post("/", upload.single("file"), async (req, res) => {
  try {
    const auth = await verifyAccessToken(req.headers.authorization?.replace("Bearer ", ""));
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const roomCode = String(req.body.roomCode ?? "");
    const playerId = String(req.body.playerId ?? "");
    if (!req.file) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    const room = await repo.loadRoomByCode(roomCode);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(403).json({ error: "Player not in room" });
      return;
    }

    const drawingUrl = await uploadDrawing(room.id, playerId, req.file.buffer);
    res.json({ drawingUrl });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" });
  }
});
