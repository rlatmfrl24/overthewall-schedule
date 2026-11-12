import { ScheduleImageError } from "../application/read-schedule-image";

export async function readImageImportBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ScheduleImageError("업로드 내용을 확인해주세요.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) { await reader.cancel(); throw new ScheduleImageError("업로드 크기 제한을 초과했습니다."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}
