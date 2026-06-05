import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase.js";

export async function uploadDrawing(
  roomId: string,
  playerId: string,
  buffer: Buffer
): Promise<string> {
  const path = `${roomId}/${playerId}/${randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("drawings")
    .upload(path, buffer, { contentType: "image/png", upsert: false });

  if (error) throw new Error(`Drawing upload failed: ${error.message}`);

  const { data } = supabase.storage.from("drawings").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadAiImage(
  roomId: string,
  buffer: Buffer
): Promise<string> {
  const path = `${roomId}/ai/${randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("ai-images")
    .upload(path, buffer, { contentType: "image/png", upsert: false });

  if (error) throw new Error(`AI image upload failed: ${error.message}`);

  const { data } = supabase.storage.from("ai-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPlaceholder(roomId: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect fill="#e8dcc8" width="512" height="512"/><text x="256" y="256" text-anchor="middle" font-size="24" fill="#5c4a3a">AI had a moment</text></svg>`;
  const buffer = Buffer.from(svg);
  const path = `${roomId}/ai/placeholder-${randomUUID()}.svg`;
  const { error } = await supabase.storage
    .from("ai-images")
    .upload(path, buffer, { contentType: "image/svg+xml", upsert: false });

  if (error) return "data:image/svg+xml;base64," + buffer.toString("base64");
  const { data } = supabase.storage.from("ai-images").getPublicUrl(path);
  return data.publicUrl;
}
