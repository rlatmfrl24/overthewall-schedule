import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { getActorInfo } from "../../../platform/http-helpers";
import type { ManualAutoUpdateService } from "../application/manual-auto-update-service";
import type { OperationRunAcceptedDto } from "@contracts/scheduled-operations";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export type ResolveManualAutoUpdateService = (
  env: Env,
) => ManualAutoUpdateService;
export type EnqueueManualAutoUpdate = (
  env: Env,
  actor: ReturnType<typeof getActorInfo>,
  idempotencyKey: string | null,
) => Promise<OperationRunAcceptedDto>;

export const createManualAutoUpdateHandler =
  (
    resolveService: ResolveManualAutoUpdateService,
    enqueue: EnqueueManualAutoUpdate,
  ) =>
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
  void resolveService;
  try {
    const accepted = await enqueue(
      env,
      actor,
      request.headers.get("Idempotency-Key"),
    );
    return Response.json(accepted, {
      status: 202,
      headers: {
        ...NO_STORE_HEADERS,
        Location: accepted.statusUrl,
        "Retry-After": "2",
      },
    });
  } catch (error) {
    console.error("Manual auto update enqueue failed:", error);
    return new Response("Scheduled operations queue unavailable", {
      status: 503,
      headers: { ...NO_STORE_HEADERS, "Retry-After": "60" },
    });
  }
  };
