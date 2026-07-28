import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { readAdminAuditLogs } from "../application/read-admin-audit-logs";
import type { AdminAuditLogReader } from "../application/ports/admin-audit-log-reader";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const parsePage = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 1) : fallback;
};

export type AdminAuditLogReaderResolver = (env: Env) => AdminAuditLogReader;

export const createHandleAdminAuditLogs =
  (resolveReader: AdminAuditLogReaderResolver) =>
  async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== "/api/settings/audit-logs") {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;

    const page = parsePage(url.searchParams.get("page"), 1);
    const pageSize = Math.min(
      parsePage(url.searchParams.get("pageSize"), 50),
      200,
    );
    const result = await readAdminAuditLogs(
      resolveReader(env),
      page,
      pageSize,
    );
    return Response.json(result, { headers: NO_STORE_HEADERS });
  };
