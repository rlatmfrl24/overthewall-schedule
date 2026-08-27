import type { OtwPlayAdminSourceRecheckResponse } from "@contracts/otw-play";
import type { Env } from "../../../platform/types";
import {
  createPlayTelemetryEvent,
  type PlayTelemetryEventName,
  type PlayTelemetryTrigger,
  type PlayTelemetryWriter,
} from "../application/ports/play-telemetry";

type PlayHandler = (request: Request, env: Env) => Promise<Response>;
type ResolvePlayTelemetry = (env: Env) => PlayTelemetryWriter;
type SelectedTelemetry = {
  event: PlayTelemetryEventName;
  transition?: string;
  errorCode?: string;
  recordKind?: "domain" | "request";
};

const decodeResourceId = (pathname: string) => {
  const match = pathname.match(
    /^\/api\/play\/(?:admin\/)?(?:submissions|performances|sources)\/([^/]+)/u,
  );
  if (!match?.[1]) return undefined;
  try {
    const value = decodeURIComponent(match[1]);
    return /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const routeId = (pathname: string) =>
  pathname
    .replace(
      /\/webhooks\/youtube\/[^/]+(?=\/|$)/u,
      "/webhooks/youtube/:token",
    )
    .replace(
      /(\/(?:admin\/)?(?:submissions|performances|sources))\/[^/]+(?=\/|$)/u,
      "$1/:id",
    )
    .replace(/^\/api\//u, "")
    .replaceAll("/", ".");

const readSafeResponse = async (response: Response) => {
  try {
    return (await response.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const sourceTransitionEvent = (
  value: unknown,
): SelectedTelemetry | null => {
  if (!value || typeof value !== "object") return null;
  const response = value as OtwPlayAdminSourceRecheckResponse;
  if (response.check?.status === "retry_scheduled") {
    return {
      event: "play.youtube.verify_failed",
      errorCode: response.check.retryCode,
    };
  }
  if (response.check?.status !== "checked" || !response.check.changed) {
    return { event: "play.source.checked", recordKind: "request" };
  }
  const previous = response.check.previousAvailability;
  const current = response.check.currentAvailability;
  if (previous === "playable" && current !== "playable") {
    return { event: "play.source.unavailable", transition: `${previous}:${current}` };
  }
  if (previous !== "playable" && current === "playable") {
    return { event: "play.source.recovered", transition: `${previous}:${current}` };
  }
  return {
    event: "play.catalog.updated",
    transition: `${previous}:${current}`,
  };
};

const successEvent = async (
  request: Request,
  response: Response,
): Promise<SelectedTelemetry> => {
  const { pathname } = new URL(request.url);
  if (request.method === "POST" && pathname === "/api/play/submissions") {
    const body = await readSafeResponse(response);
    if (body?.idempotentReplay === true) {
      return { event: "play.catalog.read", recordKind: "request" };
    }
    return { event: "play.proposal.submitted" };
  }
  if (/\/submissions\/[^/]+\/approve$/u.test(pathname)) {
    return { event: "play.proposal.approved" };
  }
  if (/\/submissions\/[^/]+\/reject$/u.test(pathname)) {
    return { event: "play.proposal.rejected" };
  }
  if (/\/performances\/[^/]+\/publish$/u.test(pathname)) {
    return { event: "play.catalog.published", transition: "draft:published" };
  }
  if (/\/performances\/[^/]+\/withdraw$/u.test(pathname)) {
    return {
      event: "play.catalog.withdrawn",
      transition: "published:withdrawn",
    };
  }
  if (/\/sources\/[^/]+\/recheck$/u.test(pathname)) {
    return sourceTransitionEvent(await readSafeResponse(response)) ?? {
      event: "play.source.checked",
      recordKind: "request",
    };
  }
  if (pathname.includes("/webhooks/youtube/")) {
    return { event: "play.websub.received" };
  }
  if (/\/channel-monitors\/[^/]+\/(?:subscribe|renew|unsubscribe)$/u.test(pathname)) {
    return { event: "play.websub.updated" };
  }
  if (pathname.includes("/admin/channel-monitors")) {
    return request.method === "GET"
      ? { event: "play.catalog.read", recordKind: "request" }
      : { event: "play.monitor.updated" };
  }
  if (pathname.includes("/admin/import")) {
    return request.method === "GET"
      ? { event: "play.catalog.read", recordKind: "request" }
      : { event: "play.ingestion.updated" };
  }
  if (pathname === "/api/play/admin/release") {
    return request.method === "GET"
      ? { event: "play.catalog.read", recordKind: "request" }
      : { event: "play.release.updated" };
  }
  if (
    pathname.startsWith("/api/play/admin/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    return { event: "play.catalog.updated" };
  }
  return {
    event:
      request.method === "GET" || request.method === "HEAD"
        ? "play.catalog.read"
        : "play.catalog.updated",
    recordKind: "request",
  };
};

const failureEvent = async (
  request: Request,
  response: Response,
): Promise<SelectedTelemetry> => {
  const { pathname } = new URL(request.url);
  const body = await readSafeResponse(response);
  const error = body?.error;
  const errorCode =
    error && typeof error === "object" && "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  if (response.status === 409) {
    return { event: "play.concurrent_write_conflict" as const, errorCode };
  }
  if (
    response.status >= 500 &&
    (/\/preflight$/u.test(pathname) || /\/recheck$/u.test(pathname))
  ) {
    return { event: "play.youtube.verify_failed" as const, errorCode };
  }
  return { event: "play.request.failed" as const, errorCode };
};

export const withPlayOperationsTelemetry = (
  handler: PlayHandler,
  resolveTelemetry: ResolvePlayTelemetry,
): PlayHandler => async (request, env) => {
  const startedAt = Date.now();
  const requestId =
    request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();
  const cfRay = request.headers.get("CF-Ray")?.trim() || null;
  try {
    const response = await handler(request, env);
    const selected: SelectedTelemetry =
      response.status >= 400
        ? await failureEvent(request, response)
        : await successEvent(request, response);
    try {
      resolveTelemetry(env).write(
        createPlayTelemetryEvent({
            event: selected.event,
            recordKind: selected.recordKind,
            requestId,
            cfRay,
            routeId: routeId(new URL(request.url).pathname),
            trigger: request.method as PlayTelemetryTrigger,
            status: response.status,
            durationMs: Math.max(0, Date.now() - startedAt),
            cacheStatus: null,
            d1RowsRead: null,
            d1RowsWritten: null,
            resourceType: decodeResourceId(new URL(request.url).pathname)
              ? "otw-play"
              : undefined,
            resourceId: decodeResourceId(new URL(request.url).pathname),
            ...(selected.transition
              ? { transition: selected.transition }
              : {}),
            ...(selected.errorCode ? { errorCode: selected.errorCode } : {}),
        }),
      );
    } catch {
      // Telemetry cannot replace an authoritative application response.
    }
    return response;
  } catch (error) {
    try {
      resolveTelemetry(env).write(
        createPlayTelemetryEvent({
          event: "play.request.failed",
          requestId,
          cfRay,
          routeId: routeId(new URL(request.url).pathname),
          trigger: request.method as PlayTelemetryTrigger,
          status: 500,
          durationMs: Math.max(0, Date.now() - startedAt),
          cacheStatus: null,
          d1RowsRead: null,
          d1RowsWritten: null,
          errorCode: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    } catch {
      // Telemetry is isolated from the original failure.
    }
    throw error;
  }
};
