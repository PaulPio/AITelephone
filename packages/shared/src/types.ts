export type GameState =
  | "LOBBY"
  | "DRAWING"
  | "GENERATING"
  | "REVEAL"
  | "GAME_OVER";

export type LinkType = "word" | "drawing" | "image";

export type RoundStartType = "word" | "redraw";

export interface RoomConfig {
  drawTimerSec: number;
  /** Total player turns (one draw per player). */
  numRounds: number;
  styleSuffix: string;
  /** Player whose turn it is to draw (sequential telephone). */
  activePlayerId?: string | null;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  displayIndex: number;
  connected: boolean;
  submitted: boolean;
  isHost: boolean;
}

export interface LinkSnapshot {
  id: string;
  type: LinkType;
  authorId: string | null;
  authorName?: string;
  content: string;
  round: number;
  createdAt: string;
}

export interface ChainSnapshot {
  id: string;
  chainIndex: number;
  seedWord: string;
  links: LinkSnapshot[];
}

export interface RoomSnapshot {
  id: string;
  code: string;
  hostPlayerId: string | null;
  state: GameState;
  round: number;
  maxPlayers: number;
  minPlayers: number;
  config: RoomConfig;
  players: PlayerSnapshot[];
  chains: ChainSnapshot[];
  revealChainIndex: number;
  deadline: string | null;
}

// Client → Server
export interface CreateRoomPayload {
  minPlayers?: number;
  maxPlayers?: number;
}

export interface CreateRoomResponse {
  code: string;
  roomId: string;
  playerId: string;
}

export interface JoinRoomPayload {
  code: string;
  name: string;
  accessToken: string;
}

export interface JoinRoomResponse {
  roomId: string;
  playerId: string;
  isHost: boolean;
}

export interface SubmitDrawingPayload {
  drawingUrl: string;
}

export interface DrawingUploadResponse {
  drawingUrl: string;
}

// Server → Client
export interface RoomUpdatePayload {
  room: RoomSnapshot;
}

export interface RoundStartPayload {
  type: RoundStartType;
  word?: string;
  image?: string;
  deadline: string;
  round: number;
  totalTurns: number;
  chainId: string;
  playerName: string;
}

export interface TurnWaitingPayload {
  round: number;
  totalTurns: number;
  activePlayerId: string;
  activePlayerName: string;
  /** What the active player is drawing from (for projector). */
  promptType: RoundStartType;
  word?: string;
  image?: string;
}

export interface GeneratingPayload {
  count: number;
  completed: number;
  failed: number;
}

/** Same AI image URL for every player in the room (one generation per turn). */
export interface AiImageReadyPayload {
  round: number;
  imageUrl: string;
}

export interface RevealStepPayload {
  chainId: string;
  chainIndex: number;
  links: LinkSnapshot[];
  chainCount: number;
}

export interface GameOverPayload {
  room: RoomSnapshot;
}

export const CLIENT_EVENTS = {
  CREATE_ROOM: "createRoom",
  JOIN_ROOM: "joinRoom",
  START_GAME: "startGame",
  SUBMIT_DRAWING: "submitDrawing",
  HOST_NEXT: "hostNext",
} as const;

export const SERVER_EVENTS = {
  ROOM_UPDATE: "roomUpdate",
  ROUND_START: "roundStart",
  TURN_WAITING: "turnWaiting",
  GENERATING: "generating",
  AI_IMAGE_READY: "aiImageReady",
  REVEAL_STEP: "revealStep",
  GAME_OVER: "gameOver",
  ERROR: "error",
} as const;

export const DEFAULT_CONFIG: RoomConfig = {
  drawTimerSec: 30,
  numRounds: 4,
  styleSuffix:
    "detailed vivid digital illustration, coherent subject, clean rendering",
};
