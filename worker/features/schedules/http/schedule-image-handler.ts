import { readImageImportBody } from "./image-import-body";
import type { Env } from "../../../platform/types";
import { authenticateRequest } from "../../../platform/auth";
import { SCHEDULE_IMAGE_LIMITS as limits, SCHEDULE_IMAGE_DETAIL_REGIONS } from "../../../../contracts/schedule-image-import";
import type { ScheduleImageBudget, ScheduleImageReader } from "../application/ports/schedule-image-reader";
import type { ImageScheduleMember } from "../domain/schedule-image-result";
import { readScheduleImage, ScheduleImageError } from "../application/read-schedule-image";

type Dependencies = { reader: ScheduleImageReader; budget: ScheduleImageBudget; members: () => Promise<ImageScheduleMember[]> };
const failure = (message: string, status: number) => Response.json({ error: { code: "SCHEDULE_IMAGE_ERROR", message } }, { status, headers: { "Cache-Control": "no-store" } });
async function imageBytes(file: File | string | undefined, maxBytes: number) {
  if (typeof file === "string" || !file || file.size === 0 || file.size > maxBytes || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new ScheduleImageError("PNG·JPG·WEBP 원본 1장(10MB 이하)과 허용된 확대 영역만 지원합니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (!magic) throw new ScheduleImageError("이미지 파일 형식을 확인해주세요.");
  return { bytes, mediaType: file.type };
}
async function readImage(request: Request) {
  const body = await readImageImportBody(request, limits.bytes + limits.detailBytes * SCHEDULE_IMAGE_DETAIL_REGIONS.length + 100_000);
  const uploadedAt = Date.now();
  let form: FormData;
  try { form = await new Response(body, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData(); }
  catch { throw new ScheduleImageError("이미지 업로드 형식을 확인해주세요."); }
  const originals = form.getAll("image"), views = form.getAll("detail");
  if (originals.length !== 1 || [...form.keys()].some(key => key !== "image" && key !== "detail") ||
    views.length !== 0 && views.length !== SCHEDULE_IMAGE_DETAIL_REGIONS.length) throw new ScheduleImageError("원본 1장과 확대 영역 묶음을 확인해주세요.");
  const original = await imageBytes(originals[0], limits.bytes);
  const regions = new Set<string>();
  const details = [];
  for (const view of views) {
    const region = typeof view !== "string" && SCHEDULE_IMAGE_DETAIL_REGIONS.find(r => view.name === `${r}.png`);
    if (!region || regions.has(region) || typeof view === "string" || view.type !== "image/png") throw new ScheduleImageError("확대 영역 묶음을 확인해주세요.");
    regions.add(region); details.push({ region, ...await imageBytes(view, limits.detailBytes) });
  }
  return { ...original, ...(details.length ? { details } : {}), uploadedAt };
}
export const createScheduleImageHandler = (resolve: (env: Env) => Dependencies) => async (request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> => {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return auth.response;
  try {
    const { uploadedAt, ...image } = await readImage(request);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.max(0, limits.timeoutMs - (Date.now() - uploadedAt)))]);
    const deps = resolve(env);
    const analysis = (async () => {
      const members = await deps.members(); signal.throwIfAborted();
      return readScheduleImage(deps.reader, deps.budget, { ...image, members }, auth.user.id, signal);
    })();
    let onAbort = () => {};
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(new ScheduleImageError("인식 시간이 초과되었거나 취소되었습니다. 자동 재시도하지 않으며 이미 보낸 요청의 비용은 발생할 수 있습니다.", 504));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      const result = await Promise.race([analysis, deadline]);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } finally {
      signal.removeEventListener("abort", onAbort);
      // D1 cannot be cancelled. Let reservation cleanup finish without extending the UI deadline.
      ctx?.waitUntil(analysis.then(() => {}, () => {}));
    }
  } catch (error) {
    if (error instanceof ScheduleImageError) return failure(error.message, error.status);
    // Never pass provider error bodies, image bytes or the model's raw output to the global logger.
    return failure("일정표를 읽지 못했습니다. 자동 재시도하지 않으며, 다시 읽으면 새 인식으로 계산됩니다.", 502);
  }
};
