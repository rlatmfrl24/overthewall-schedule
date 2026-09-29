import type { AiBatchSelection } from "@contracts/otw-play-ai-batch";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { AiBatchService } from "../application/ai-batch-service";
import { AiReviewError } from "../application/ports/ai-review";

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_:-]{1,200}$/.test(v);
const invalid = () => new AiReviewError("invalid_request", "일괄 요청 대상과 조회 조건을 확인하세요.");
export function parseAiBatchSelection(value: unknown): AiBatchSelection {
  if (!object(value) || Object.keys(value).length !== 1) throw invalid();
  if (Array.isArray(value.candidates)) {
    if (!value.candidates.length || value.candidates.length > 1000) throw invalid();
    const candidates = new Map<string, number>();
    for (const v of value.candidates) {
      if (!object(v) || Object.keys(v).length !== 2 || !id(v.id) || !Number.isSafeInteger(v.version) || Number(v.version) < 0) throw invalid();
      if (candidates.has(v.id) && candidates.get(v.id) !== v.version) throw invalid();
      candidates.set(v.id, Number(v.version));
    }
    return { candidates: [...candidates].sort(([a], [b]) => a.localeCompare(b)).map(([id, version]) => ({ id, version })) };
  }
  const f = value.filters;
  if (!object(f) || Object.keys(f).some(k => !["source", "jobId", "candidateKind"].includes(k)) ||
    !["playlist", "automatic"].includes(String(f.source)) || (f.jobId !== undefined && (!id(f.jobId) || f.source !== "playlist")) ||
    (f.candidateKind !== undefined && !["official_video", "singing_clip"].includes(String(f.candidateKind)))) throw invalid();
  return { filters: { source: f.source as "playlist" | "automatic", ...(f.jobId ? { jobId: String(f.jobId) } : {}),
    ...(f.candidateKind ? { candidateKind: f.candidateKind as "official_video" | "singing_clip" } : {}) } };
}
export const createAiBatchHandler = (resolve: (env: Env) => AiBatchService) => async (request: Request, env: Env) => {
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const service = resolve(env), url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    let key: string | undefined;
    try { key = parts[4] ? decodeURIComponent(parts[4]) : undefined; } catch { throw invalid(); }
    const action = parts[5];
    if (request.method === "GET") {
      if (parts[3] === "ai-review-drafts") {
        if (!id(key) || url.search) throw invalid();
        return json({ data: await service.draft(key) });
      }
      if (!key) {
        if (url.search) throw invalid();
        return json({ data: await service.list() });
      }
      const cursor = url.searchParams.get("cursor") ?? undefined;
      if (!id(key) || (cursor !== undefined && !id(cursor)) || [...url.searchParams.keys()].some(k => k !== "cursor") || url.searchParams.getAll("cursor").length > 1) throw invalid();
      return json({ data: await service.get(key, cursor) });
    }
    if (request.method !== "POST" || url.search) throw invalid();
    if (action === "retry" && id(key)) return json({ data: await service.retry(key) }, 202);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 131072) throw new AiReviewError("invalid_request", "일괄 요청이 너무 큽니다.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw invalid(); }
    if (!object(body) || Object.keys(body).some(k => !["selection", "idempotencyKey"].includes(k))) throw invalid();
    const selection = parseAiBatchSelection(body.selection);
    if (key === "preview") return json({ data: { count: await service.preview(selection) } });
    if (key || typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) throw invalid();
    return json({ data: await service.start(selection, body.idempotencyKey, admin.user.id) }, 202);
  } catch (error) {
    const e = error instanceof AiReviewError ? error : new AiReviewError("batch_unavailable", "일괄 요청을 처리하지 못했습니다. 다시 시도하세요.", 503);
    return json({ error: { code: e.code, message: e.message } }, e.status);
  }
};
