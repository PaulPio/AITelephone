export type ImageGenerationRequest = {
  drawingUrl: string;
  styleSuffix: string;
};

export type ImageGenerationResult = {
  imageUrl: string;
  fallback: boolean;
};

export type ImageProvider = (request: ImageGenerationRequest) => Promise<{ imageUrl: string }>;

type PipelineOptions = {
  fallbackImageUrl: string;
  timeoutMs: number;
  provider: ImageProvider;
};

export function createImageToImagePipeline(options: PipelineOptions) {
  return {
    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
      try {
        const generated = await withTimeout(options.provider(request), options.timeoutMs);
        return { imageUrl: generated.imageUrl, fallback: false };
      } catch {
        return { imageUrl: options.fallbackImageUrl, fallback: true };
      }
    }
  };
}

export function createHttpImageProvider(endpoint: string, apiKey: string): ImageProvider {
  return async (request) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        image: request.drawingUrl,
        prompt: buildCursedPrompt(request.styleSuffix)
      })
    });

    if (!response.ok) {
      throw new Error(`AI provider failed with ${response.status}`);
    }

    const payload = (await response.json()) as { imageUrl?: string; url?: string; output?: string[] };
    const imageUrl = payload.imageUrl ?? payload.url ?? payload.output?.[0];
    if (!imageUrl) {
      throw new Error("AI provider did not return an image URL");
    }
    return { imageUrl };
  };
}

function buildCursedPrompt(styleSuffix: string): string {
  return [
    "Transform this rough hand-drawn sketch into a realistic image that preserves the visible subject and silhouette.",
    "The result should feel uncanny, absurd, accidentally horrifying, and funny, not cute or polished.",
    styleSuffix
  ].join(" ");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("AI generation timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
