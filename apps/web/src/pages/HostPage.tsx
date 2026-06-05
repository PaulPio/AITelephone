import { CLIENT_EVENTS } from "@drift/shared";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { PUBLIC_APP_URL } from "../lib/config";
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
  const [name, setName] = useState("Host");
  const [minPlayers, setMinPlayers] = useState(3);
  const cached = demoAuthBypass ? loadDemoSession() : null;
  const [roomCreated, setRoomCreated] = useState(false);
  const [savedRoomCode, setSavedRoomCode] = useState(
    cached?.path === "/host" ? cached.roomCode : ""
  );
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { connected, room, generating, aiImageReady, revealStep, turnWaiting, emit } =
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
            Min players to start (3–8)
          </label>
          <input
            className="input"
            type="number"
            min={3}
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
                  <>
                    <p>
                      <strong>{projector.activePlayerName}</strong> is drawing (
                      {projector.round}/{projector.totalTurns})
                    </p>
                    {projector.promptType === "word" && (
                      <div className="word-prompt" style={{ marginTop: "0.75rem" }}>
                        Draw: {projector.word}
                      </div>
                    )}
                    {projector.promptType === "redraw" &&
                      (projector.imageUrl ? (
                        <>
                          <p className="label" style={{ marginTop: "0.75rem" }}>
                            Copy this AI image
                          </p>
                          <img
                            className="ref-image"
                            src={projector.imageUrl}
                            alt="AI reference"
                          />
                        </>
                      ) : (
                        <p className="muted" style={{ marginTop: "0.75rem" }}>
                          Waiting for AI reference image…
                        </p>
                      ))}
                  </>
                )}
                {projector.phase === "generating" && (
                  <>
                    <p style={{ marginTop: "0.5rem" }}>
                      AI is reimagining <strong>{projector.activePlayerName}</strong>
                      &apos;s doodle…
                    </p>
                    {projector.drawingUrl && (
                      <img
                        className="ref-image"
                        src={projector.drawingUrl}
                        alt="Submitted doodle"
                        style={{ marginTop: "0.75rem" }}
                      />
                    )}
                  </>
                )}
              </div>
            )}
            {!projector && room.state === "DRAWING" && turnWaiting && (
              <p style={{ marginTop: "0.5rem" }}>
                <strong>{turnWaiting.activePlayerName}</strong> is drawing (
                {turnWaiting.round}/{turnWaiting.totalTurns})
              </p>
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
              <button
                type="button"
                className="btn"
                style={{ marginTop: "1rem" }}
                disabled={!canStart}
                onClick={() => void startGame()}
              >
                Start game
              </button>
            )}

            {!projector && generating && !aiImageReady && (
              <p style={{ marginTop: "1rem" }}>AI is reimagining the doodle…</p>
            )}
            {!projector && aiImageReady && (
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <p className="muted">AI result (turn {aiImageReady.round})</p>
                <img
                  className="ref-image"
                  src={aiImageReady.imageUrl}
                  alt="AI reimagining"
                />
              </div>
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
                Done
              </button>
            </div>
          )}

          {room.state === "GAME_OVER" && (
            <div className="card" style={{ marginTop: "1rem" }}>
              <h2>Game over</h2>
              <p>Thanks for playing DRIFT.</p>
            </div>
          )}
        </>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
