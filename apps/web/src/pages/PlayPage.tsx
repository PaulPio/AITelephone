import { CLIENT_EVENTS, type TurnWaitingPayload } from "@drift/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DrawCanvas } from "../components/DrawCanvas";
import { API_URL } from "../lib/config";
import {
  clearDemoSession,
  loadDemoSession,
  saveDemoSession,
} from "../lib/demoSession";
import { demoAuthBypass } from "../lib/supabase";
import { useGameSocket } from "../hooks/useGameSocket";

type Props = {
  accessToken: string;
  email: string;
};

export function PlayPage({ accessToken, email }: Props) {
  const [params] = useSearchParams();
  const cached = demoAuthBypass ? loadDemoSession() : null;
  const codeFromUrl = params.get("code") ?? "";
  const [name, setName] = useState(
    cached?.displayName ?? email.split("@")[0] ?? "Player"
  );
  const [code, setCode] = useState(
    codeFromUrl || (cached?.path === "/play" ? cached.roomCode : "") || ""
  );
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [exportTrigger, setExportTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const { connected, room, roundStart, turnWaiting, generating, aiImageReady, emit } =
    useGameSocket(accessToken, name);

  const isMyTurn =
    Boolean(room?.config.activePlayerId && playerId === room.config.activePlayerId);

  const deadlineLeft = useMemo(() => {
    if (!roundStart?.deadline) return null;
    const ms = new Date(roundStart.deadline).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
  }, [roundStart?.deadline, room?.state]);

  useEffect(() => {
    if (!roundStart?.deadline) return;
    const id = setInterval(() => {}, 500);
    return () => clearInterval(id);
  }, [roundStart?.deadline]);

  const join = async () => {
    setError(null);
    try {
      const displayName = name.trim();
      const res = await emit<{ roomId: string; playerId: string }>(
        CLIENT_EVENTS.JOIN_ROOM,
        {
          code: code.toUpperCase(),
          name: displayName,
          accessToken,
        }
      );
      setPlayerId(res.playerId);
      setJoined(true);
      if (demoAuthBypass) {
        saveDemoSession({
          path: "/play",
          roomCode: code.toUpperCase(),
          displayName: displayName,
          playerId: res.playerId,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Join failed";
      if (demoAuthBypass && msg.includes("Room not found")) clearDemoSession();
      setError(msg);
    }
  };

  useEffect(() => {
    if (!demoAuthBypass) return;
    const session = loadDemoSession();
    const roomCode = (codeFromUrl || session?.roomCode || "").toUpperCase();
    if (roomCode.length >= 4) setCode(roomCode);
    if (session?.path === "/play" && session.displayName) {
      setName(session.displayName);
    }
  }, [demoAuthBypass, codeFromUrl]);

  useEffect(() => {
    if (!room || !demoAuthBypass) return;
    saveDemoSession({
      path: "/play",
      roomCode: room.code,
      displayName: name,
      playerId: playerId ?? undefined,
    });
  }, [room?.code, name, playerId, demoAuthBypass]);

  useEffect(() => {
    if (room?.state === "DRAWING" && isMyTurn) {
      submitLock.current = false;
    }
  }, [room?.round, room?.state, isMyTurn]);

  const uploadAndSubmit = useCallback(
    async (blob: Blob) => {
      if (!room) return;
      if (!playerId) return;
      if (submitLock.current || submitting) return;
      if (room.state !== "DRAWING" || !isMyTurn) return;
      submitLock.current = true;
      setSubmitting(true);
      try {
        const form = new FormData();
        form.append("file", blob, "drawing.png");
        form.append("roomCode", room.code);
        form.append("playerId", playerId);

        const res = await fetch(`${API_URL}/api/drawing`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        const data = (await res.json()) as { drawingUrl?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Upload failed");

        await emit(CLIENT_EVENTS.SUBMIT_DRAWING, {
          drawingUrl: data.drawingUrl,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
    },
    [room, playerId, accessToken, emit, submitting, isMyTurn]
  );

  const onExport = useCallback(
    (blob: Blob) => {
      void uploadAndSubmit(blob);
    },
    [uploadAndSubmit]
  );

  if (!joined) {
    return (
      <div className="page">
        <h1>Join game</h1>
        <div className="card">
          <label className="label">Display name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="label" style={{ marginTop: "1rem" }}>
            Room code
          </label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
          />
          {demoAuthBypass && code.length >= 4 && (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Edit your name, then tap Join to enter the room.
            </p>
          )}
          <button
            type="button"
            className="btn"
            style={{ marginTop: "1rem", width: "100%" }}
            disabled={!connected || code.length < 4 || !name.trim()}
            onClick={() => void join()}
          >
            {connected ? "Join" : "Connecting…"}
          </button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </div>
      </div>
    );
  }

  if (room?.state === "LOBBY") {
    return (
      <div className="page">
        <h1>Lobby</h1>
        <p className="muted">Room {room.code} · waiting for host…</p>
        <ul>
          {room.players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (generating || room?.state === "GENERATING") {
    const who =
      turnWaiting?.activePlayerName ??
      room?.players.find((p) => p.id === room.config.activePlayerId)?.name;
    return (
      <div className="page">
        <h1>{aiImageReady ? "AI result" : "Reimagining…"}</h1>
        {!aiImageReady && (
          <p className="muted">
            AI is turning {who ? `${who}'s` : "the"} doodle into an image.
          </p>
        )}
        {aiImageReady && (
          <img
            className="ref-image"
            src={aiImageReady.imageUrl}
            alt="AI reimagining"
          />
        )}
      </div>
    );
  }

  if (
    room?.state === "DRAWING" &&
    !roundStart &&
    (turnWaiting || (room.config.activePlayerId && !isMyTurn))
  ) {
    const wait: TurnWaitingPayload = turnWaiting ?? {
      round: room.round,
      totalTurns: room.config.numRounds,
      activePlayerId: room.config.activePlayerId ?? "",
      activePlayerName:
        room.players.find((p) => p.id === room.config.activePlayerId)?.name ??
        "Someone",
      promptType: "redraw",
    };
    return (
      <div className="page">
        <h1>Wait your turn</h1>
        <p className="muted">
          {wait.activePlayerName} is drawing ({wait.round}/{wait.totalTurns})
        </p>
        {wait.promptType === "word" && wait.word && (
          <p className="muted">Prompt: {wait.word}</p>
        )}
        {wait.promptType === "redraw" && wait.image && (
          <img className="ref-image" src={wait.image} alt="Reference" />
        )}
      </div>
    );
  }

  if (room?.state === "REVEAL" || room?.state === "GAME_OVER") {
    return (
      <div className="page">
        <h1>Done</h1>
        <p className="muted">Watch the big screen for the reveal.</p>
      </div>
    );
  }

  if (roundStart && room?.state === "DRAWING" && isMyTurn) {
    return (
      <div className="page">
        <p className="muted">
          Your turn ({roundStart.round}/{roundStart.totalTurns})
        </p>
        {roundStart.type === "word" ? (
          <div className="word-prompt">Draw: {roundStart.word}</div>
        ) : (
          <>
            <p className="label">Copy this AI image with your doodle</p>
            {roundStart.image && (
              <img className="ref-image" src={roundStart.image} alt="Reference" />
            )}
          </>
        )}
        {deadlineLeft !== null && (
          <p className="countdown" style={{ margin: "0.75rem 0" }}>
            {deadlineLeft}s
          </p>
        )}
        <DrawCanvas onExport={onExport} exportTrigger={exportTrigger} />
        <button
          type="button"
          className="btn"
          style={{ marginTop: "1rem", width: "100%" }}
          disabled={submitting}
          onClick={() => setExportTrigger((n) => n + 1)}
        >
          {submitting ? "Submitting…" : "Submit drawing"}
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="muted">Waiting for round…</p>
    </div>
  );
}
