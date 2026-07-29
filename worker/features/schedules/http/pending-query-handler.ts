import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { PendingScheduleQueryService } from "../application/pending-schedule-query-service";

export type ResolvePendingScheduleQueryService = (
  env: Env,
) => PendingScheduleQueryService;

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

  return Response.json(await resolveService(env).readReview(), {
    headers: { "Cache-Control": "no-store" },
  });
  };
