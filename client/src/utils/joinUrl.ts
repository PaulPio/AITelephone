export function buildJoinUrl(baseUrl: string, roomCode: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("code", roomCode);
  return url.toString();
}
