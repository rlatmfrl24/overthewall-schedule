import type { UpdateLogQuery } from "@contracts/audit";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { badRequest, parseNumericId } from "../../../platform/http-helpers";
import type { UpdateLogService } from "../application/update-log-service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const UPDATE_LOG_PATH = "/api/settings/logs";

export type ResolveUpdateLogService = (env: Env) => UpdateLogService;

const parsePositiveInt = (
  value: string | null,
  fallback: number,
  max: number,
) => {
  const parsed = Number.parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), max)
    : fallback;
};

const parseSort = (value: string | null): UpdateLogQuery["sort"] => {
  if (
    value === "created_asc" ||
    value === "schedule_desc" ||
    value === "schedule_asc" ||
    value === "action_asc"
  ) {
    return value;
  }
  return "created_desc";
};

export const createUpdateLogHandler =
  (resolveService: ResolveUpdateLogService) =>
  async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const isCollection = url.pathname === UPDATE_LOG_PATH;
  const detailMatch = url.pathname.match(/^\/api\/settings\/logs\/([^/]+)$/);
  if (!isCollection && !detailMatch) {
    return new Response(null, { status: 404 });
  }

  const expectedMethod = isCollection ? "GET" : "DELETE";
  if (request.method !== expectedMethod) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: expectedMethod },
    });
  }

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const service = resolveService(env);

  if (detailMatch) {
    const id = parseNumericId(detailMatch[1]);
    if (id === null) return badRequest("Invalid log ID");
    await service.delete(id);
    return Response.json(
      { success: true },
      { headers: NO_STORE_HEADERS },
    );
  }

  const pageParam = url.searchParams.get("page");
  const pageSizeParam = url.searchParams.get("pageSize");
  const isPaged = pageParam !== null || pageSizeParam !== null;
  const result = await service.read({
    limit: parsePositiveInt(url.searchParams.get("limit"), 50, 1000),
    page: isPaged ? parsePositiveInt(pageParam, 1, Number.MAX_SAFE_INTEGER) : null,
    pageSize: isPaged ? parsePositiveInt(pageSizeParam, 50, 200) : null,
    sort: parseSort(url.searchParams.get("sort")),
  });
  return Response.json(result, { headers: NO_STORE_HEADERS });
  };
