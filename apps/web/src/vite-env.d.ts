/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_PUBLIC_APP_URL: string;
  readonly VITE_DEMO_AUTH_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
