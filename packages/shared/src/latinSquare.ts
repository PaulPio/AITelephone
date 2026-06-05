/** Player i draws chain (i + round - 1) mod N — PRD §4.1 */
export function chainIndexForPlayer(
  playerIndex: number,
  round: number,
  playerCount: number
): number {
  return (playerIndex + round - 1) % playerCount;
}

export function buildAssignmentMap(
  round: number,
  playerCount: number
): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    map.set(i, chainIndexForPlayer(i, round, playerCount));
  }
  return map;
}
