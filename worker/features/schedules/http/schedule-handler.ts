import type {
  SchedulePayload,
  UpsertSchedulePayload,
} from "../../../../contracts/schedules";
import { authenticateOptionalRequest } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { badRequest, getActorInfo, parseNumericId } from "../../../platform/http-helpers";
import type { ScheduleWriteOperation } from "../application/ports/schedule-write-authorization-policy";
import type { ScheduleService } from "../application/schedule-service";
import {
  isScheduleStatus,
  type ScheduleActor,
  type ScheduleWriteInput,
} from "../domain/schedule";

const SCHEDULE_READ_CACHE_CONTROL = "no-store";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type ResolveScheduleService = (env: Env) => ScheduleService;

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
};

const isNullableText = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

const parseJson = async (request: Request): Promise<unknown | null> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const parseScheduleInput = (
  body: unknown,
  options: { requireId: boolean },
): ScheduleWriteInput | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const candidate = body as Partial<
    UpsertSchedulePayload & { id: number | string | null }
  >;
  const memberUid = parseNumericId(candidate.member_uid);
  const id =
    candidate.id === undefined || candidate.id === null
      ? null
      : parseNumericId(candidate.id);

  if (
    memberUid === null ||
    (options.requireId && id === null) ||
    (candidate.id !== undefined && candidate.id !== null && id === null) ||
    !isIsoDate(candidate.date) ||
    !isScheduleStatus(candidate.status) ||
    !isNullableText(candidate.start_time) ||
    !isNullableText(candidate.title) ||
    (typeof candidate.start_time === "string" &&
      !TIME_PATTERN.test(candidate.start_time))
  ) {
    return null;
  }

  return {
    id,
    memberUid,
    date: candidate.date,
    startTime: candidate.start_time ?? null,
    title: candidate.title ?? null,
    status: candidate.status,
  };
};

const resolveAuthorizedActor = async (
  request: Request,
  env: Env,
  operation: ScheduleWriteOperation,
  service: ScheduleService,
): Promise<{ authorized: boolean; actor: ScheduleActor }> => {
  const authenticatedUser = await authenticateOptionalRequest(request, env);
  const actor = getActorInfo(request, authenticatedUser);
  const authorized = await service.canWrite(operation, actor);
  return { authorized, actor };
};

export const createScheduleRequestHandler =
  (resolveService: ResolveScheduleService) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const service = resolveService(env);

  if (url.pathname === "/api/schedules/save") {
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    const input = parseScheduleInput(await parseJson(request), {
      requireId: false,
    });
    if (!input) {
      return badRequest("Missing or invalid required fields");
    }

    const { authorized, actor } = await resolveAuthorizedActor(
      request,
      env,
      "save",
      service,
    );
    if (!authorized) {
      return new Response("Schedule write permission required", {
        status: 403,
      });
    }
    const result = await service.save(input, actor);
    return Response.json(result);
  }

  if (request.method === "GET") {
    const date = url.searchParams.get("date") ?? undefined;
    const startDate = url.searchParams.get("startDate") ?? undefined;
    const endDate = url.searchParams.get("endDate") ?? undefined;

    if (startDate !== undefined || endDate !== undefined) {
      if (
        !isIsoDate(startDate) ||
        !isIsoDate(endDate) ||
        startDate > endDate
      ) {
        return badRequest("Invalid date range");
      }
    } else if (!isIsoDate(date)) {
      return badRequest("Date parameter is required");
    }

    const result = await service.read({
      date,
      startDate,
      endDate,
    });
    return Response.json(result, {
      headers: { "Cache-Control": SCHEDULE_READ_CACHE_CONTROL },
    });
  }

  if (request.method !== "POST" && request.method !== "PUT") {
    if (request.method === "DELETE") {
      const id = parseNumericId(url.searchParams.get("id"));
      if (id === null) {
        return badRequest("ID parameter is required");
      }
      const { authorized, actor } = await resolveAuthorizedActor(
        request,
        env,
        "delete",
        service,
      );
      if (!authorized) {
        return new Response("Schedule write permission required", {
          status: 403,
        });
      }
      await service.delete(id, actor);
      return new Response("Deleted");
    }

    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, POST, PUT, DELETE" },
    });
  }

  const input = parseScheduleInput(await parseJson(request), {
    requireId: request.method === "PUT",
  });
  if (!input) {
    return badRequest("Missing or invalid required fields");
  }

  const operation = request.method === "POST" ? "create" : "update";
  const { authorized, actor } = await resolveAuthorizedActor(
    request,
    env,
    operation,
    service,
  );
  if (!authorized) {
    return new Response("Schedule write permission required", {
      status: 403,
    });
  }
  if (request.method === "POST") {
    await service.create(input, actor);
    return new Response("Created", { status: 201 });
  }

  await service.update(input, actor);
  return new Response("Updated");
  };

export type { SchedulePayload };
