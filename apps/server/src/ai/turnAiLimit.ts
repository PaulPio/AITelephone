/** One AI image URL per room turn; concurrent callers share the same in-flight promise. */
const inFlightPromises = new Map<string, Promise<string>>();
const completedUrls = new Map<string, string>();

export function turnAiKey(
  roomId: string,
  turn: number,
  chainIndex?: number
): string {
  if (chainIndex === undefined) return `${roomId}:${turn}`;
  return `${roomId}:${turn}:c${chainIndex}`;
}

export function getCachedTurnImageUrl(
  roomId: string,
  turn: number,
  chainIndex: number
): string | undefined {
  return completedUrls.get(turnAiKey(roomId, turn, chainIndex));
}

/** Clears in-memory turn cache (tests only). */
export function resetTurnAiLimitForTests(): void {
  inFlightPromises.clear();
  completedUrls.clear();
}

/** Drop cached / in-flight AI result so a new doodle can be transformed. */
export function clearTurnAiForTurn(
  roomId: string,
  turn: number,
  chainIndex?: number
): void {
  if (chainIndex === undefined) {
    const prefix = `${roomId}:${turn}`;
    for (const key of [...inFlightPromises.keys(), ...completedUrls.keys()]) {
      if (key === prefix || key.startsWith(`${prefix}:c`)) {
        inFlightPromises.delete(key);
        completedUrls.delete(key);
      }
    }
    return;
  }
  const key = turnAiKey(roomId, turn, chainIndex);
  inFlightPromises.delete(key);
  completedUrls.delete(key);
}

/**
 * Runs `factory` at most once per room+turn. Later callers await the same result URL.
 */
export function runTurnTransformOnce(
  roomId: string,
  turn: number,
  chainIndex: number,
  factory: () => Promise<string>
): Promise<string> {
  const key = turnAiKey(roomId, turn, chainIndex);
  const cached = completedUrls.get(key);
  if (cached) return Promise.resolve(cached);

  let job = inFlightPromises.get(key);
  if (!job) {
    job = factory()
      .then((url) => {
        completedUrls.set(key, url);
        inFlightPromises.delete(key);
        return url;
      })
      .catch((err) => {
        inFlightPromises.delete(key);
        throw err;
      });
    inFlightPromises.set(key, job);
  }
  return job;
}

