import { toPublicRoom, type ClientToServerEvents, type ServerToClientEvents } from "@gartic-ai/shared";
import type { Server, Socket } from "socket.io";
import type { createGameEngine } from "../game/gameEngine";
import type { createRoomService } from "../game/roomService";
import type { RoomStore } from "../game/roomStore";
import { buildRoundStarts } from "../game/stateMachine";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type SocketDependencies = {
  io: AppServer;
  store: RoomStore;
  roomService: ReturnType<typeof createRoomService>;
  gameEngine: ReturnType<typeof createGameEngine>;
  autoSubmitDrawingUrl: string;
};

const roundTimers = new Map<string, NodeJS.Timeout>();

export function registerSocketHandlers({
  io,
  store,
  roomService,
  gameEngine,
  autoSubmitDrawingUrl
}: SocketDependencies): void {
  io.on("connection", (socket: AppSocket) => {
    socket.on("createRoom", async (_payload, ack) => {
      try {
        const created = await roomService.createRoom();
        socket.join(created.code);
        ack({ code: created.code, hostId: created.hostId });
        io.to(created.code).emit("roomUpdate", created.room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("joinRoom", async (payload, ack) => {
      try {
        const joined = await roomService.joinRoom(payload.code, payload.name);
        socket.join(payload.code.toUpperCase());
        socket.join(playerRoom(payload.code, joined.playerId));
        ack(joined);
        io.to(payload.code.toUpperCase()).emit("roomUpdate", joined.room);
        const room = await store.get(payload.code);
        if (room?.state === "DRAWING") {
          socket.emit("roundStart", buildRoundStarts(room)[joined.playerId]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to join room";
        ack({ error: message });
      }
    });

    socket.on("startGame", async (payload) => {
      try {
        await roomService.prepareSeeds(payload.code);
        const result = await gameEngine.startGame(payload.code, payload.hostId);
        io.to(payload.code.toUpperCase()).emit("roomUpdate", result.room);
        await emitRoundStarts(io, store, payload.code);
        scheduleAutoSubmit(io, store, gameEngine, payload.code, autoSubmitDrawingUrl);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("submitDrawing", async (payload) => {
      try {
        const result = await gameEngine.submitDrawing(payload.roomCode, payload.playerId, payload.drawingUrl);
        io.to(payload.roomCode.toUpperCase()).emit("roomUpdate", result.room);
        if (result.generated && result.room.state === "DRAWING") {
          await emitRoundStarts(io, store, payload.roomCode);
          scheduleAutoSubmit(io, store, gameEngine, payload.roomCode, autoSubmitDrawingUrl);
        }
        if (result.revealStep) {
          io.to(payload.roomCode.toUpperCase()).emit("revealStep", result.revealStep);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("hostNext", async (payload) => {
      try {
        const result = await gameEngine.advanceReveal(payload.code, payload.hostId);
        io.to(payload.code.toUpperCase()).emit("roomUpdate", result.room);
        if (result.revealStep) {
          io.to(payload.code.toUpperCase()).emit("revealStep", result.revealStep);
        } else if (result.room.state === "GAME_OVER") {
          io.to(payload.code.toUpperCase()).emit("gameOver", { room: result.room });
        }
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}

async function scheduleAutoSubmit(
  io: AppServer,
  store: RoomStore,
  gameEngine: ReturnType<typeof createGameEngine>,
  code: string,
  drawingUrl: string
): Promise<void> {
  const room = await store.get(code);
  if (!room?.deadline) {
    return;
  }

  const roomCode = code.toUpperCase();
  const existingTimer = roundTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = Math.max(0, new Date(room.deadline).getTime() - Date.now() + 250);
  const timer = setTimeout(async () => {
    try {
      const latestRoom = await store.get(roomCode);
      if (!latestRoom || latestRoom.state !== "DRAWING") {
        return;
      }
      const result = await gameEngine.autoSubmitMissing(roomCode, drawingUrl);
      io.to(roomCode).emit("roomUpdate", result.room);
      if (result.generated && result.room.state === "DRAWING") {
        await emitRoundStarts(io, store, roomCode);
        await scheduleAutoSubmit(io, store, gameEngine, roomCode, drawingUrl);
      }
      if (result.revealStep) {
        io.to(roomCode).emit("revealStep", result.revealStep);
      }
    } catch {
      // Timer callbacks cannot report to a specific socket; keep the process alive and wait for manual recovery.
    }
  }, delay);
  roundTimers.set(roomCode, timer);
}

async function emitRoundStarts(io: AppServer, store: RoomStore, code: string): Promise<void> {
  const room = await store.get(code);
  if (!room) {
    return;
  }
  const starts = buildRoundStarts(room);
  io.to(code.toUpperCase()).emit("roomUpdate", toPublicRoom(room));
  for (const player of room.players) {
    io.to(playerRoom(code, player.id)).emit("roundStart", starts[player.id]);
  }
}

function playerRoom(code: string, playerId: string): string {
  return `${code.toUpperCase()}:player:${playerId}`;
}

function emitError(socket: AppSocket, error: unknown): void {
  socket.emit("errorMessage", {
    message: error instanceof Error ? error.message : "Something went wrong"
  });
}
