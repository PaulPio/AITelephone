import { useCallback, useRef, useState, type FormEvent } from "react";
import type { DrawingCanvasHandle } from "../components/DrawingCanvas";
import { DrawingCanvas } from "../components/DrawingCanvas";
import { RoundTimer } from "../components/RoundTimer";
import { uploadDrawing } from "../api/uploadDrawing";
import { useGameSocket } from "../hooks/useGameSocket";

export function PlayPage() {
  const { socket, room, round, error, joinRoom } = useGameSocket();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("code") ?? "");
  const [playerId, setPlayerId] = useState(sessionStorage.getItem("playerId") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [joinError, setJoinError] = useState("");

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setJoinError("");
    try {
      const joined = await joinRoom(code, name);
      setPlayerId(joined.playerId);
      sessionStorage.setItem("playerId", joined.playerId);
      sessionStorage.setItem("roomCode", code.toUpperCase());
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not join room");
    }
  };

  const submit = useCallback(async () => {
    if (!canvasRef.current || !round || !room || !playerId || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const blob = await canvasRef.current.exportPng();
      const uploaded = await uploadDrawing({
        blob,
        roomCode: room.code,
        playerId,
        chainId: round.chainId
      });
      socket.emit("submitDrawing", {
        roomCode: room.code,
        playerId,
        drawingUrl: uploaded.drawingUrl
      });
    } finally {
      setSubmitting(false);
    }
  }, [playerId, room, round, socket, submitting]);

  if (!playerId || !room) {
    return (
      <main className="screen phone-screen">
        <section className="join-card">
          <p className="eyebrow">DRIFT receiver</p>
          <h1>Enter the cursed relay</h1>
          <p>Draw fast. Let the machine misunderstand you beautifully.</p>
          <form onSubmit={join} className="stack">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={4}
              required
            />
            <button type="submit">Join room</button>
          </form>
          <div className="host-entry">
            <p>First one here? Create a room and share the code.</p>
            <button type="button" onClick={() => window.location.assign("/host")}>
              Create room
            </button>
          </div>
          {(joinError || error) && <p className="error">{joinError || error}</p>}
        </section>
      </main>
    );
  }

  if (room.state === "LOBBY") {
    return (
      <main className="screen phone-screen">
        <section className="join-card">
          <p className="eyebrow">Room {room.code}</p>
          <h1>Waiting for the host</h1>
          <div className="player-list">
            {room.players.map((player) => (
              <span key={player.id}>{player.name}</span>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (room.state === "GENERATING" || room.submittedPlayerIds.includes(playerId)) {
    return (
      <main className="screen phone-screen">
        <section className="join-card">
          <p className="eyebrow">Machine vision in progress</p>
          <h1>The AI is taking your doodle too seriously</h1>
          <p>{room.submittedPlayerIds.length} of {room.players.length} players submitted.</p>
          <div className="loader-orb" />
        </section>
      </main>
    );
  }

  if (room.state === "REVEAL" || room.state === "GAME_OVER") {
    return (
      <main className="screen phone-screen">
        <section className="join-card">
          <p className="eyebrow">Hands off</p>
          <h1>Watch the big screen</h1>
          <p>Your chain is now public evidence.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="screen phone-screen draw-screen">
      <header className="draw-header">
        <div>
          <p className="eyebrow">Round {round?.round ?? room.round}</p>
          {round?.type === "word" ? <h1>Draw: {round.word}</h1> : <h1>Redraw what the AI saw</h1>}
        </div>
        <RoundTimer deadline={round?.deadline} onExpire={submit} />
      </header>
      {round?.type === "redraw" && <img className="reference-image" src={round.image} alt="AI reference to redraw" />}
      <DrawingCanvas ref={canvasRef} disabled={submitting} />
      <button className="submit-button" type="button" onClick={submit} disabled={submitting || !round}>
        {submitting ? "Submitting..." : "Submit drawing"}
      </button>
    </main>
  );
}
