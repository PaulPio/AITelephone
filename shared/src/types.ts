export type GameState = "LOBBY" | "DRAWING" | "GENERATING" | "REVEAL" | "GAME_OVER";

export type LinkType = "word" | "drawing" | "image";

export type Player = {
  id: string;
  name: string;
  connected: boolean;
};

export type Link = {
  type: LinkType;
  authorId: string;
  content: string;
  createdAt: string;
};

export type Chain = {
  id: string;
  seedWord: string;
  links: Link[];
};

export type RoomConfig = {
  numRounds: number;
  drawTimerSec: number;
  model: string;
  styleSuffix: string;
};

export type RoundSubmission = {
  chainId: string;
  drawingUrl: string;
};

export type Room = {
  code: string;
  hostId: string;
  state: GameState;
  round: number;
  revealIndex: number;
  config: RoomConfig;
  players: Player[];
  chains: Chain[];
  submissions: Record<string, RoundSubmission>;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomAck = {
  code: string;
  hostId: string;
};

export type JoinRoomPayload = {
  code: string;
  name: string;
};

export type JoinRoomAck = {
  playerId: string;
  room: PublicRoom;
};

export type PublicRoom = Omit<Room, "submissions"> & {
  submittedPlayerIds: string[];
};

export type RoundStartPayload =
  | {
      type: "word";
      chainId: string;
      round: number;
      word: string;
      deadline: string;
    }
  | {
      type: "redraw";
      chainId: string;
      round: number;
      image: string;
      deadline: string;
    };

export type SubmitDrawingPayload = {
  roomCode: string;
  playerId: string;
  drawingUrl: string;
};

export type UploadDrawingResponse = {
  drawingUrl: string;
  objectKey: string;
};

export type RevealStepPayload = {
  chainId: string;
  links: Link[];
  index: number;
};

export type ServerToClientEvents = {
  roomUpdate: (room: PublicRoom) => void;
  roundStart: (payload: RoundStartPayload) => void;
  generating: (payload: { count: number }) => void;
  revealStep: (payload: RevealStepPayload) => void;
  gameOver: (payload: { room: PublicRoom }) => void;
  errorMessage: (payload: { message: string }) => void;
};

export type ClientToServerEvents = {
  createRoom: (payload: Record<string, never>, ack: (response: CreateRoomAck) => void) => void;
  joinRoom: (payload: JoinRoomPayload, ack: (response: JoinRoomAck | { error: string }) => void) => void;
  startGame: (payload: { code: string; hostId: string }) => void;
  submitDrawing: (payload: SubmitDrawingPayload) => void;
  hostNext: (payload: { code: string; hostId: string }) => void;
};
