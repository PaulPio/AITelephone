import { Router } from "express";
import multer from "multer";
import type { UploadDrawingResponse } from "@gartic-ai/shared";
import type { ObjectStorage } from "../storage/objectStorage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function createDrawingRouter(storage: ObjectStorage): Router {
  const router = Router();

  router.post("/", upload.single("drawing"), async (request, response, next) => {
    try {
      const file = request.file;
      const roomCode = String(request.body.roomCode ?? "unknown").toUpperCase();
      const playerId = String(request.body.playerId ?? "anonymous");
      const chainId = String(request.body.chainId ?? "unassigned");

      if (!file) {
        response.status(400).json({ error: "drawing file is required" });
        return;
      }
      if (!allowedTypes.has(file.mimetype)) {
        response.status(415).json({ error: "drawing must be a PNG, JPEG, or WebP image" });
        return;
      }

      const extension = extensionFor(file.mimetype);
      const objectKey = `rooms/${roomCode}/drawings/${chainId}/${playerId}-${Date.now()}.${extension}`;
      const stored = await storage.putImage({
        key: objectKey,
        body: file.buffer,
        contentType: file.mimetype
      });
      const body: UploadDrawingResponse = { drawingUrl: stored.url, objectKey: stored.key };
      response.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function extensionFor(contentType: string): string {
  if (contentType === "image/jpeg") {
    return "jpg";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "png";
}
