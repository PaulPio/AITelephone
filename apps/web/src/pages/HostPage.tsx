import { CLIENT_EVENTS } from "@drift/shared";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageActions } from "../components/PageActions";
import { PUBLIC_APP_URL, skipAiMode } from "../lib/config";
import { buildHostProjectorView } from "../lib/hostProjector";
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

export function HostPage({ accessToken }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState("Host");
  const [minPlayers, setMinPlayers] = useState(2);
  const cached = demoAuthBypass ? loadDemoSession() : null;
  const [roomCreated, setRoomCreated] = useState(false);
  const [savedRoomCode, setSavedRoomCode] = useState(
    cached?.path === "/host" ? cached.roomCode : ""
  );
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRejoined = useRef(false);

  const { connected, room, generating, revealStep, emit } =
    useGameSocket(accessToken, name);

  const joinUrl = room
    ? `${PUBLIC_APP_URL}/play?code=${room.code}`
    : PUBLIC_APP_URL + "/play";

  const canStart = useMemo(() => {
    if (!room) return false;
    return room.players.length >= room.minPlayers;
  }, [room]);

  const rejoinRoom = async (roomCode: string, displayName: string) => {
    setError(null);
    setReconnecting(true);
    try {
      const res = await emit<{ roomId: string; playerId: string }>(
        CLIENT_EVENTS.JOIN_ROOM,
        { code: roomCode, name: displayName, accessToken }
      );
      saveDemoSession({
        path: "/host",
        roomCode: roomCode.toUpperCase(),
        displayName,
        playerId: res.playerId,
        minPlayers,
      });
      setRoomCreated(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reconnect failed";
      if (msg.includes("Room not found")) {
        clearDemoSession();
        setSavedRoomCode("");
      }
      setError(msg);
      throw e;
    } finally {
      setReconnecting(false);
    }
  };

  useEffect(() => {
    if (!demoAuthBypass) return;
    const session = loadDemoSession();
    if (session?.path !== "/host") return;
    if (session.displayName) setName(session.displayName);
    if (session.minPlayers) setMinPlayers(session.minPlayers);
    if (session.roomCode) setSavedRoomCode(session.roomCode);
  }, [demoAuthBypass]);

  useEffect(() => {
    if (
      !demoAuthBypass ||
      !connected ||
      room ||
      reconnecting ||
      autoRejoined.current
    ) {
      return;
    }
    const session = loadDemoSession();
    if (session?.path !== "/host" || session.roomCode.length < 4) return;
    autoRejoined.current = true;
    setRoomCreated(true);
    void rejoinRoom(session.roomCode, session.displayName || name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot host reconnect
  }, [demoAuthBypass, connected, room, reconnecting]);

  useEffect(() => {
    if (!room || !demoAuthBypass) return;
    saveDemoSession({
      path: "/host",
      roomCode: room.code,
      displayName: name,
      minPlayers: room.minPlayers,
    });
  }, [room?.code, room?.minPlayers, name, demoAuthBypass]);

  const createRoom = async () => {
    setError(null);
    try {
      const res = await emit<{ code: string; roomId: string; playerId: string }>(
        CLIENT_EVENTS.CREATE_ROOM,
        { minPlayers }
      );
      saveDemoSession({
        path: "/host",
        roomCode: res.code,
        displayName: name,
        playerId: res.playerId,
        minPlayers,
      });
      setRoomCreated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const startGame = async () => {
    setError(null);
    try {
      await emit(CLIENT_EVENTS.START_GAME, {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const hostNext = async () => {
    await emit(CLIENT_EVENTS.HOST_NEXT, {});
  };

  const goHome = () => {
    saveDemoSession({ path: "/host" });
    setRoomCreated(false);
    autoRejoined.current = false;
    navigate("/");
  };

  const startNewGame = async () => {
    autoRejoined.current = false;
    await createRoom();
  };

  const projector = useMemo(() => buildHostProjectorView(room), [room]);

  const currentReveal = useMemo(() => {
    if (revealStep) return revealStep;
    if (!room || room.state !== "REVEAL") return null;
    const chain =
      room.chains.find((c) => c.chainIndex === room.revealChainIndex) ??
      room.chains.find((c) => c.chainIndex === 0);
    if (!chain) return null;
    return {
      chainId: chain.id,
      chainIndex: chain.chainIndex,
      links: chain.links,
      chainCount: room.chains.length,
    };
  }, [revealStep, room]);

  return (
    <div className="page page-host">
      <h1>DRIFT — Host</h1>
      <button type="button" className="home-link" onClick={goHome}>
        ← Back to home
      </button>

      {reconnecting && !room && (
        <p className="muted" style={{ marginTop: "1rem" }}>
          {connected ? "Reconnecting to your room…" : "Connecting…"}
        </p>
      )}

      {!roomCreated && !room && (
        <div className="card">
          <label className="label">Host name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          {demoAuthBypass && savedRoomCode.length >= 4 && (
            <>
              <p className="muted" style={{ marginTop: "1rem" }}>
                Saved room <strong>{savedRoomCode}</strong> — edit your name, then reconnect.
              </p>
              <button
                type="button"
                className="btn"
                style={{ marginTop: "0.75rem", width: "100%" }}
                disabled={!connected || reconnecting || !name.trim()}
                onClick={() => void rejoinRoom(savedRoomCode, name.trim())}
              >
                {reconnecting ? "Reconnecting…" : `Reconnect to ${savedRoomCode}`}
              </button>
            </>
          )}
          <label className="label" style={{ marginTop: "1rem" }}>
            Min players to start (2–8)
          </label>
          <input
            className="input"
            type="number"
            min={2}
            max={8}
            value={minPlayers}
            onChange={(e) => setMinPlayers(Number(e.target.value))}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "1rem", width: "100%" }}
            disabled={!connected || !name.trim()}
            onClick={() => void createRoom()}
          >
            Create new room
          </button>
        </div>
      )}

      {room && (
        <>
          <div className="card" style={{ marginTop: "1rem", textAlign: "center" }}>
            <p className="muted">Room code</p>
            <div className="room-code">{room.code}</div>
            <div style={{ margin: "1rem auto", width: 160 }}>
              <QRCodeSVG value={joinUrl} size={160} />
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {joinUrl}
            </p>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <p>
              <strong>{room.players.length}</strong> / {room.maxPlayers} players · min{" "}
              {room.minPlayers} · {room.state}
              {room.round > 0 &&
                room.state !== "REVEAL" &&
                room.state !== "GAME_OVER" &&
                ` · turn ${room.round}/${room.config.numRounds}`}
            </p>
            {projector && (
              <div className="host-projector" style={{ marginTop: "1rem" }}>
                {projector.phase === "drawing" && (
                  <p>
                    Round {projector.round}/{projector.totalRounds} — everyone is
                    drawing ({projector.submittedCount}/{projector.playerCount}{" "}
                    submitted)
                  </p>
                )}
                {projector.phase === "generating" && (
                  <p style={{ marginTop: "0.5rem" }}>
                    {skipAiMode ? "Advancing round" : "Reimagining"}{" "}
                    {projector.playerCount} doodles… (round {projector.round}/
                    {projector.totalRounds})
                  </p>
                )}
              </div>
            )}
            <div className="player-grid" style={{ marginTop: "0.75rem" }}>
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className={`player-chip ${p.submitted ? "done" : ""}`}
                >
                  {p.name}
                  {p.submitted ? " ✓" : ""}
                </div>
              ))}
            </div>

            {room.state === "LOBBY" && (
              <>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: "1rem" }}
                  disabled={!canStart || !connected}
                  onClick={() => void startGame()}
                >
                  Start game
                </button>
                {!canStart && (
                  <p className="muted" style={{ marginTop: "0.5rem" }}>
                    Need {room.minPlayers} players to start ({room.players.length} joined).
                    Open /play on phones and join with code {room.code}.
                  </p>
                )}
              </>
            )}

            {!projector && generating && (
              <p style={{ marginTop: "1rem" }}>
                {skipAiMode
                  ? "Collecting drawings…"
                  : "AI is reimagining drawings…"}
                {generating.count > 0 &&
                  ` (${generating.completed}/${generating.count})`}
              </p>
            )}
          </div>

          {room.state === "REVEAL" && currentReveal && (
            <div className="card reveal-stage" style={{ marginTop: "1rem" }}>
              <h2>How it drifted</h2>
              {currentReveal.links.map((link, i) => {
                let stepLabel = "Step";
                if (link.type === "word") stepLabel = "Prompt";
                else if (link.type === "drawing") {
                  const drawNum = currentReveal.links
                    .slice(0, i + 1)
                    .filter((l) => l.type === "drawing").length;
                  stepLabel = `Player ${drawNum} drawing${link.authorName ? ` — ${link.authorName}` : ""}`;
                } else if (link.type === "image") {
                  const imgNum = currentReveal.links
                    .slice(0, i + 1)
                    .filter((l) => l.type === "image").length;
                  stepLabel = `AI after player ${imgNum}`;
                }
                return (
                <div key={link.id} style={{ textAlign: "center" }}>
                  <p className="muted">{stepLabel}</p>
                  {link.type === "word" ? (
                    <div className="word-prompt">{link.content}</div>
                  ) : link.content.startsWith("http") ||
                    link.content.startsWith("data:image") ? (
                    <img
                      className="reveal-media"
                      src={link.content}
                      alt={link.type}
                    />
                  ) : (
                    <p className="muted">Image unavailable</p>
                  )}
                </div>
              );
              })}
              <button type="button" className="btn" onClick={() => void hostNext()}>
                {currentReveal.chainIndex + 1 >= currentReveal.chainCount
                  ? "Finish"
                  : "Next chain"}
              </button>
            </div>
          )}

          {room.state === "GAME_OVER" ? (
            <div className="card" style={{ marginTop: "1rem" }}>
              <h2>Game over</h2>
              <p>Thanks for playing DRIFT.</p>
              <PageActions
                onNewGame={() => startNewGame()}
                onHome={goHome}
                newGameDisabled={!connected}
              />
            </div>
          ) : (
            <div className="card page-actions-card" style={{ marginTop: "1rem" }}>
              <PageActions
                onNewGame={() => startNewGame()}
                onHome={goHome}
                newGameDisabled={!connected}
              />
            </div>
          )}
        </>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
