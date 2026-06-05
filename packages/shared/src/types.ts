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
  numRounds: number;
  styleSuffix: string;
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
  chainId: string;
}

export interface GeneratingPayload {
  count: number;
  completed: number;
  failed: number;
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
  GENERATING: "generating",
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
