import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { JOIN_URL } from "../env";
import { RoundTimer } from "../components/RoundTimer";
import { useGameSocket } from "../hooks/useGameSocket";
import { buildJoinUrl } from "../utils/joinUrl";

export function HostPage() {
  const { socket, room, round, revealStep, isConnected, error, createRoom } = useGameSocket();
  const creatingRoom = useRef(false);
  const [hostId, setHostId] = useState(sessionStorage.getItem("hostId") ?? "");
  const [copied, setCopied] = useState(false);
  const joinUrl = useMemo(() => (room ? buildJoinUrl(JOIN_URL, room.code) : JOIN_URL), [room]);

  useEffect(() => {
    if (isConnected && !room && !creatingRoom.current) {
      creatingRoom.current = true;
      createRoom().then((created) => {
        setHostId(created.hostId);
        sessionStorage.setItem("hostId", created.hostId);
      });
    }
  }, [createRoom, isConnected, room]);

  const start = () => {
    if (room && hostId) {
      socket.emit("startGame", { code: room.code, hostId });
    }
  };

  const next = () => {
    if (room && hostId) {
      socket.emit("hostNext", { code: room.code, hostId });
    }
  };

  const copyJoinUrl = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(joinUrl);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = joinUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!room) {
    return (
      <main className="screen host-screen">
        <section className="host-hero">
          <div>
            <p className="eyebrow">Preparing transmission</p>
            <h1>{isConnected ? "Summoning room code..." : "Waiting for game server..."}</h1>
            <p>{error ?? "If the server just started, this will continue automatically."}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen host-screen">
      <section className="host-hero">
        <div>
          <p className="eyebrow">DRIFT control room</p>
          <h1>Broken telephone, but the AI gets a vote.</h1>
        </div>
        <div className="room-code">{room.code}</div>
      </section>

      {room.state === "LOBBY" && (
        <section className="host-grid">
          <div className="qr-card">
            <QRCodeSVG value={joinUrl} size={220} bgColor="#fbf3df" fgColor="#171217" />
            <p>{joinUrl}</p>
            <button type="button" onClick={copyJoinUrl}>
              {copied ? "Copied!" : "Copy join link"}
            </button>
          </div>
          <div className="control-card">
            <h2>{room.players.length} players connected</h2>
            <div className="player-list host-list">
              {room.players.map((player) => (
                <span key={player.id}>{player.name}</span>
              ))}
            </div>
            <button type="button" onClick={start} disabled={room.players.length < 3}>
              {room.players.length < 3 ? "Need 3 players" : "Start game"}
            </button>
          </div>
        </section>
      )}

      {room.state === "DRAWING" && (
        <section className="control-card">
          <div className="status-row">
            <h2>Round {room.round} of {room.config.numRounds}</h2>
            <RoundTimer deadline={round?.deadline ?? room.deadline} />
          </div>
          <div className="player-list host-list">
            {room.players.map((player) => (
              <span key={player.id} className={room.submittedPlayerIds.includes(player.id) ? "submitted" : ""}>
                {player.name} {room.submittedPlayerIds.includes(player.id) ? "sent" : "drawing"}
              </span>
            ))}
          </div>
        </section>
      )}

      {room.state === "GENERATING" && (
        <section className="control-card generating-card">
          <p className="eyebrow">The model is hallucinating evidence</p>
          <h2>Reimagining {room.players.length} drawings...</h2>
          <div className="loader-orb" />
        </section>
      )}

      {(room.state === "REVEAL" || room.state === "GAME_OVER") && (
        <section className="reveal-card">
          <div>
            <p className="eyebrow">Chain {revealStep ? revealStep.index + 1 : room.revealIndex + 1}</p>
            <h2>{room.state === "GAME_OVER" ? "The evidence is complete" : "Reveal the mutation"}</h2>
          </div>
          <div className="chain-strip">
            {(revealStep?.links ?? room.chains[room.revealIndex]?.links ?? []).map((link, index) => (
              <article key={`${link.createdAt}-${index}`} className={`link-card link-${link.type}`}>
                <span>{link.type}</span>
                {link.type === "word" ? <strong>{link.content}</strong> : <img src={link.content} alt={link.type} />}
              </article>
            ))}
          </div>
          <button type="button" onClick={next} disabled={room.state === "GAME_OVER"}>
            Next chain
          </button>
        </section>
      )}
    </main>
  );
}
