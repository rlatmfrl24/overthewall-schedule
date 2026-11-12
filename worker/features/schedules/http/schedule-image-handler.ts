import type { Env } from "../../../platform/types";
import { authenticateRequest } from "../../../platform/auth";
import { SCHEDULE_IMAGE_LIMITS as limits } from "../../../../contracts/schedule-image-import";
import type { ScheduleImageBudget, ScheduleImageReader } from "../application/ports/schedule-image-reader";
import type { ImageScheduleMember } from "../domain/schedule-image-result";
import { readScheduleImage, ScheduleImageError } from "../application/read-schedule-image";

type Dependencies = { reader: ScheduleImageReader; budget: ScheduleImageBudget; members: () => Promise<ImageScheduleMember[]> };
const failure = (message: string, status: number) => Response.json({ error: { code: "SCHEDULE_IMAGE_ERROR", message } }, { status, headers: { "Cache-Control": "no-store" } });
async function readImage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ScheduleImageError("일정표 이미지 1장을 선택해주세요.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > limits.bytes + 100_000) { await reader.cancel(); throw new ScheduleImageError("이미지는 10MB 이하로 올려주세요."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  let form: FormData;
  try { form = await new Response(body, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData(); }
  catch { throw new ScheduleImageError("이미지 업로드 형식을 확인해주세요."); }
  const entries = [...form.entries()]; const file = entries[0]?.[1];
  if (entries.length !== 1 || entries[0]?.[0] !== "image" || typeof file === "string" || !file ||
    file.size === 0 || file.size > limits.bytes || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new ScheduleImageError("PNG·JPG·WEBP 이미지 1장, 10MB 이하만 지원합니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (!magic) throw new ScheduleImageError("이미지 파일 형식을 확인해주세요.");
  return { bytes, mediaType: file.type };
}
export const createScheduleImageHandler = (resolve: (env: Env) => Dependencies) => async (request: Request, env: Env): Promise<Response> => {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return auth.response;
  try {
    const image = await readImage(request);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(limits.timeoutMs)]);
    const deps = resolve(env);
    const members = await deps.members();
    const result = await readScheduleImage(deps.reader, deps.budget, { ...image, members }, auth.user.id, signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ScheduleImageError) return failure(error.message, error.status);
    // Never pass provider error bodies, image bytes or the model's raw output to the global logger.
    return failure("일정표를 읽지 못했습니다. 자동 재시도하지 않으며, 다시 읽으면 새 인식으로 계산됩니다.", 502);
  }
};
