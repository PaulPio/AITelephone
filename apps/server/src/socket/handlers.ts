import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type SubmitDrawingPayload,
} from "@drift/shared";
import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/verifyToken.js";
import { GameEngine } from "../game/GameEngine.js";
import { RoomRepository } from "../game/RoomRepository.js";

const repo = new RoomRepository();

export function registerSocketHandlers(io: Server, engine: GameEngine) {
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string }).token ??
      socket.handshake.headers.authorization?.replace("Bearer ", "");
    const auth = await verifyAccessToken(token);
    if (!auth) {
      next(new Error("Unauthorized"));
      return;
    }
    (socket.data as { authUserId: string }).authUserId = auth.userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const authUserId = (socket.data as { authUserId: string }).authUserId;

    socket.on(CLIENT_EVENTS.CREATE_ROOM, async (payload: CreateRoomPayload, ack) => {
      try {
        const name =
          (socket.handshake.auth as { name?: string }).name ?? "Host";
        const { room, playerId } = await engine.createRoom(
          authUserId,
          name,
          payload.minPlayers
        );
        (socket.data as { playerId: string; roomId: string }).playerId = playerId;
        (socket.data as { roomId: string }).roomId = room.id;
        await repo.setPlayerSocket(playerId, socket.id);
        socket.join(`room:${room.id}`);
        ack?.({ code: room.code, roomId: room.id, playerId });
        await engine.broadcastRoom(room.id);
      } catch (e) {
        ack?.({ error: e instanceof Error ? e.message : "Failed" });
      }
    });

    socket.on(CLIENT_EVENTS.JOIN_ROOM, async (payload: JoinRoomPayload, ack) => {
      try {
        const { room, playerId, isHost } = await engine.joinRoom(
          payload.code,
          authUserId,
          payload.name
        );
        (socket.data as { playerId: string; roomId: string }).playerId = playerId;
        (socket.data as { roomId: string }).roomId = room.id;
        await repo.setPlayerSocket(playerId, socket.id);
        socket.join(`room:${room.id}`);
        ack?.({ roomId: room.id, playerId, isHost });
        await engine.broadcastRoom(room.id);
      } catch (e) {
        ack?.({ error: e instanceof Error ? e.message : "Failed" });
      }
    });

    socket.on(CLIENT_EVENTS.START_GAME, async (_payload, ack) => {
      try {
        const { roomId, playerId } = socket.data as {
          roomId?: string;
          playerId?: string;
        };
        if (!roomId || !playerId) throw new Error("Not in a room");
        await engine.startGame(roomId, playerId);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: e instanceof Error ? e.message : "Failed" });
        socket.emit(SERVER_EVENTS.ERROR, {
          message: e instanceof Error ? e.message : "Failed",
        });
      }
    });

    socket.on(
      CLIENT_EVENTS.SUBMIT_DRAWING,
      async (payload: SubmitDrawingPayload, ack) => {
        try {
          const { roomId, playerId } = socket.data as {
            roomId?: string;
            playerId?: string;
          };
          if (!roomId || !playerId) throw new Error("Not in a room");
          await engine.submitDrawing(roomId, playerId, payload.drawingUrl);
          ack?.({ ok: true });
        } catch (e) {
          ack?.({ error: e instanceof Error ? e.message : "Failed" });
        }
      }
    );

    socket.on(CLIENT_EVENTS.HOST_NEXT, async (_payload, ack) => {
      try {
        const { roomId, playerId } = socket.data as {
          roomId?: string;
          playerId?: string;
        };
        if (!roomId || !playerId) throw new Error("Not in a room");
        await engine.hostNext(roomId, playerId);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: e instanceof Error ? e.message : "Failed" });
      }
    });

    socket.on("disconnect", async () => {
      const { playerId } = socket.data as { playerId?: string };
      if (playerId) await repo.setPlayerSocket(playerId, null);
    });
  });
}
