import {
  SERVER_EVENTS,
  type AiImageReadyPayload,
  type GeneratingPayload,
  type RevealStepPayload,
  type RoomSnapshot,
  type RoundStartPayload,
  type TurnWaitingPayload,
} from "@drift/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WS_URL } from "../lib/config";

export function useGameSocket(accessToken: string | null, displayName: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roundStart, setRoundStart] = useState<RoundStartPayload | null>(null);
  const [turnWaiting, setTurnWaiting] = useState<TurnWaitingPayload | null>(null);
  const [generating, setGenerating] = useState<GeneratingPayload | null>(null);
  const [aiImageReady, setAiImageReady] = useState<AiImageReadyPayload | null>(
    null
  );
  const [revealStep, setRevealStep] = useState<RevealStepPayload | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(WS_URL, {
      auth: { token: accessToken, name: displayName },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on(SERVER_EVENTS.ROOM_UPDATE, (payload: { room: RoomSnapshot }) => {
      setRoom(payload.room);
    });

    socket.on(SERVER_EVENTS.ROUND_START, (payload: RoundStartPayload) => {
      setRoundStart(payload);
      setTurnWaiting(null);
      setGenerating(null);
      setAiImageReady(null);
    });

    socket.on(SERVER_EVENTS.TURN_WAITING, (payload: TurnWaitingPayload) => {
      setTurnWaiting(payload);
      setRoundStart(null);
    });

    socket.on(SERVER_EVENTS.GENERATING, (payload: GeneratingPayload) => {
      setGenerating(payload);
      setRoundStart(null);
      setTurnWaiting(null);
      setAiImageReady(null);
    });

    socket.on(SERVER_EVENTS.AI_IMAGE_READY, (payload: AiImageReadyPayload) => {
      setAiImageReady(payload);
    });

    socket.on(SERVER_EVENTS.REVEAL_STEP, (payload: RevealStepPayload) => {
      setRevealStep(payload);
    });

    socket.on(SERVER_EVENTS.GAME_OVER, (payload: { room: RoomSnapshot }) => {
      setRoom(payload.room);
      setRoundStart(null);
      setTurnWaiting(null);
      setGenerating(null);
      setAiImageReady(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, displayName]);

  const emit = useCallback(
    <T>(event: string, payload?: unknown): Promise<T> =>
      new Promise((resolve, reject) => {
        const s = socketRef.current;
        if (!s?.connected) {
          reject(new Error("Not connected"));
          return;
        }
        s.emit(event, payload ?? {}, (response: T & { error?: string }) => {
          if (response && typeof response === "object" && "error" in response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      }),
    []
  );

  return {
    socket: socketRef,
    connected,
    room,
    roundStart,
    turnWaiting,
    generating,
    aiImageReady,
    revealStep,
    emit,
    setRoom,
    setRevealStep,
  };
}
