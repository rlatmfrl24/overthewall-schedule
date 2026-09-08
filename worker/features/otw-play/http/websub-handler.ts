import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";

const retired = () => Response.json({
  error: {
    code: "PLAY_WEBSUB_RETIRED",
    message: "WebSub has been retired. Channel uploads are checked by scheduled polling.",
  },
}, { status: 410, headers: { "Cache-Control": "no-store" } });

// Exact legacy routes are tombstones for old clients and in-flight Hub requests.
// Never verify a lease, read a payload, query D1, or enqueue work.
export const createWebsubCallbackHandler = (): ((request: Request, env: Env) => Promise<Response>) =>
  async () => retired();

export const createWebsubAdminHandler = () => async (request: Request, env: Env) => {
  const auth = await requireAdminUser(request, env);
  if (!auth.ok) return auth.response;
  return retired();
};
