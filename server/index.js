import express from 'express';
import http from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';
import { Server } from 'socket.io';
import { customAlphabet, nanoid } from 'nanoid';
import 'dotenv/config';
import { fal } from '@fal-ai/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');

if (!existsSync(uploadDir)) {
  await fs.mkdir(uploadDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});
const upload = multer({ storage });
const rooms = new Map();
const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);
const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.API_KEY;
const forceMockAi = String(process.env.MOCK_AI || '').toLowerCase() === 'true';
let lastAiError = null;
const aiTimeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000);

if (falKey && !forceMockAi) {
  fal.config({ credentials: falKey });
}

const seedWords = [
  'cursed dog',
  'haunted sandwich',
  'frog businessman',
  'melting clown',
  'wizard dentist',
  'robot chef',
  'angry houseplant',
  'skeleton surfer',
  'tiny accountant in a huge suit',
  'grandma on a skateboard',
  'fish wearing boots',
  'alien birthday party'
];

function publicRoom(room) {
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    revealIndex: room.revealIndex,
    config: room.config,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      connected: player.connected,
      submitted: room.submissions.has(player.id),
      promptCount: player.prompts.length
    })),
    chains: room.chains,
    promptOptions: room.promptOptions,
    hostConnected: Boolean(room.players.find((player) => player.id === room.hostId)?.connected)
  };
}

function getPlayerRoom(socket) {
  const { roomCode } = socket.data;
  return roomCode ? rooms.get(roomCode) : null;
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function assignmentFor(room, playerId, round = room.round) {
  const playerIndex = room.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) return null;
  const chainIndex = (playerIndex + round - 1) % room.chains.length;
  return room.chains[chainIndex];
}

function playerTask(room, playerId) {
  if (room.state === 'choosing') {
    return {
      mode: 'choosing',
      deadline: room.deadline,
      options: room.promptOptions[playerId] || []
    };
  }
  if (!['drawing', 'describing'].includes(room.state)) return null;
  const chain = assignmentFor(room, playerId);
  if (!chain) return null;
  const latestImage = [...chain.links].reverse().find((link) => link.type === 'image');
  const latestText = [...chain.links].reverse().find((link) => ['word', 'description'].includes(link.type));
  return {
    round: room.round,
    totalRounds: room.config.numRounds,
    deadline: room.deadline,
    chainId: chain.id,
    mode: room.state,
    prompt: room.state === 'drawing' ? latestText?.text : null,
    imageUrl: room.state === 'describing' ? latestImage?.url : null
  };
}

function sendTask(room, playerId) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player?.socketId) return;
  io.to(player.socketId).emit('player:task', playerTask(room, playerId));
}

function sendTasks(room) {
  room.players.forEach((player) => sendTask(room, player.id));
}

function resetRoomToLobby(room) {
  clearTimeout(room.timer);
  room.state = 'lobby';
  room.round = 0;
  room.revealIndex = 0;
  room.deadline = null;
  room.chains = [];
  room.promptOptions = {};
  room.submissions = new Map();
  emitRoom(room);
}

function promoteHostIfNeeded(room) {
  const currentHost = room.players.find((player) => player.id === room.hostId);
  if (currentHost?.connected) return;
  const nextHost = room.players.find((player) => player.connected) || room.players[0];
  if (!nextHost) return;
  room.hostId = nextHost.id;
  room.players.forEach((player) => {
    player.isHost = player.id === nextHost.id;
  });
}

function removePlayerFromRoom(room, playerId) {
  const index = room.players.findIndex((player) => player.id === playerId);
  if (index < 0) return null;
  const [removed] = room.players.splice(index, 1);
  if (removed.socketId) {
    io.sockets.sockets.get(removed.socketId)?.leave(room.code);
  }
  promoteHostIfNeeded(room);
  if (room.players.length === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
  } else if (room.state === 'lobby') {
    emitRoom(room);
  } else {
    emitRoom(room);
  }
  return removed;
}

function createRoom(hostName) {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  const host = {
    id: nanoid(),
    socketId: null,
    name: hostName || 'Host',
    isHost: true,
    connected: true,
    prompts: []
  };
  const room = {
    code,
    hostId: host.id,
    state: 'lobby',
    round: 0,
    revealIndex: 0,
    deadline: null,
    timer: null,
    config: {
      numRounds: 5,
      drawTimerSec: 45,
      describeTimerSec: 30,
      minPlayers: 2,
      chooseTimerSec: 20,
      maxPlayers: 10
    },
    players: [host],
    chains: [],
    promptOptions: {},
    submissions: new Map()
  };
  rooms.set(code, room);
  return { room, host };
}

