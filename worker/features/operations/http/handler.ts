import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  getActorInfo,
  json,
  methodNotAllowed,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type { OperationsApplication } from "../application/operations-application";
import {
  isScheduledJobStatus,
  isScheduledJobType,
} from "@contracts/scheduled-operations";

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

const parseD1Window = (value: string | null) =>
  value === null || value.trim() === "" || value.trim() === "7d" ? 7 : null;

const parseDryRun = (value: string | null) => {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
};

const parseRunLimit = (value: string | null) => {
  if (value === null || value.trim() === "") return 20;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 50 ? parsed : null;
};

const readJsonRecord = async (request: Request) => {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
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

    if (url.pathname === "/api/operations/d1-observability") {
      if (request.method !== "GET") return methodNotAllowed();
      if (parseD1Window(url.searchParams.get("window")) === null) {
        return badRequest("window must be 7d");
      }
      return json(await application.getD1Observability(), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/operations/job-summaries") {
      if (request.method !== "GET") return methodNotAllowed();
      return json(await application.getJobSummaries(), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/operations/runs") {
      if (request.method === "POST") {
        const body = await readJsonRecord(request);
        if (!body || !isScheduledJobType(body.jobType)) {
          return badRequest("jobType is invalid");
        }
        const idempotencyKey = request.headers.get("Idempotency-Key");
        if (idempotencyKey && idempotencyKey.length > 200) {
          return badRequest("Idempotency-Key must be 200 characters or fewer");
        }
        try {
          const accepted = await application.createRun(
            body.jobType,
            actor,
            idempotencyKey,
          ) as { statusUrl: string };
          return json(accepted, 202, {
            headers: {
              ...NO_STORE_HEADERS,
              Location: accepted.statusUrl,
              "Retry-After": "2",
            },
          });
        } catch (error) {
          console.error("Failed to enqueue operations run", error);
          return new Response("Scheduled operations queue unavailable", {
            status: 503,
            headers: { ...NO_STORE_HEADERS, "Retry-After": "60" },
          });
        }
      }
      if (request.method === "GET") {
        const jobTypeValue = url.searchParams.get("jobType");
        const statusValue = url.searchParams.get("status");
        const limit = parseRunLimit(url.searchParams.get("limit"));
        if (limit === null) {
          return badRequest("limit must be an integer between 1 and 50");
        }
        if (jobTypeValue !== null && !isScheduledJobType(jobTypeValue)) {
          return badRequest("jobType is invalid");
        }
        if (statusValue !== null && !isScheduledJobStatus(statusValue)) {
          return badRequest("status is invalid");
        }
        const runs = await application.listRuns({
          ...(jobTypeValue ? { jobType: jobTypeValue } : {}),
          ...(statusValue ? { status: statusValue } : {}),
          limit,
        });
        return json({ runs }, 200, { headers: NO_STORE_HEADERS });
      }
      return methodNotAllowed();
    }

    const runMatch = url.pathname.match(
      /^\/api\/operations\/runs\/([^/]+?)(\/retry)?$/,
    );
    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      const retry = runMatch[2] === "/retry";
      if (retry) {
        if (request.method !== "POST") return methodNotAllowed();
        const result = await application.retryRun(runId);
        if (result.kind === "not_found") {
          return new Response(null, { status: 404 });
        }
        if (result.kind === "not_retryable") {
          return json(
            {
              error: "operation_run_not_retryable",
              status: result.status,
            },
            409,
            { headers: NO_STORE_HEADERS },
          );
        }
        return json(result.run, 202, {
          headers: {
            ...NO_STORE_HEADERS,
            Location: `/api/operations/runs/${encodeURIComponent(runId)}`,
            "Retry-After": "2",
          },
        });
      }
      if (request.method !== "GET") return methodNotAllowed();
      const run = await application.getRun(runId);
      if (!run) return new Response(null, { status: 404 });
      return json(run, 200, {
        headers: { ...NO_STORE_HEADERS, "Retry-After": "2" },
      });
    }

    if (url.pathname === "/api/operations/naver-cafe/check-now") {
      if (request.method !== "POST") return methodNotAllowed();
      const accepted = await application.createRun(
        "naver_cafe_collection",
        actor,
        request.headers.get("Idempotency-Key"),
      ) as { statusUrl: string };
      return json(accepted, 202, {
        headers: {
          ...NO_STORE_HEADERS,
          Location: accepted.statusUrl,
          "Retry-After": "2",
        },
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
      if (!dryRun) {
        const accepted = await application.createRun(
          "retention_prune",
          actor,
          request.headers.get("Idempotency-Key"),
        ) as { statusUrl: string };
        return json(accepted, 202, {
          headers: {
            ...NO_STORE_HEADERS,
            Location: accepted.statusUrl,
            "Retry-After": "2",
          },
        });
      }
      return json(await application.pruneDataRetention(dryRun, actor), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    return new Response(null, { status: 404 });
  };
