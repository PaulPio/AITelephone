export function getAssignedChainId(playerIndex: number, chainIds: string[], round: number): string {
  if (round < 1) {
    throw new Error("round must be at least 1");
  }
  if (playerIndex < 0 || playerIndex >= chainIds.length) {
    throw new Error("player index is out of range");
  }

  return chainIds[(playerIndex + round - 1) % chainIds.length];
}

export function buildRoundAssignments(
  playerIds: string[],
  chainIds: string[],
  round: number
): Record<string, string> {
  if (playerIds.length !== chainIds.length) {
    throw new Error("player and chain counts must match");
  }

  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, getAssignedChainId(index, chainIds, round)])
  );
}
