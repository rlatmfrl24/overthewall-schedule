import { parsePersonalMultiviewChannelInput, type MultiviewErrorCode } from "@contracts/multiview";
import { parseSiteId } from "@contracts/site-definition";
import { authenticateRequest } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { MultiviewServiceError, type MultiviewService } from "../application/multiview-service";

const headers = { "Cache-Control": "no-store", Vary: "Authorization, Cookie" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const messages: Record<MultiviewErrorCode, string> = {
  MULTIVIEW_INVALID_INPUT: "올바른 치지직 채널 주소나 채널 ID를 입력해 주세요.",
  MULTIVIEW_AUTH_REQUIRED: "로그인이 필요합니다.",
  MULTIVIEW_CHANNEL_NOT_FOUND: "치지직 채널을 찾을 수 없어요. 주소를 확인해 주세요.",
  MULTIVIEW_CHANNEL_LIMIT: "채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요.",
  MULTIVIEW_BODY_TOO_LARGE: "입력 내용이 너무 길어요.",
  MULTIVIEW_RATE_LIMITED: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  MULTIVIEW_UNAVAILABLE: "채널 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};
const invalid = () => new MultiviewServiceError(400, "MULTIVIEW_INVALID_INPUT");
async function readInput(request: Request): Promise<string> {
  if (Number(request.headers.get("Content-Length")) > 4096) throw new MultiviewServiceError(413, "MULTIVIEW_BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  let bytes = 0, raw = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new MultiviewServiceError(413, "MULTIVIEW_BODY_TOO_LARGE"); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw invalid(); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("input" in body)) throw invalid();
  const channelId = parsePersonalMultiviewChannelInput(body.input);
  if (!channelId) throw invalid();
  return channelId;
}

export const createMultiviewChannelHandler = (resolve: (env: Env) => MultiviewService) => async (request: Request, env: Env): Promise<Response> => {
  try {
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) throw new MultiviewServiceError(auth.response.status === 500 ? 503 : 401, auth.response.status === 500 ? "MULTIVIEW_UNAVAILABLE" : "MULTIVIEW_AUTH_REQUIRED");
    const url = new URL(request.url), owner = auth.user.id;
    if (url.searchParams.size) throw invalid();
    const collection = url.pathname === "/api/multiview/me/channels";
    const status = url.pathname === "/api/multiview/me/live-status";
    const pathId = url.pathname.match(/^\/api\/multiview\/me\/channels\/([a-f0-9]{32})$/)?.[1];
    if (!collection && !status && !pathId) throw invalid();
    if (collection && request.method === "GET") return json(await resolve(env).list(owner));
    if (pathId && request.method === "DELETE") return json(await resolve(env).remove(owner, pathId));
    if (!(collection && request.method === "POST") && !(status && request.method === "GET")) return json({ error: { code: "MULTIVIEW_INVALID_INPUT", message: "Method not allowed" } }, 405);
    const channelId = collection ? await readInput(request) : null;
    const site = parseSiteId(env.SITE_ID), limiter = env.MULTIVIEW_RATE_LIMITER;
    if (!limiter) throw new MultiviewServiceError(503, "MULTIVIEW_UNAVAILABLE");
    let allowed: boolean;
    try { allowed = (await limiter.limit({ key: `${site}:${owner}:${collection ? "add" : "status"}` })).success; }
    catch { throw new MultiviewServiceError(503, "MULTIVIEW_UNAVAILABLE"); }
    if (!allowed) throw new MultiviewServiceError(429, "MULTIVIEW_RATE_LIMITED");
    return json(channelId ? await resolve(env).add(owner, channelId) : await resolve(env).liveStatus(owner));
  } catch (error) {
    const failure = error instanceof MultiviewServiceError ? error : new MultiviewServiceError(503, "MULTIVIEW_UNAVAILABLE");
    return json({ error: { code: failure.code, message: messages[failure.code] } }, failure.status);
  }
};
