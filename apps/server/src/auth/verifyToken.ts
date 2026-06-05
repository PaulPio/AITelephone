import { randomUUID } from "crypto";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";

export async function verifyAccessToken(
  accessToken: string | undefined
): Promise<{ userId: string } | null> {
  if (!accessToken) return null;

  if (config.demoAuthBypass && accessToken.startsWith("demo:")) {
    const raw = accessToken.slice(5);
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return { userId: uuidRe.test(raw) ? raw : randomUUID() };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}
