import type { UploadDrawingResponse } from "@gartic-ai/shared";
import { API_URL } from "../env";

export async function uploadDrawing(input: {
  blob: Blob;
  roomCode: string;
  playerId: string;
  chainId: string;
}): Promise<UploadDrawingResponse> {
  const formData = new FormData();
  formData.append("drawing", input.blob, "drawing.png");
  formData.append("roomCode", input.roomCode);
  formData.append("playerId", input.playerId);
  formData.append("chainId", input.chainId);

  const response = await fetch(`${API_URL}/api/drawing`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Drawing upload failed with ${response.status}`);
  }

  return (await response.json()) as UploadDrawingResponse;
}
