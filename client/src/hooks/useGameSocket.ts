import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  JoinRoomAck,
  PublicRoom,
  RevealStepPayload,
  RoundStartPayload,
  ServerToClientEvents
} from "@gartic-ai/shared";
import { SOCKET_URL } from "../env";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useGameSocket() {
  const socket = useMemo<AppSocket>(() => io(SOCKET_URL, { transports: ["websocket", "polling"] }), []);
  const [room, setRoom] = useState<PublicRoom>();
  const [round, setRound] = useState<RoundStartPayload>();
  const [revealStep, setRevealStep] = useState<RevealStepPayload>();
  const [error, setError] = useState<string>();
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setError(undefined);
    };
    const handleDisconnect = () => setIsConnected(false);
    const handleConnectError = () => {
      setIsConnected(false);
      setError("Game server is still starting. Retrying...");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("roomUpdate", setRoom);
    socket.on("roundStart", setRound);
    socket.on("revealStep", setRevealStep);
    socket.on("gameOver", ({ room }) => setRoom(room));
    socket.on("errorMessage", ({ message }) => setError(message));
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("roomUpdate", setRoom);
      socket.off("roundStart", setRound);
      socket.off("revealStep", setRevealStep);
      socket.off("gameOver");
      socket.off("errorMessage");
      socket.disconnect();
    };
  }, [socket]);

  const createRoom = useCallback(
    () =>
      new Promise<{ code: string; hostId: string }>((resolve) => {
        socket.emit("createRoom", {}, resolve);
      }),
    [socket]
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      new Promise<JoinRoomAck>((resolve, reject) => {
        socket.emit("joinRoom", { code, name }, (response) => {
          if ("error" in response) {
            reject(new Error(response.error));
          } else {
            setRoom(response.room);
            resolve(response);
          }
        });
      }),
    [socket]
  );

  return {
    socket,
    room,
    round,
    revealStep,
    isConnected,
    error,
    clearError: () => setError(undefined),
    createRoom,
    joinRoom
  };
}