function startGame(room) {
  if (room.players.length < room.config.minPlayers || room.players.length > room.config.maxPlayers) return;
  room.promptOptions = {};
  room.chains = room.players.map((player, index) => ({
    id: `chain-${index + 1}`,
    seedWord: null,
    starterId: player.id,
    links: []
  }));
  room.promptOptions = buildPromptOptions(room);
  room.round = 1;
  room.revealIndex = 0;
  beginPromptChoice(room);
}

function buildPromptOptions(room) {
  const optionsByPlayer = Object.fromEntries(room.players.map((player) => [player.id, []]));
  const customPrompts = room.players.flatMap((player) =>
    uniquePrompts(player.prompts).map((prompt) => ({ prompt, authorId: player.id }))
  );

  customPrompts.forEach((entry, index) => {
    const candidates = room.players
      .filter((player) => player.id !== entry.authorId)
      .filter((player) => optionsByPlayer[player.id].length < 3)
      .sort((a, b) => optionsByPlayer[a.id].length - optionsByPlayer[b.id].length);
    const preferred = candidates[index % Math.max(candidates.length, 1)];
    const target = preferred || room.players.find((player) => optionsByPlayer[player.id].length < 3);
    if (!target) return;
    addPromptOption(optionsByPlayer[target.id], entry.prompt);
  });

  room.players.forEach((player, playerIndex) => {
    const fallbackPool = [
      ...customPrompts.filter((entry) => entry.authorId !== player.id).map((entry) => entry.prompt),
      ...seedWords
    ];
    let fallbackIndex = playerIndex;
    while (optionsByPlayer[player.id].length < 3) {
      addPromptOption(optionsByPlayer[player.id], fallbackPool[fallbackIndex % fallbackPool.length]);
      fallbackIndex += 1;
    }
    optionsByPlayer[player.id] = optionsByPlayer[player.id].slice(0, 3);
  });

  return optionsByPlayer;
}

function uniquePrompts(prompts) {
  return [...new Set((prompts || []).map(cleanPrompt).filter(Boolean))];
}

function addPromptOption(options, prompt) {
  const clean = cleanPrompt(prompt);
  if (clean && !options.includes(clean)) {
    options.push(clean);
  }
}

function beginPromptChoice(room) {
  clearTimeout(room.timer);
  room.state = 'choosing';
  room.submissions = new Map();
  room.deadline = Date.now() + room.config.chooseTimerSec * 1000;
  emitRoom(room);
  sendTasks(room);
  room.timer = setTimeout(() => finishPromptChoice(room), room.config.chooseTimerSec * 1000 + 500);
}

function finishPromptChoice(room) {
  if (room.state !== 'choosing') return;
  clearTimeout(room.timer);
  room.players.forEach((player, index) => {
    const chain = room.chains[index];
    if (!chain) return;
    const options = room.promptOptions[player.id] || pickPromptOptions(seedWords, index);
    const selected = cleanPrompt(room.submissions.get(player.id)?.prompt) || options[0] || seedWords[index % seedWords.length];
    chain.seedWord = selected;
    chain.links = [{
      type: 'word',
      text: selected,
      authorId: player.id,
      createdAt: Date.now()
    }];
  });
  room.submissions = new Map();
  beginTurn(room);
}

function cleanPrompt(prompt) {
  return String(prompt || '').trim().slice(0, 90);
}

function beginTurn(room) {
  clearTimeout(room.timer);
  room.state = room.round % 2 === 1 ? 'drawing' : 'describing';
  room.submissions = new Map();
  const duration = room.state === 'drawing' ? room.config.drawTimerSec : room.config.describeTimerSec;
  room.deadline = Date.now() + duration * 1000;
  emitRoom(room);
  sendTasks(room);
  room.timer = setTimeout(() => finishRound(room), duration * 1000 + 500);
}

