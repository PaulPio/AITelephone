import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Ensure .env is at repo root and restart dev:web."
  );
}

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anon || "placeholder"
);

export const demoAuthBypass = import.meta.env.VITE_DEMO_AUTH_BYPASS === "true";
