import {
  buildRoundAssignments,
  latestImageForChain,
  type Chain,
  type Link,
  type Room,
  type RoundStartPayload
} from "@gartic-ai/shared";

export function startNextRound(room: Room, now = new Date()): Room {
  if (room.round >= room.config.numRounds) {
    return {
      ...room,
      state: "REVEAL",
      submissions: {},
      deadline: undefined,
      revealIndex: 0
    };
  }

  const deadline = new Date(now.getTime() + room.config.drawTimerSec * 1000).toISOString();
  return {
    ...room,
    state: "DRAWING",
    round: room.round + 1,
    submissions: {},
    deadline
  };
}

export function buildRoundStarts(room: Room): Record<string, RoundStartPayload> {
  if (!room.deadline) {
    throw new Error("cannot build round starts without a deadline");
  }

  const assignments = buildRoundAssignments(
    room.players.map((player) => player.id),
    room.chains.map((chain) => chain.id),
    room.round
  );

  return Object.fromEntries(
    room.players.map((player) => {
      const chain = findChain(room.chains, assignments[player.id]);
      const payload: RoundStartPayload =
        room.round === 1
          ? {
              type: "word",
              chainId: chain.id,
              round: room.round,
              word: chain.seedWord,
              deadline: room.deadline!
            }
          : {
              type: "redraw",
              chainId: chain.id,
              round: room.round,
              image: latestImageForChain(chain) ?? "",
              deadline: room.deadline!
            };
      return [player.id, payload];
    })
  );
}

export function submitDrawing(
  room: Room,
  playerId: string,
  drawingUrl: string,
  now = new Date()
): { room: Room; roundComplete: boolean } {
  if (room.state !== "DRAWING") {
    throw new Error("drawings can only be submitted during DRAWING");
  }
  const playerIndex = room.players.findIndex((player) => player.id === playerId);
  if (playerIndex === -1) {
    throw new Error("player is not in this room");
  }
  if (room.submissions[playerId]) {
    return { room, roundComplete: Object.keys(room.submissions).length === room.players.length };
  }

  const assignments = buildRoundAssignments(
    room.players.map((player) => player.id),
    room.chains.map((chain) => chain.id),
    room.round
  );
  const chainId = assignments[playerId];
  const drawingLink: Link = {
    type: "drawing",
    authorId: playerId,
    content: drawingUrl,
    createdAt: now.toISOString()
  };

  const nextRoom: Room = {
    ...room,
    submissions: {
      ...room.submissions,
      [playerId]: { chainId, drawingUrl }
    },
    chains: room.chains.map((chain) =>
      chain.id === chainId ? { ...chain, links: [...chain.links, drawingLink] } : chain
    )
  };

  return {
    room: nextRoom,
    roundComplete: Object.keys(nextRoom.submissions).length === nextRoom.players.length
  };
}

export function appendGeneratedImages(
  room: Room,
  imageUrlsByChainId: Record<string, string>,
  now = new Date()
): Room {
  return {
    ...room,
    state: "GENERATING",
    chains: room.chains.map((chain) => {
      const imageUrl = imageUrlsByChainId[chain.id];
      if (!imageUrl) {
        return chain;
      }
      return {
        ...chain,
        links: [
          ...chain.links,
          {
            type: "image",
            authorId: "ai",
            content: imageUrl,
            createdAt: now.toISOString()
          }
        ]
      };
    })
  };
}

export function nextRevealStep(room: Room): Room {
  if (room.state !== "REVEAL") {
    return room;
  }
  const nextIndex = room.revealIndex + 1;
  return {
    ...room,
    revealIndex: nextIndex >= room.chains.length ? room.revealIndex : nextIndex,
    state: nextIndex >= room.chains.length ? "GAME_OVER" : "REVEAL"
  };
}

function findChain(chains: Chain[], chainId: string): Chain {
  const chain = chains.find((candidate) => candidate.id === chainId);
  if (!chain) {
    throw new Error(`Chain ${chainId} not found`);
  }
  return chain;
}
