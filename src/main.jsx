import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Brush, Check, Crown, Eraser, PaintBucket, Play, RotateCcw, SkipBack, SkipForward, Trash2, UserMinus, Users } from 'lucide-react';
import './styles.css';

const socket = io();

function App() {
  const [room, setRoom] = useState(null);
  const queryRoom = new URLSearchParams(location.search).get('room') || '';
  const [playerId, setPlayerId] = useState(sessionStorage.getItem('playerId') || '');
  const [task, setTask] = useState(null);
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [code, setCode] = useState(queryRoom);
  const [error, setError] = useState('');

  useEffect(() => {
    socket.on('room:update', setRoom);
    socket.on('player:task', setTask);
    socket.on('room:kicked', () => {
      sessionStorage.removeItem('roomCode');
      sessionStorage.removeItem('playerId');
      setRoom(null);
      setTask(null);
      setError('You were removed from the room.');
    });
    return () => {
      socket.off('room:update');
      socket.off('player:task');
      socket.off('room:kicked');
    };
  }, []);

  useEffect(() => {
    const savedCode = sessionStorage.getItem('roomCode');
    const savedPlayerId = sessionStorage.getItem('playerId');
    if (!room && !queryRoom && savedCode && savedPlayerId) {
      socket.emit('room:rejoin', { code: savedCode, playerId: savedPlayerId }, (reply) => {
        if (reply?.ok) {
          setRoom(reply.room);
          setPlayerId(reply.playerId);
        }
      });
    }
  }, [room]);

  const currentPlayer = room?.players.find((player) => player.id === playerId);
  const isHost = Boolean(currentPlayer?.isHost);

  function remember(reply, nextName) {
    if (!reply?.ok) {
      setError(reply?.error || 'Something went wrong');
      return;
    }
    setError('');
    setRoom(reply.room);
    setPlayerId(reply.playerId);
    sessionStorage.setItem('roomCode', reply.room.code);
    sessionStorage.setItem('playerId', reply.playerId);
    localStorage.setItem('playerName', nextName);
  }

  function createRoom() {
    const nextName = name.trim() || 'Host';
    socket.emit('room:create', { name: nextName }, (reply) => remember(reply, nextName));
  }

  function joinRoom() {
    const nextName = name.trim() || 'Player';
    socket.emit('room:join', { code: code.trim().toUpperCase(), name: nextName }, (reply) => remember(reply, nextName));
  }

  function leaveRoom() {
    socket.emit('room:leave', {}, () => {
      sessionStorage.removeItem('roomCode');
      sessionStorage.removeItem('playerId');
      setRoom(null);
      setTask(null);
      setPlayerId('');
    });
  }

  if (!room) {
    return (
      <main className="shell intro">
        <section className="panel intro-panel">
          <div>
            <p className="eyebrow">Localhost mock demo</p>
            <h1>Gartic AI, cursed mode</h1>
            <p className="lede">
              Draw a prompt, let the mock AI make a fake cursed render, describe that image, then pass the words onward.
            </p>
          </div>
          <label>
            Display name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          </label>
          <div className="join-grid">
            <button className="primary" onClick={createRoom}>
              <Crown size={18} /> Create host room
            </button>
            <div className="join-row">
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ROOM" maxLength={4} />
              <button onClick={joinRoom}>
                <Users size={18} /> Join
              </button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <Header room={room} currentPlayer={currentPlayer} onLeave={leaveRoom} />
      <div className="layout">
        <section className="main-stage">
          {room.state === 'lobby' && <Lobby room={room} isHost={isHost} />}
          {room.state === 'choosing' && <PromptChoice room={room} task={task} playerId={playerId} />}
          {room.state === 'drawing' && <DrawingRound room={room} task={task} playerId={playerId} />}
          {room.state === 'describing' && <DescriptionRound room={room} task={task} playerId={playerId} />}
          {room.state === 'generating' && <Generating room={room} />}
          {room.state === 'reveal' && <Reveal room={room} isHost={isHost} />}
        </section>
        <aside className="side">
          <HostControls room={room} isHost={isHost} />
          <PlayerList room={room} isHost={isHost} currentPlayerId={playerId} />
        </aside>
      </div>
    </main>
  );
}

function Header({ room, currentPlayer, onLeave }) {
  const joinUrl = `${location.origin}?room=${room.code}`;
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Room {room.code}</p>
        <h2>{stateLabel(room)}</h2>
      </div>
      <div className="header-actions">
        <span>{currentPlayer?.name}</span>
        {currentPlayer?.isHost && <span className="badge"><Crown size={14} /> Host</span>}
        <button onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copy join link</button>
        <button onClick={onLeave}>Leave room</button>
      </div>
    </header>
  );
}

