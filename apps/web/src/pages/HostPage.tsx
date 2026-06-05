import { CLIENT_EVENTS } from "@drift/shared";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PUBLIC_APP_URL } from "../lib/config";
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
  const [roomCreated, setRoomCreated] = useState(
    Boolean(cached?.path === "/host" && cached.roomCode)
  );
  const [error, setError] = useState<string | null>(null);
  const rejoinAttempted = useRef(false);

  const { connected, room, generating, revealStep, emit } = useGameSocket(
    accessToken,
    name
  );

  const joinUrl = room
    ? `${PUBLIC_APP_URL}/play?code=${room.code}`
    : PUBLIC_APP_URL + "/play";

  const canStart = useMemo(() => {
    if (!room) return false;
    return room.players.length >= room.minPlayers;
  }, [room]);

  const rejoinRoom = async (roomCode: string, displayName: string) => {
    setError(null);
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
  };

  useEffect(() => {
    if (!demoAuthBypass || !connected || room || rejoinAttempted.current) return;
    const session = loadDemoSession();
    if (session?.path !== "/host" || !session.roomCode) return;
    rejoinAttempted.current = true;
    if (session.minPlayers) setMinPlayers(session.minPlayers);
    if (session.displayName) setName(session.displayName);
    void rejoinRoom(session.roomCode, session.displayName || name).catch((e) => {
      rejoinAttempted.current = false;
      const msg = e instanceof Error ? e.message : "Rejoin failed";
      if (msg.includes("Room not found")) clearDemoSession();
      setError(msg);
      setRoomCreated(false);
    });
  }, [connected, room, demoAuthBypass, accessToken, name, minPlayers, emit]);

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

  const currentReveal = revealStep ?? (room?.chains[room.revealChainIndex]
    ? {
        chainId: room.chains[room.revealChainIndex]!.id,
        chainIndex: room.revealChainIndex,
        links: room.chains[room.revealChainIndex]!.links,
        chainCount: room.chains.length,
      }
    : null);

  return (
    <div className="page page-host">
      <h1>DRIFT — Host</h1>

      {roomCreated && !room && (
        <p className="muted" style={{ marginTop: "1rem" }}>
          {connected ? "Reconnecting to your room…" : "Connecting…"}
        </p>
      )}

      {!roomCreated && (
        <div className="card">
          <label className="label">Host name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
            className="btn"
            style={{ marginTop: "1rem" }}
            disabled={!connected}
            onClick={() => void createRoom()}
          >
            Create room
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
              {room.round > 0 && ` · round ${room.round}/${room.config.numRounds}`}
            </p>
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

            {generating && (
              <p style={{ marginTop: "1rem" }}>
                Reimagining {generating.completed}/{generating.count}…
              </p>
            )}
          </div>

          {room.state === "REVEAL" && currentReveal && (
            <div className="card reveal-stage" style={{ marginTop: "1rem" }}>
              <h2>
                Chain {currentReveal.chainIndex + 1} / {currentReveal.chainCount}
              </h2>
              {currentReveal.links.map((link) => (
                <div key={link.id} style={{ textAlign: "center" }}>
                  <p className="muted">
                    {link.type === "word" && "Seed word"}
                    {link.type === "drawing" &&
                      `Doodle${link.authorName ? ` — ${link.authorName}` : ""}`}
                    {link.type === "image" && "AI saw"}
                  </p>
                  {link.type === "word" ? (
                    <div className="word-prompt">{link.content}</div>
                  ) : (
                    <img
                      className="reveal-media"
                      src={link.content}
                      alt={link.type}
                    />
                  )}
                </div>
              ))}
              <button type="button" className="btn" onClick={() => void hostNext()}>
                Next
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
