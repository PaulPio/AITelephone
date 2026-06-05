const localBackendUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
const configuredBackendUrl = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_SOCKET_URL;

export const API_URL = configuredBackendUrl ?? (import.meta.env.DEV ? localBackendUrl : "");
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (import.meta.env.DEV ? localBackendUrl : window.location.origin);
export const JOIN_URL = import.meta.env.VITE_JOIN_URL ?? `${window.location.origin}/play`;
