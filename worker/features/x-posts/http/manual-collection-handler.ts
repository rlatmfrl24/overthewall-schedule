import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { getActorInfo } from "../../../platform/http-helpers";
import type { XPostsApplication } from "../application/x-posts-service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export type BuildManualXCollectionApplication = (
  env: Env,
) => XPostsApplication;

export const createManualXCollectionHandler =
  (buildApplication: BuildManualXCollectionApplication) =>
  async (
    request: Request,
    env: Env,
  ): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname !== "/api/settings/x-collection/run-now") {
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
  const outcome = await buildApplication(env).runManualCollection(actor);
  if (outcome.ok) {
    return Response.json(outcome.result, { headers: NO_STORE_HEADERS });
  }

    console.error("Manual X collection failed:", outcome.error);
    return Response.json(
      {
        success: false,
        status: "failed",
        checkedHandles: 0,
        refreshedHandles: 0,
        postsReturned: 0,
        postsStored: 0,
        apiCalls: 0,
        estimatedCostMicros: 0,
        error: outcome.error,
        updatedAt: new Date().toISOString(),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  };