function stateLabel(room) {
  if (room.state === 'lobby') return 'Waiting for players';
  if (room.state === 'choosing') return 'Choose your prompt';
  if (room.state === 'drawing') return `Draw turn ${room.round} of ${room.config.numRounds}`;
  if (room.state === 'describing') return `Describe turn ${room.round} of ${room.config.numRounds}`;
  if (room.state === 'generating') return 'AI is reimagining';
  return 'Reveal';
}

function Lobby({ room, isHost }) {
  const canStart = room.players.length >= room.config.minPlayers && room.players.length <= room.config.maxPlayers;
  const joinUrl = `${location.origin}?room=${room.code}`;
  return (
    <div className="panel lobby">
      <div>
        <p className="eyebrow">Join code</p>
        <div className="room-code">{room.code}</div>
        <p className="muted">{joinUrl}</p>
      </div>
      <div className="status-strip">
        <span><Users size={18} /> {room.players.length}/{room.config.maxPlayers} players</span>
        <span>Minimum {room.config.minPlayers} players</span>
        <span>Host can play and manage the room</span>
      </div>
      <PromptBuilder />
      {isHost ? (
        <button className="primary wide" disabled={!canStart} onClick={() => socket.emit('game:start', {})}>
          <Play size={18} /> Start game
        </button>
      ) : (
        <p className="muted">Waiting for the host to start.</p>
      )}
    </div>
  );
}

function PromptBuilder() {
  const [prompts, setPrompts] = useState(['', '', '']);
  const [saved, setSaved] = useState(false);

  function updatePrompt(index, value) {
    const next = [...prompts];
    next[index] = value;
    setPrompts(next);
    setSaved(false);
  }

  function savePrompts() {
    socket.emit('prompts:update', { prompts }, (reply) => {
      setSaved(Boolean(reply?.ok));
    });
  }

  return (
    <section className="prompt-builder">
      <div>
        <p className="eyebrow">Prompt ideas</p>
        <p className="muted">Add up to three. Blanks get filled from the built-in list.</p>
      </div>
      <div className="prompt-inputs">
        {prompts.map((prompt, index) => (
          <input
            key={index}
            value={prompt}
            onChange={(event) => updatePrompt(index, event.target.value)}
            maxLength={90}
            placeholder={`Prompt ${index + 1}`}
          />
        ))}
      </div>
      <button onClick={savePrompts}><Check size={18} /> {saved ? 'Saved' : 'Save prompts'}</button>
    </section>
  );
}

