import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { getActorInfo } from "../../../platform/http-helpers";
import type { ManualAutoUpdateService } from "../application/manual-auto-update-service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export type ResolveManualAutoUpdateService = (
  env: Env,
) => ManualAutoUpdateService;

export const createManualAutoUpdateHandler =
  (resolveService: ResolveManualAutoUpdateService) =>
  async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname !== "/api/settings/run-now") {
    return new Response(null, { status: 404 });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const actor = getActorInfo(request, admin.user);

  const outcome = await resolveService(env).run(actor);
  if (outcome.ok) {
    const { result } = outcome;
    return Response.json(
      {
        success: true,
        updated: result.updated,
        checked: result.checked,
        segmentCount: result.segmentCount,
        sessionCount: result.sessionCount,
        resumeMergedCount: result.resumeMergedCount,
        rejectedSuppressed: result.rejectedSuppressed,
        duplicatePending: result.duplicatePending,
        shortSuppressed: result.shortSuppressed,
        holidaySuppressed: result.holidaySuppressed,
        ambiguous: result.ambiguous,
        obsoletePending: result.obsoletePending,
        details: result.details,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  console.error("Manual auto update failed:", outcome.error);
  return new Response("Auto update failed", {
    status: 500,
    headers: NO_STORE_HEADERS,
  });
  };
