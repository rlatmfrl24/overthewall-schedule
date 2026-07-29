import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  getActorInfo,
  json,
  methodNotAllowed,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type { OperationsApplication } from "../application/operations-application";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
};

const parseWindowHours = (value: string | null) => {
  if (value === null || value.trim() === "") return 24;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168
    ? parsed
    : null;
};

const parseDryRun = (value: string | null) => {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
};

export type OperationsHandlerDependencies = {
  getApplication(env: Env): OperationsApplication;
};

export const createOperationsHandler =
  ({ getApplication }: OperationsHandlerDependencies) =>
  async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    const actor = getActorInfo(request, admin.user);
    const application = getApplication(env);

    if (url.pathname === "/api/operations/status") {
      if (request.method !== "GET") return methodNotAllowed();
      const windowHours = parseWindowHours(url.searchParams.get("windowHours"));
      if (windowHours === null) {
        return badRequest("windowHours must be an integer between 1 and 168");
      }
      return json(await application.getStatus(windowHours), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/operations/naver-cafe/check-now") {
      if (request.method !== "POST") return methodNotAllowed();
      return json(await application.checkNaverCafe(actor), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/operations/data-retention/status") {
      if (request.method !== "GET") return methodNotAllowed();
      return json(await application.getDataRetentionStatus(), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/operations/data-retention/prune") {
      if (request.method !== "POST") return methodNotAllowed();
      const dryRun = parseDryRun(url.searchParams.get("dryRun"));
      if (dryRun === null) {
        return badRequest("dryRun must be true or false");
      }
      return json(await application.pruneDataRetention(dryRun, actor), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    return new Response(null, { status: 404 });
  };
