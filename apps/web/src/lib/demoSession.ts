import { demoAuthBypass } from "./supabase";

const STORAGE_KEY = "drift-demo-session";

export type DemoPath = "/host" | "/play";

export type DemoRoomSession = {
  version: 1;
  token: string;
  email: string;
  displayName: string;
  path: DemoPath;
  roomCode: string;
  playerId?: string;
  minPlayers?: number;
};

function defaultSession(token: string, path: DemoPath): DemoRoomSession {
  return {
    version: 1,
    token,
    email: "demo@drift.local",
    displayName: path === "/host" ? "Host" : "Player",
    path,
    roomCode: "",
  };
}

export function loadDemoSession(): DemoRoomSession | null {
  if (!demoAuthBypass) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoRoomSession;
    if (parsed.version !== 1 || !parsed.token?.startsWith("demo:")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDemoSession(patch: Partial<DemoRoomSession>): void {
  if (!demoAuthBypass) return;
  const prev = loadDemoSession();
  const path =
    patch.path ??
    prev?.path ??
    (window.location.pathname.startsWith("/play") ? "/play" : "/host");
  const token = patch.token ?? prev?.token ?? `demo:${crypto.randomUUID()}`;
  const next: DemoRoomSession = {
    ...defaultSession(token, path),
    ...prev,
    ...patch,
    version: 1,
    token,
    path,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearDemoSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getOrCreateDemoToken(): string {
  const existing = loadDemoSession();
  if (existing?.token.startsWith("demo:")) return existing.token;
  const token = `demo:${crypto.randomUUID()}`;
  const path = window.location.pathname.startsWith("/play") ? "/play" : "/host";
  saveDemoSession(defaultSession(token, path));
  return token;
}

export function demoHomePath(): DemoPath {
  return loadDemoSession()?.path ?? "/host";
}
