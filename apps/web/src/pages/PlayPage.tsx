import { CLIENT_EVENTS, deriveRoundStartForPlayer } from "@drift/shared";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DrawCanvas } from "../components/DrawCanvas";
import { GamePageShell } from "../components/GamePageShell";
import { PageActions } from "../components/PageActions";
import { API_URL, skipAiMode } from "../lib/config";
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
  const navigate = useNavigate();
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
  const [, setTick] = useState(0);

  const { connected, room, roundStart, generating, emit } =
    useGameSocket(accessToken, name);

  const myPlayer = room?.players.find((p) => p.id === playerId);

  const effectiveRoundStart = useMemo(() => {
    if (roundStart) return roundStart;
    if (!room || !playerId) return null;
    return deriveRoundStartForPlayer(room, playerId, room.deadline);
  }, [roundStart, room, playerId]);

  const deadlineLeft = useMemo(() => {
    const deadline = effectiveRoundStart?.deadline ?? room?.deadline;
    if (!deadline) return null;
    const ms = new Date(deadline).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
  }, [effectiveRoundStart?.deadline, room?.deadline, room?.state]);

  useEffect(() => {
    const deadline = effectiveRoundStart?.deadline ?? room?.deadline;
    if (!deadline) return;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [effectiveRoundStart?.deadline, room?.deadline]);

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
    if (room?.state === "DRAWING" && !myPlayer?.submitted) {
      submitLock.current = false;
    }
  }, [room?.round, room?.state, myPlayer?.submitted]);

  const uploadAndSubmit = useCallback(
    async (blob: Blob) => {
      if (!room) return;
      if (!playerId) return;
      if (submitLock.current) return;
      if (room.state !== "DRAWING") return;
      if (myPlayer?.submitted) return;
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

        if (!data.drawingUrl) throw new Error("Upload returned no drawing URL");

        await emit(CLIENT_EVENTS.SUBMIT_DRAWING, {
          drawingUrl: data.drawingUrl,
        });
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Submit failed";
        setError(
          msg.includes("fetch") || msg === "Failed to fetch"
            ? "Could not reach server — check network or try again"
            : msg
        );
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
    },
    [room, playerId, accessToken, emit, myPlayer?.submitted]
  );

  const onExport = useCallback(
    (blob: Blob) => {
      void uploadAndSubmit(blob);
    },
    [uploadAndSubmit]
  );

  const goHome = () => {
    setJoined(false);
    setPlayerId(null);
    setError(null);
    saveDemoSession({ path: "/play", roomCode: "" });
    navigate("/");
  };

  if (!joined) {
    return (
      <div className="page">
        <h1>Join game</h1>
        <button type="button" className="home-link" onClick={goHome}>
          ← Back to home
        </button>
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
        <div className="card page-actions-card" style={{ marginTop: "1rem" }}>
          <PageActions onHome={goHome} />
        </div>
      </div>
    );
  }

  let content: ReactNode;

  if (room?.state === "LOBBY") {
    content = (
      <>
        <h1>Lobby</h1>
        <p className="muted">Room {room.code} · waiting for host…</p>
        <ul>
          {room.players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </>
    );
  } else if (generating || room?.state === "GENERATING") {
    const progress =
      generating && generating.count > 0
        ? `${generating.completed}/${generating.count}`
        : null;
    content = (
      <>
        <h1>{skipAiMode ? "Next round…" : "Reimagining…"}</h1>
        <p className="muted">
          {skipAiMode
            ? "Collecting drawings and starting the next round"
            : "AI is turning everyone's doodles into images"}
          {progress ? ` (${progress})` : ""}.
        </p>
        <p className="muted">Hang tight — the next round starts soon.</p>
      </>
    );
  } else if (room?.state === "DRAWING" && myPlayer?.submitted) {
    const others = room.players.filter((p) => !p.submitted).length;
    content = (
      <>
        <h1>Submitted ✓</h1>
        <p className="muted">
          Waiting for {others === 0 ? "the timer" : `${others} player${others === 1 ? "" : "s"}`}…
        </p>
      </>
    );
  } else if (room?.state === "REVEAL" || room?.state === "GAME_OVER") {
    content = (
      <>
        <h1>Done</h1>
        <p className="muted">Watch the big screen for the reveal.</p>
      </>
    );
  } else if (effectiveRoundStart && room?.state === "DRAWING") {
    content = (
      <>
        <p className="muted">
          Round {effectiveRoundStart.round}/{effectiveRoundStart.totalTurns} — draw now!
        </p>
        {effectiveRoundStart.type === "word" ? (
          <div className="word-prompt">Draw: {effectiveRoundStart.word}</div>
        ) : (
          <>
            <p className="label">
              {skipAiMode
                ? "Redraw what you see with your doodle"
                : "Copy this AI image with your doodle"}
            </p>
            {effectiveRoundStart.image && (
              <img
                className="ref-image"
                src={effectiveRoundStart.image}
                alt="Reference"
              />
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
        {error && <p style={{ color: "crimson", marginTop: "0.75rem" }}>{error}</p>}
      </>
    );
  } else {
    content = <p className="muted">Waiting for round…</p>;
  }

  return <GamePageShell onHome={goHome}>{content}</GamePageShell>;
}
