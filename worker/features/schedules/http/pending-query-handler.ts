import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { PendingScheduleQueryService } from "../application/pending-schedule-query-service";
import { badRequest } from "../../../platform/http-helpers";
import { isPendingRejectionReasonCode } from "../domain/pending-schedule";

export type ResolvePendingScheduleQueryService = (
  env: Env,
) => PendingScheduleQueryService;

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
  maximum: number,
) => {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : null;
};

const isDate = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const createPendingScheduleQueryHandler =
  (resolveService: ResolvePendingScheduleQueryService) =>
  async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const service = resolveService(env);
  if (url.pathname === "/api/settings/pending/rejections") {
    const page = parsePositiveInteger(url.searchParams.get("page"), 1, 100_000);
    const pageSize = parsePositiveInteger(
      url.searchParams.get("pageSize"),
      20,
      100,
    );
    if (page === null || pageSize === null) {
      return badRequest("Invalid pagination");
    }
    const reasonCode = url.searchParams.get("reasonCode");
    if (reasonCode !== null && !isPendingRejectionReasonCode(reasonCode)) {
      return badRequest("Invalid reasonCode");
    }
    const rejectedFrom = url.searchParams.get("rejectedFrom");
    const rejectedTo = url.searchParams.get("rejectedTo");
    if (
      (rejectedFrom !== null && !isDate(rejectedFrom)) ||
      (rejectedTo !== null && !isDate(rejectedTo))
    ) {
      return badRequest("Invalid rejection date");
    }
    const search = url.searchParams.get("search")?.trim() || undefined;
    if (search && search.length > 200) {
      return badRequest("search must be 200 characters or fewer");
    }
    return Response.json(
      await service.readRejections({
        page,
        pageSize,
        search,
        ...(reasonCode ? { reasonCode } : {}),
        ...(rejectedFrom ? { rejectedFrom } : {}),
        ...(rejectedTo ? { rejectedTo } : {}),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(await service.readReview(), {
    headers: { "Cache-Control": "no-store" },
  });
  };