async function finishRound(room) {
  if (!['drawing', 'describing'].includes(room.state)) return;
  clearTimeout(room.timer);
  const finishingState = room.state;
  if (finishingState === 'drawing') {
    room.state = 'generating';
    emitRoom(room);
  }

  for (const player of room.players) {
    if (!room.submissions.has(player.id)) {
      const chain = assignmentFor(room, player.id);
      if (chain) {
        room.submissions.set(player.id, {
          chainId: chain.id,
          drawingUrl: null,
          description: null,
          auto: true
        });
      }
    }
  }

  if (finishingState === 'drawing') {
    await Promise.all([...room.submissions.entries()].map(async ([playerId, submission]) => {
      const chain = room.chains.find((item) => item.id === submission.chainId);
      if (!chain) return;
      const drawingUrl = submission.drawingUrl || await createBlankDrawing(room.code, playerId);
      chain.links.push({
        type: 'drawing',
        url: drawingUrl,
        authorId: playerId,
        createdAt: Date.now()
      });
      const generated = await createAiImage(room, chain, playerId, drawingUrl);
      chain.links.push({
        type: 'image',
        url: generated.url,
        authorId: generated.authorId,
        sourcePlayerId: playerId,
        createdAt: Date.now()
      });
    }));
  } else {
    for (const [playerId, submission] of room.submissions.entries()) {
      const chain = room.chains.find((item) => item.id === submission.chainId);
      if (!chain) continue;
      chain.links.push({
        type: 'description',
        text: cleanDescription(submission.description),
        authorId: playerId,
        createdAt: Date.now()
      });
    }
  }

  if (room.round >= room.config.numRounds) {
    room.state = 'reveal';
    room.deadline = null;
    emitRoom(room);
    return;
  }

  room.round += 1;
  beginTurn(room);
}

function cleanDescription(description) {
  const fallback = 'a mysterious cursed image';
  const text = String(description || '').trim();
  return text ? text.slice(0, 140) : fallback;
}

async function createBlankDrawing(roomCode, playerId) {
  const filename = `${Date.now()}-${nanoid(8)}-blank.png`;
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, createSolidPng(512, 512, [255, 250, 240]));
  return `/uploads/${filename}`;
}

function createSolidPng(width, height, rgb) {
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 2, 0, 0, 0])
    ])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    uint32(data.length),
    body,
    uint32(crc32(body))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createAiImage(room, chain, playerId, drawingUrl) {
  if (!falKey || forceMockAi) {
    return {
      url: await createMockAiImage(room, chain, playerId, drawingUrl),
      authorId: 'mock-ai'
    };
  }

  try {
    lastAiError = null;
    return {
      url: await withTimeout(createFalKontextImage(chain, drawingUrl), aiTimeoutMs, 'Fal generation timed out'),
      authorId: 'fal-ai'
    };
  } catch (error) {
    lastAiError = describeError(error);
    console.error('Fal generation failed, falling back to mock image:', lastAiError);
    return {
      url: await createMockAiImage(room, chain, playerId, drawingUrl),
      authorId: 'mock-ai'
    };
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function describeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    status: error?.status || error?.response?.status || null,
    body: error?.body || error?.response?.body || null
  };
}

async function createFalKontextImage(chain, drawingUrl) {
  const filename = path.basename(drawingUrl || '');
  const filepath = path.join(uploadDir, filename);
  const buffer = await fs.readFile(filepath);
  const contentType = contentTypeFor(filename);
  const sourceImageUrl = await fal.storage.upload(new Blob([buffer], { type: contentType }));
  const latestText = [...chain.links].reverse().find((link) => ['word', 'description'].includes(link.type));
  const prompt = [
    'Create a hyperrealistic, high-detail version of this simple player doodle.',
    'Use the drawing as the main structure: preserve the silhouette, pose, object placement, line proportions, and obvious mistakes.',
    'Make it look like a bright, colorful, clean studio photograph or premium realistic 3D render, with natural lighting and crisp detail.',
    'Use vivid but believable colors, playful color contrast, and clear subject/background separation.',
    'The result should be cursed because the doodle is awkward: strange anatomy, odd proportions, misplaced features, funny textures, and slightly wrong realism.',
    'Avoid horror styling, dark lighting, gore, grime, monsters, smoky shadows, generic scary imagery, muddy colors, monochrome palettes, and desaturated gray/brown looks.',
    'Do not replace the drawing with an unrelated image. Do not make it polished or normal.',
    latestText?.text ? `Subject to interpret from the doodle: ${latestText.text}` : ''
  ].filter(Boolean).join(' ');

  const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
    input: {
      prompt,
      image_url: sourceImageUrl,
      aspect_ratio: '1:1',
      num_images: 1,
      output_format: 'png',
      guidance_scale: 2.5,
      safety_tolerance: '2'
    }
  });

  const imageUrl = result?.data?.images?.[0]?.url || result?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error('Fal returned no image URL');
  }
  return imageUrl;
}

function contentTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