function PromptChoice({ room, task, playerId }) {
  const [selected, setSelected] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const player = room.players.find((item) => item.id === playerId);
  const submitted = Boolean(player?.submitted);
  const options = task?.options || [];

  useEffect(() => {
    setSelected('');
  }, [room.state]);

  useEffect(() => {
    const tick = () => setTimeLeft(Math.max(0, Math.ceil(((task?.deadline || Date.now()) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [task?.deadline]);

  function choosePrompt(prompt) {
    if (submitted) return;
    setSelected(prompt);
    socket.emit('prompt:choose', { prompt });
  }

  return (
    <section className="panel choice-screen">
      <div className="choice-header">
        <div>
          <p className="eyebrow">Pick one</p>
          <h1>Choose your starting prompt</h1>
        </div>
        <div className={`timer ${timeLeft <= 5 ? 'danger' : ''}`}>{timeLeft}s</div>
      </div>
      <div className="choice-grid">
        {options.map((option) => (
          <button
            key={option}
            className={`choice-card ${selected === option || (submitted && selected === option) ? 'selected-choice' : ''}`}
            onClick={() => choosePrompt(option)}
            disabled={submitted}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="muted">{submitted ? 'Locked in. Waiting for everyone else.' : 'If time runs out, the first option is picked.'}</p>
    </section>
  );
}

function DrawingRound({ room, task, playerId }) {
  const [submitted, setSubmitted] = useState(false);
  const [brushColor, setBrushColor] = useState('#111111');
  const [tool, setTool] = useState('brush');
  const [timeLeft, setTimeLeft] = useState(0);
  const canvasRef = useRef(null);
  const submittedRef = useRef(false);
  const player = room.players.find((item) => item.id === playerId);

  useEffect(() => {
    const nextSubmitted = Boolean(player?.submitted);
    submittedRef.current = nextSubmitted;
    setSubmitted(nextSubmitted);
  }, [player?.submitted, room.round]);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(((task?.deadline || Date.now()) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (task?.deadline && Date.now() >= task.deadline && !submittedRef.current) {
        submitDrawing();
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [task?.deadline]);

  async function submitDrawing() {
    if (submittedRef.current || !canvasRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    const blob = await canvasRef.current.exportBlob();
    const form = new FormData();
    form.append('drawing', blob, 'drawing.png');
    const upload = await fetch('/api/drawings', { method: 'POST', body: form });
    const { url } = await upload.json();
    socket.emit('drawing:submit', { drawingUrl: url });
  }

  return (
    <div className="draw-screen">
      <section className="panel prompt-panel">
        <div>
          <p className="eyebrow">Round {task?.round || room.round}</p>
          <h1>Draw: {task?.prompt || 'a mysterious cursed thing'}</h1>
        </div>
        <div className={`timer ${timeLeft <= 5 ? 'danger' : ''}`}>{timeLeft}s</div>
      </section>

      <DrawingCanvas ref={canvasRef} brushColor={brushColor} tool={tool} disabled={submitted} />

      <section className="toolbar">
        <div className="tool-group">
          <button className={tool === 'brush' ? 'selected-tool' : ''} onClick={() => setTool('brush')} disabled={submitted}>
            <Brush size={18} /> Brush
          </button>
          <button className={tool === 'fill' ? 'selected-tool' : ''} onClick={() => setTool('fill')} disabled={submitted}>
            <PaintBucket size={18} /> Fill
          </button>
        </div>
        <div className="swatches">
          {['#111111', '#ef4444', '#2563eb', '#16a34a', '#f59e0b'].map((color) => (
            <button
              key={color}
              className={`swatch ${brushColor === color ? 'selected' : ''}`}
              style={{ background: color }}
              onClick={() => setBrushColor(color)}
              aria-label={`Use ${color}`}
            />
          ))}
        </div>
        <button onClick={() => canvasRef.current?.undo()} disabled={submitted}><RotateCcw size={18} /> Undo</button>
        <button onClick={() => canvasRef.current?.clear()} disabled={submitted}><Trash2 size={18} /> Clear</button>
        <button className="primary" onClick={submitDrawing} disabled={submitted}>
          <Check size={18} /> {submitted ? 'Submitted' : 'Submit'}
        </button>
      </section>
    </div>
  );
}

function DescriptionRound({ room, task, playerId }) {
  const [submitted, setSubmitted] = useState(false);
  const [description, setDescription] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const submittedRef = useRef(false);
  const descriptionRef = useRef('');
  const player = room.players.find((item) => item.id === playerId);

  useEffect(() => {
    const nextSubmitted = Boolean(player?.submitted);
    submittedRef.current = nextSubmitted;
    setSubmitted(nextSubmitted);
  }, [player?.submitted, room.round]);

  useEffect(() => {
    setDescription('');
    descriptionRef.current = '';
  }, [room.round, task?.chainId]);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(((task?.deadline || Date.now()) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (task?.deadline && Date.now() >= task.deadline && !submittedRef.current) {
        submitDescription();
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [task?.deadline]);

  function submitDescription() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    socket.emit('description:submit', { description: descriptionRef.current });
  }

  return (
    <div className="describe-screen">
      <section className="panel prompt-panel">
        <div>
          <p className="eyebrow">Round {task?.round || room.round}</p>
          <h1>Describe this image</h1>
        </div>
        <div className={`timer ${timeLeft <= 5 ? 'danger' : ''}`}>{timeLeft}s</div>
      </section>
      <section className="describe-layout">
        <div className="describe-image">
          {task?.imageUrl && <img src={task.imageUrl} alt="Image to describe" />}
        </div>
        <div className="panel describe-form">
          <label>
            What should the next player draw?
            <textarea
              value={description}
              onChange={(event) => {
                descriptionRef.current = event.target.value;
                setDescription(event.target.value);
              }}
              maxLength={140}
              disabled={submitted}
              placeholder="Example: a haunted dog wearing tiny boots"
            />
          </label>
          <div className="description-footer">
            <span className="muted">{description.length}/140</span>
            <button className="primary" onClick={submitDescription} disabled={submitted}>
              <Check size={18} /> {submitted ? 'Submitted' : 'Submit description'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

const DrawingCanvas = React.forwardRef(function DrawingCanvas({ brushColor, tool, disabled }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const actions = useRef([]);
  const currentStroke = useRef([]);

  React.useImperativeHandle(ref, () => ({
    undo() {
      actions.current.pop();
      redraw();
    },
    clear() {
      actions.current = [];
      redraw();
    },
    exportBlob() {
      return new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png', 0.92));
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const snapshot = [...actions.current];
      canvas.width = Math.floor(rect.width * devicePixelRatio);
      canvas.height = Math.floor(rect.height * devicePixelRatio);
      actions.current = snapshot;
      redraw();
    };
    resize();
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * devicePixelRatio,
      y: (event.clientY - rect.top) * devicePixelRatio
    };
  }

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const action of actions.current) {
      drawAction(ctx, action);
    }
  }

  function drawAction(ctx, action) {
    if (action.type === 'fill') {
      floodFill(ctx, action.x, action.y, action.color);
      return;
    }
    drawStroke(ctx, action);
  }

  function drawStroke(ctx, stroke) {
    if (!stroke.points.length) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = 7 * devicePixelRatio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const item of stroke.points.slice(1)) ctx.lineTo(item.x, item.y);
    ctx.stroke();
  }

  function start(event) {
    if (disabled) return;
    if (tool === 'fill') {
      const fillPoint = point(event);
      const action = { type: 'fill', x: Math.round(fillPoint.x), y: Math.round(fillPoint.y), color: brushColor };
      redraw();
      drawAction(canvasRef.current.getContext('2d'), action);
      actions.current.push(action);
      return;
    }
    drawing.current = true;
    currentStroke.current = { type: 'stroke', color: brushColor, points: [point(event)] };
    canvasRef.current.setPointerCapture(event.pointerId);
  }

  function move(event) {
    if (!drawing.current || disabled) return;
    currentStroke.current.points.push(point(event));
    redraw();
    drawStroke(canvasRef.current.getContext('2d'), currentStroke.current);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    actions.current.push(currentStroke.current);
    currentStroke.current = [];
    redraw();
  }

  return (
    <canvas
      ref={canvasRef}
      className={`canvas ${tool === 'fill' ? 'fill-mode' : ''}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
});

function floodFill(ctx, startX, startY, fillColor) {
  const { width, height } = ctx.canvas;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const target = colorAt(data, startX, startY, width);
  const fill = hexToRgba(fillColor);
  if (colorsClose(target, fill, 8)) return;
  const stack = [[startX, startY]];
  const maxPixels = width * height;
  let visited = 0;

  while (stack.length && visited < maxPixels) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const index = (y * width + x) * 4;
    const current = [data[index], data[index + 1], data[index + 2], data[index + 3]];
    if (!colorsClose(current, target, 34)) continue;
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = 255;
    visited += 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  ctx.putImageData(image, 0, 0);
}

function colorAt(data, x, y, width) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function hexToRgba(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    255
  ];
}

function colorsClose(a, b, tolerance) {
  return Math.abs(a[0] - b[0]) <= tolerance
    && Math.abs(a[1] - b[1]) <= tolerance
    && Math.abs(a[2] - b[2]) <= tolerance
    && Math.abs(a[3] - b[3]) <= tolerance;
}

function Generating({ room }) {
  return (
    <section className="panel generating">
      <div className="spinner" />
      <h1>AI is making it cursed</h1>
      <p className="muted">Generating {room.players.length} image-to-image results for round {room.round}.</p>
    </section>
  );
}

function Reveal({ room, isHost }) {
  const chain = room.chains[room.revealIndex] || room.chains[0];
  if (!chain) return null;
  return (
    <section className="reveal">
      <div className="panel reveal-header">
        <div>
          <p className="eyebrow">Chain {room.revealIndex + 1} of {room.chains.length}</p>
          <h1>Started as: {chain.seedWord}</h1>
        </div>
        {isHost && (
          <div className="reveal-actions">
            <button onClick={() => socket.emit('host:prevReveal', {})}><SkipBack size={18} /> Previous</button>
            <button onClick={() => socket.emit('host:nextReveal', {})}><SkipForward size={18} /> Next</button>
          </div>
        )}
      </div>
      <div className="chain-grid">
        {chain.links.map((link, index) => (
          <article className="link-card" key={`${link.type}-${index}-${link.createdAt}`}>
            <p className="eyebrow">{linkLabel(link, room)}</p>
            {['word', 'description'].includes(link.type) ? <div className="word-card">{link.text}</div> : <img src={link.url} alt={link.type} />}
          </article>
        ))}
      </div>
    </section>
  );
}

function linkLabel(link, room) {
  if (link.type === 'word') return 'Prompt';
  if (link.type === 'description') {
    const player = room.players.find((item) => item.id === link.authorId);
    return `${player?.name || 'Player'} described`;
  }
  if (link.type === 'image') return link.authorId === 'mock-ai' ? 'Mock AI saw' : 'Fal AI saw';
  const player = room.players.find((item) => item.id === link.authorId);
  return `${player?.name || 'Player'} drew`;
}

function HostControls({ room, isHost }) {
  const hostMissing = !room.hostConnected;
  const canReturnToLobby = isHost || hostMissing;
  if (!canReturnToLobby) {
    return (
      <section className="panel compact">
        <p className="eyebrow">Host controls</p>
        <p className="muted">The host can start, reset, and manage the reveal.</p>
      </section>
    );
  }
  return (
    <section className="panel compact">
      <p className="eyebrow">{isHost ? 'Host controls' : 'Host disconnected'}</p>
      {isHost && <button disabled={room.state !== 'lobby'} onClick={() => socket.emit('game:start', {})}><Play size={18} /> Start</button>}
      <button onClick={() => socket.emit(isHost ? 'host:reset' : 'room:returnToLobby', {})}><Eraser size={18} /> Return to lobby</button>
    </section>
  );
}

function PlayerList({ room, isHost, currentPlayerId }) {
  return (
    <section className="panel compact">
      <p className="eyebrow">Players</p>
      <div className="players">
        {room.players.map((player) => (
          <div className="player-row" key={player.id}>
            <span className={player.connected ? 'dot live' : 'dot'} />
            <span>{player.name}</span>
            {player.isHost && <Crown size={14} />}
            {player.submitted && <Check size={16} />}
            {isHost && room.state === 'lobby' && !player.isHost && player.id !== currentPlayerId && (
              <button className="icon-button danger-button" onClick={() => socket.emit('host:kick', { playerId: player.id })} title={`Kick ${player.name}`}>
                <UserMinus size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
