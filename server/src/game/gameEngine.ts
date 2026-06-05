import { toPublicRoom, type PublicRoom, type RevealStepPayload, type Room } from "@gartic-ai/shared";
import type { ImageGenerationRequest, ImageGenerationResult } from "../ai/imageToImage";
import type { RoomStore } from "./roomStore";
import { appendGeneratedImages, nextRevealStep, startNextRound, submitDrawing } from "./stateMachine";

export type GameEngineResult = {
  room: PublicRoom;
  revealStep?: RevealStepPayload;
  generated?: boolean;
};

type ImagePipeline = {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
};

export function createGameEngine(store: RoomStore, imagePipeline: ImagePipeline) {
  async function submitDrawingForRoom(
    code: string,
    playerId: string,
    drawingUrl: string
  ): Promise<GameEngineResult> {
    const submitted = await store.update(code, (current) => submitDrawing(current, playerId, drawingUrl).room);
    const roundComplete = Object.keys(submitted.submissions).length === submitted.players.length;
    if (!roundComplete) {
      return { room: toPublicRoom(submitted) };
    }

    await store.save({ ...submitted, state: "GENERATING" });
    const generatedRoom = await generateForSubmittedRound(submitted, imagePipeline);
    const nextRoom = startNextRound(generatedRoom);
    await store.save(nextRoom);

    return {
      room: toPublicRoom(nextRoom),
      generated: true,
      revealStep: nextRoom.state === "REVEAL" ? revealStepFor(nextRoom) : undefined
    };
  }

  return {
    async startGame(code: string, hostId: string): Promise<GameEngineResult> {
      const room = await store.update(code, (current) => {
        assertHost(current, hostId);
        if (current.players.length < 3) {
          throw new Error("at least three players are required");
        }
        return startNextRound(current);
      });
      return { room: toPublicRoom(room) };
    },

    async submitDrawing(code: string, playerId: string, drawingUrl: string): Promise<GameEngineResult> {
      return submitDrawingForRoom(code, playerId, drawingUrl);
    },

    async autoSubmitMissing(code: string, drawingUrl: string): Promise<GameEngineResult> {
      const current = await store.get(code);
      if (!current || current.state !== "DRAWING") {
        throw new Error("room is not drawing");
      }

      let latest: GameEngineResult = { room: toPublicRoom(current) };
      for (const player of current.players) {
        const room = await store.get(code);
        if (!room || room.state !== "DRAWING" || room.submissions[player.id]) {
          continue;
        }
        latest = await submitDrawingForRoom(code, player.id, drawingUrl);
      }
      return latest;
    },

    async advanceReveal(code: string, hostId: string): Promise<GameEngineResult> {
      const room = await store.update(code, (current) => {
        assertHost(current, hostId);
        return nextRevealStep(current);
      });
      return {
        room: toPublicRoom(room),
        revealStep: room.state === "REVEAL" ? revealStepFor(room) : undefined
      };
    }
  };
}

async function generateForSubmittedRound(room: Room, imagePipeline: ImagePipeline): Promise<Room> {
  const entries = await Promise.all(
    Object.values(room.submissions).map(async (submission) => {
      const result = await imagePipeline.generate({
        drawingUrl: submission.drawingUrl,
        styleSuffix: room.config.styleSuffix
      });
      return [submission.chainId, result.imageUrl] as const;
    })
  );

  return appendGeneratedImages(room, Object.fromEntries(entries));
}

function revealStepFor(room: Room): RevealStepPayload {
  const chain = room.chains[room.revealIndex] ?? room.chains[0];
  return {
    chainId: chain.id,
    links: chain.links,
    index: room.revealIndex
  };
}

function assertHost(room: Room, hostId: string): void {
  if (room.hostId !== hostId) {
    throw new Error("only the host can do that");
  }
}