async function createMockAiImage(room, chain, playerId, drawingUrl) {
  const filename = `${Date.now()}-${nanoid(8)}-mock-ai.svg`;
  const filepath = path.join(uploadDir, filename);
  const player = room.players.find((item) => item.id === playerId);
  const hue = Math.floor(Math.random() * 360);
  const latestText = [...chain.links].reverse().find((link) => ['word', 'description'].includes(link.type));
  const label = escapeHtml(latestText?.text || chain.seedWord);
  const artist = escapeHtml(player?.name || 'Someone');
  const source = escapeHtml(drawingUrl || 'blank canvas');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="hsl(${hue}, 85%, 82%)"/>
      <stop offset="55%" stop-color="hsl(${(hue + 75) % 360}, 70%, 58%)"/>
      <stop offset="100%" stop-color="#161616"/>
    </radialGradient>
    <filter id="wobble">
      <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed="${Math.floor(Math.random() * 100)}"/>
      <feDisplacementMap in="SourceGraphic" scale="18"/>
    </filter>
  </defs>
  <rect width="768" height="768" fill="url(#g)"/>
  <g filter="url(#wobble)" opacity="0.92">
    <ellipse cx="384" cy="390" rx="185" ry="230" fill="rgba(255,255,255,0.78)"/>
    <circle cx="315" cy="335" r="32" fill="#111"/>
    <circle cx="454" cy="335" r="32" fill="#111"/>
    <path d="M285 475 C340 545 438 545 493 475" fill="none" stroke="#111" stroke-width="20" stroke-linecap="round"/>
    <path d="M250 230 C325 150 445 150 520 230" fill="none" stroke="#f6e7d7" stroke-width="42" stroke-linecap="round"/>
  </g>
  <rect x="46" y="604" width="676" height="104" rx="14" fill="rgba(0,0,0,0.58)"/>
  <text x="384" y="646" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">Mock AI: realistic cursed ${label}</text>
  <text x="384" y="684" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#ececec">Interpreted from ${artist}'s drawing</text>
  <text x="384" y="728" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#cccccc">source: ${source}</text>
</svg>`;
  await fs.writeFile(filepath, svg);
  await new Promise((resolve) => setTimeout(resolve, 600));
  return `/uploads/${filename}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

app.post('/api/drawings', upload.single('drawing'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'drawing file required' });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ai: {
      provider: falKey && !forceMockAi ? 'fal-ai/flux-pro/kontext' : 'mock',
      keyConfigured: Boolean(falKey),
      forcedMock: forceMockAi,
      timeoutMs: aiTimeoutMs,
      lastError: lastAiError
    }
  });
});

app.use('/uploads', express.static(uploadDir));

