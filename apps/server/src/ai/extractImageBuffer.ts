export function bufferFromDataUrl(url: string): Buffer | null {
  if (!url.startsWith("data:image")) return null;
  const b64 = url.replace(/^data:image\/\w+;base64,/, "");
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/** OpenRouter chat/completions JSON (images live on choices[0].message.images). */
export function extractImageBufferFromOpenRouterCompletion(
  completion: unknown
): Buffer | null {
  const msg = (
    completion as {
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string }; url?: string }>;
          content?: unknown;
        };
      }>;
    }
  ).choices?.[0]?.message;

  if (!msg) return null;

  const directUrl =
    msg.images?.[0]?.image_url?.url ?? msg.images?.[0]?.url;
  const fromImages = bufferFromDataUrl(directUrl ?? "");
  if (fromImages) return fromImages;

  return extractImageBufferFromResult({ response: { messages: [msg] } });
}

export function extractImageBufferFromResult(result: unknown): Buffer | null {
  const r = result as {
    files?: Array<{ base64?: string; uint8Array?: Uint8Array }>;
    response?: { messages?: unknown[] };
  };

  if (r.files?.[0]?.uint8Array) {
    return Buffer.from(r.files[0].uint8Array);
  }
  if (r.files?.[0]?.base64) {
    return Buffer.from(r.files[0].base64, "base64");
  }

  const tryImageUrl = (url: string | undefined): Buffer | null => {
    if (!url) return null;
    return bufferFromDataUrl(url);
  };

  const messages = r.response?.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (typeof msg !== "object" || msg === null) continue;
      const images = (msg as { images?: Array<{ image_url?: { url?: string } }> })
        .images;
      const fromImages = tryImageUrl(images?.[0]?.image_url?.url);
      if (fromImages) return fromImages;

      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const imageUrl = (part as { image_url?: { url?: string } }).image_url
          ?.url;
        const fromPartUrl = tryImageUrl(imageUrl);
        if (fromPartUrl) return fromPartUrl;
        if (
          (part as { type?: string }).type === "image" &&
          (part as { image?: string }).image
        ) {
          const img = (part as { image: string }).image;
          const fromInline = tryImageUrl(
            img.startsWith("data:") ? img : `data:image/png;base64,${img}`
          );
          if (fromInline) return fromInline;
        }
      }
    }
  }

  return null;
}
