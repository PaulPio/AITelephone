import { CLIENT_EVENTS } from "@drift/shared";
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
  const pendingRejoin = Boolean(
    cached?.path === "/play" && cached.roomCode.length >= 4
  );
  const rejoinAttempted = useRef(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [exportTrigger, setExportTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { connected, room, roundStart, generating, emit } = useGameSocket(
    accessToken,
    name
  );

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
      const res = await emit<{ roomId: string; playerId: string }>(
        CLIENT_EVENTS.JOIN_ROOM,
        {
          code: code.toUpperCase(),
          name,
          accessToken,
        }
      );
      setPlayerId(res.playerId);
      setJoined(true);
      if (demoAuthBypass) {
        saveDemoSession({
          path: "/play",
          roomCode: code.toUpperCase(),
          displayName: name,
          playerId: res.playerId,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed");
    }
  };

  useEffect(() => {
    if (!demoAuthBypass || !connected || joined || rejoinAttempted.current) return;
    const session = loadDemoSession();
    const roomCode = (codeFromUrl || code || session?.roomCode || "").toUpperCase();
    if (session?.path !== "/play" || roomCode.length < 4) return;
    rejoinAttempted.current = true;
    if (session.displayName) setName(session.displayName);
    setCode(roomCode);
    void (async () => {
      setError(null);
      try {
        const res = await emit<{ roomId: string; playerId: string }>(
          CLIENT_EVENTS.JOIN_ROOM,
          { code: roomCode, name: session.displayName || name, accessToken }
        );
        setPlayerId(res.playerId);
        setJoined(true);
        saveDemoSession({
          path: "/play",
          roomCode,
          displayName: session.displayName || name,
          playerId: res.playerId,
        });
      } catch (e) {
        rejoinAttempted.current = false;
        const msg = e instanceof Error ? e.message : "Rejoin failed";
        if (msg.includes("Room not found")) clearDemoSession();
        setError(msg);
      }
    })();
  }, [connected, joined, demoAuthBypass, codeFromUrl, code, accessToken, name, emit]);

  useEffect(() => {
    if (!room || !demoAuthBypass) return;
    saveDemoSession({
      path: "/play",
      roomCode: room.code,
      displayName: name,
      playerId: playerId ?? undefined,
    });
  }, [room?.code, name, playerId, demoAuthBypass]);

  const uploadAndSubmit = useCallback(
    async (blob: Blob) => {
      if (!room) return;
      if (!playerId) return;
      setSubmitting(true);
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
      setSubmitting(false);
    },
    [room, playerId, accessToken, emit]
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
          <button
            type="button"
            className="btn"
            style={{ marginTop: "1rem", width: "100%" }}
            disabled={!connected || code.length < 4 || pendingRejoin}
            onClick={() => void join()}
          >
            {pendingRejoin && connected
              ? "Rejoining…"
              : connected
                ? "Join"
                : "Connecting…"}
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
    return (
      <div className="page">
        <h1>Reimagining…</h1>
        <p className="muted">The AI is interpreting your doodle.</p>
        {generating && (
          <p className="countdown">
            {generating.completed}/{generating.count}
          </p>
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

  if (roundStart && room?.state === "DRAWING") {
    return (
      <div className="page">
        {roundStart.type === "word" ? (
          <div className="word-prompt">Draw: {roundStart.word}</div>
        ) : (
          <>
            <p className="label">Redraw what you see</p>
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
