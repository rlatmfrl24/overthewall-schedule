import type { AiReviewRequest, AiReviewCloseUnknownRequest,AiReviewResumeRequest } from "@contracts/otw-play-ai-review";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { AiReviewService } from "../application/ai-review-service";
import { AiReviewError } from "../application/ports/ai-review";
import { isAiReviewPending } from "@contracts/otw-play-ai-review";

const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
export function parseAiReviewCloseUnknown(value: unknown): AiReviewCloseUnknownRequest {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'attemptId,decision,evidenceHash,idempotencyKey,issuance,operationId,requestHash' ||
    value.decision !== 'close_unknown' || !['issued', 'issuance_unknown'].includes(String(value.issuance)) ||
    !['operationId', 'attemptId'].every(k => typeof value[k] === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value[k] as string)) ||
    !['requestHash', 'evidenceHash'].every(k => typeof value[k] === 'string' && /^[a-f0-9]{64}$/.test(value[k] as string)) ||
    typeof value.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.idempotencyKey))
    throw new AiReviewError('invalid_request', '원래 미확인 분석과 종결 요청을 확인하세요.');
  return value as unknown as AiReviewCloseUnknownRequest;
}
export function parseAiReviewResume(value:unknown):AiReviewResumeRequest {
  if(!object(value)||value.decision!=='resume_unissued'||value.issuance!=='unissued')throw new AiReviewError('invalid_request','원래 미발행 분석과 재개 확인을 확인하세요.');
  parseAiReviewCloseUnknown({...value,decision:'close_unknown',issuance:'issuance_unknown'});
  return value as unknown as AiReviewResumeRequest;
}
export function parseAiReviewRequest(value: unknown): AiReviewRequest {
  if (
    !object(value) ||
    Object.keys(value).some(
      (k) => !["target", "range", "idempotencyKey", "force"].includes(k),
    ) ||
    !object(value.target)
  )
    throw new AiReviewError("invalid_request", "분석 요청 형식을 확인하세요.");
  const t = value.target;
  const target =
    "candidateId" in t
      ? typeof t.candidateId === "string" &&
        t.candidateId.length > 0 &&
        t.candidateId.length <= 200 &&
        Object.keys(t).length === 1
        ? { candidateId: t.candidateId }
        : null
      : typeof t.youtubeUrl === "string" &&
          t.youtubeUrl.length <= 2000 &&
          ["official_video", "singing_clip"].includes(
            String(t.candidateKind),
          ) &&
          Object.keys(t).every((k) =>
            ["youtubeUrl", "candidateKind"].includes(k),
          )
        ? {
            youtubeUrl: t.youtubeUrl,
            candidateKind: t.candidateKind as "official_video" | "singing_clip",
          }
        : null;
  const r = value.range;
  if (
    !target ||
    (r !== null &&
      (!object(r) ||
        Object.keys(r).length !== 2 ||
        typeof r.startSeconds !== "number" ||
        typeof r.endSeconds !== "number" ||
        !Number.isSafeInteger(r.startSeconds) ||
        !Number.isSafeInteger(r.endSeconds) ||
        r.startSeconds < 0 ||
        r.endSeconds <= r.startSeconds)) ||
    typeof value.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(value.idempotencyKey) ||
    (value.force !== undefined && typeof value.force !== "boolean")
  )
    throw new AiReviewError(
      "invalid_request",
      "영상·분석 구간·요청 키를 확인하세요.",
    );
  return {
    target,
    range: r as AiReviewRequest["range"],
    idempotencyKey: value.idempotencyKey,
    force: value.force as boolean | undefined,
  };
}
export const createAiReviewHandler =
  (resolve: (env: Env) => AiReviewService) =>
  async (request: Request, env: Env) => {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const service = resolve(env);
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/play/admin/ai-reviews/")
      ) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id) || url.search)
          throw new AiReviewError("invalid_request", "분석 ID를 확인하세요.");
        return json({ data: await service.get(id) });
      }
      if (request.method === "GET") {
        if (
          [...url.searchParams.keys()].some(
            (k) =>
              ![
                "candidateId",
                "youtubeUrl",
                "candidateKind",
                "startSeconds",
                "endSeconds",
              ].includes(k) || url.searchParams.getAll(k).length !== 1,
          )
        )
          throw new AiReviewError("invalid_request", "조회 조건을 확인하세요.");
        const p = url.searchParams;
        if (
          p.has("candidateId") &&
          (p.has("youtubeUrl") || p.has("candidateKind"))
        )
          throw new AiReviewError(
            "invalid_request",
            "대상을 하나만 지정하세요.",
          );
        const input = parseAiReviewRequest({
          target: p.has("candidateId")
            ? { candidateId: p.get("candidateId") }
            : {
                youtubeUrl: p.get("youtubeUrl"),
                candidateKind: p.get("candidateKind"),
              },
          range:
            p.has("startSeconds") || p.has("endSeconds")
              ? {
                  startSeconds: p.has("startSeconds")
                    ? Number(p.get("startSeconds"))
                    : null,
                  endSeconds: p.has("endSeconds")
                    ? Number(p.get("endSeconds"))
                    : null,
                }
              : null,
          idempotencyKey: "lookup_only",
        });
        return json({ data: await service.latest(input) });
      }
      if (request.method !== "POST")
        return json(
          {
            error: {
              code: "method_not_allowed",
              message: "지원하지 않는 요청입니다.",
            },
          },
          405,
        );
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 8192)
        throw new AiReviewError(
          "invalid_request",
          "분석 요청이 너무 큽니다.",
          413,
        );
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new AiReviewError("invalid_request", "잘못된 JSON 요청입니다.");
      }
      if (url.pathname.endsWith('/close-unknown')) {
        const id = decodeURIComponent(url.pathname.split('/').at(-2)!);
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id) || url.search)
          throw new AiReviewError('invalid_request', '분석 ID를 확인하세요.');
        return json({ data: await service.closeUnknown(id, parseAiReviewCloseUnknown(value), admin.user.id) });
      }
      if(url.pathname.endsWith('/resume-unissued')) {
        const id=decodeURIComponent(url.pathname.split('/').at(-2)!);
        if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id)||url.search)throw new AiReviewError('invalid_request','분석 ID를 확인하세요.');
        const data=await service.confirmResume(id,parseAiReviewResume(value),admin.user.id);
        return json({data},isAiReviewPending(data.status)?202:200);
      }
      const data = await service.start(
        parseAiReviewRequest(value),
        admin.user.id,
      );
      return json({ data }, isAiReviewPending(data.status) ? 202 : 200);
    } catch (error) {
      const e =
        error instanceof AiReviewError
          ? error
          : new AiReviewError(
              "ai_unavailable",
              "분석 서비스에 연결할 수 없습니다.",
              503,
            );
      return json(
        {
          error: {
            code: e.code,
            message: e.message,
            requestId: request.headers.get("CF-Ray") ?? crypto.randomUUID(),
          },
        },
        e.status,
      );
    }
  };