const distDir = path.join(rootDir, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }, reply) => {
    const { room, host } = createRoom(name);
    host.socketId = socket.id;
    socket.data.playerId = host.id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    reply?.({ ok: true, room: publicRoom(room), playerId: host.id });
    emitRoom(room);
  });

  socket.on('room:join', ({ code, name, asHost }, reply) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) {
      reply?.({ ok: false, error: 'Room not found' });
      return;
    }
    if (room.players.length >= room.config.maxPlayers) {
      reply?.({ ok: false, error: 'Room is full' });
      return;
    }
    const player = {
      id: nanoid(),
      socketId: socket.id,
      name: name?.trim() || 'Player',
      isHost: Boolean(asHost && room.hostId === socket.data.playerId),
      connected: true,
      prompts: []
    };
    room.players.push(player);
    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    reply?.({ ok: true, room: publicRoom(room), playerId: player.id });
    emitRoom(room);
  });

  socket.on('room:rejoin', ({ code, playerId }, reply) => {
    const room = rooms.get(String(code || '').toUpperCase());
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player) {
      reply?.({ ok: false });
      return;
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    reply?.({ ok: true, room: publicRoom(room), playerId: player.id });
    sendTask(room, player.id);
    emitRoom(room);
  });

  socket.on('game:start', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    if (!room || socket.data.playerId !== room.hostId) {
      reply?.({ ok: false, error: 'Only the host can start' });
      return;
    }
    if (room.players.length < room.config.minPlayers || room.players.length > room.config.maxPlayers) {
      reply?.({ ok: false, error: `Need ${room.config.minPlayers}-${room.config.maxPlayers} players` });
      return;
    }
    startGame(room);
    reply?.({ ok: true });
  });

  socket.on('prompts:update', ({ prompts }, reply) => {
    const room = getPlayerRoom(socket);
    const player = room?.players.find((item) => item.id === socket.data.playerId);
    if (!room || !player || room.state !== 'lobby') {
      reply?.({ ok: false, error: 'Prompts can only be updated in the lobby' });
      return;
    }
    player.prompts = Array.isArray(prompts) ? prompts.map(cleanPrompt).filter(Boolean).slice(0, 3) : [];
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on('prompt:choose', ({ prompt }, reply) => {
    const room = getPlayerRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || room.state !== 'choosing') {
      reply?.({ ok: false, error: 'No active prompt choice' });
      return;
    }
    if (room.submissions.has(playerId)) {
      reply?.({ ok: true });
      return;
    }
    const options = room.promptOptions[playerId] || [];
    const selected = cleanPrompt(prompt);
    room.submissions.set(playerId, {
      prompt: options.includes(selected) ? selected : options[0],
      auto: false
    });
    emitRoom(room);
    if (room.submissions.size >= room.players.length) {
      finishPromptChoice(room);
    }
    reply?.({ ok: true });
  });

  socket.on('drawing:submit', ({ drawingUrl }, reply) => {
    const room = getPlayerRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || room.state !== 'drawing') {
      reply?.({ ok: false, error: 'No active drawing round' });
      return;
    }
    if (room.submissions.has(playerId)) {
      reply?.({ ok: true });
      return;
    }
    const chain = assignmentFor(room, playerId);
    if (!chain) {
      reply?.({ ok: false, error: 'No chain assigned' });
      return;
    }
    room.submissions.set(playerId, {
      chainId: chain.id,
      drawingUrl,
      description: null,
      auto: false
    });
    emitRoom(room);
    if (room.submissions.size >= room.players.length) {
      finishRound(room);
    }
    reply?.({ ok: true });
  });

  socket.on('description:submit', ({ description }, reply) => {
    const room = getPlayerRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || room.state !== 'describing') {
      reply?.({ ok: false, error: 'No active description round' });
      return;
    }
    if (room.submissions.has(playerId)) {
      reply?.({ ok: true });
      return;
    }
    const chain = assignmentFor(room, playerId);
    if (!chain) {
      reply?.({ ok: false, error: 'No chain assigned' });
      return;
    }
    room.submissions.set(playerId, {
      chainId: chain.id,
      drawingUrl: null,
      description,
      auto: false
    });
    emitRoom(room);
    if (room.submissions.size >= room.players.length) {
      finishRound(room);
    }
    reply?.({ ok: true });
  });

  socket.on('host:nextReveal', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    if (!room || socket.data.playerId !== room.hostId) {
      reply?.({ ok: false, error: 'Only the host can manage reveal' });
      return;
    }
    room.revealIndex = Math.min(room.revealIndex + 1, Math.max(room.chains.length - 1, 0));
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on('host:prevReveal', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    if (!room || socket.data.playerId !== room.hostId) {
      reply?.({ ok: false, error: 'Only the host can manage reveal' });
      return;
    }
    room.revealIndex = Math.max(room.revealIndex - 1, 0);
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on('host:reset', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    if (!room || socket.data.playerId !== room.hostId) {
      reply?.({ ok: false, error: 'Only the host can reset' });
      return;
    }
    resetRoomToLobby(room);
    reply?.({ ok: true });
  });

  socket.on('room:returnToLobby', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    const host = room?.players.find((player) => player.id === room.hostId);
    const canReset = room && (socket.data.playerId === room.hostId || !host?.connected);
    if (!canReset) {
      reply?.({ ok: false, error: 'Only the host can reset while connected' });
      return;
    }
    resetRoomToLobby(room);
    reply?.({ ok: true });
  });

  socket.on('room:leave', (_payload, reply) => {
    const room = getPlayerRoom(socket);
    if (!room) {
      reply?.({ ok: true });
      return;
    }
    removePlayerFromRoom(room, socket.data.playerId);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    reply?.({ ok: true });
  });

  socket.on('host:kick', ({ playerId }, reply) => {
    const room = getPlayerRoom(socket);
    if (!room || socket.data.playerId !== room.hostId || room.state !== 'lobby') {
      reply?.({ ok: false, error: 'Only the host can kick in the lobby' });
      return;
    }
    if (playerId === room.hostId) {
      reply?.({ ok: false, error: 'Host cannot kick themselves' });
      return;
    }
    const index = room.players.findIndex((player) => player.id === playerId);
    if (index < 0) {
      reply?.({ ok: false, error: 'Player not found' });
      return;
    }
    const [player] = room.players.splice(index, 1);
    if (player.socketId) {
      io.to(player.socketId).emit('room:kicked');
      io.sockets.sockets.get(player.socketId)?.leave(room.code);
    }
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = getPlayerRoom(socket);
    if (!room) return;
    const player = room.players.find((item) => item.id === socket.data.playerId);
    if (player) {
      player.connected = false;
      player.socketId = null;
      promoteHostIfNeeded(room);
      emitRoom(room);
    }
  });
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
