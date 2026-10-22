import {isIsoDate,parseScheduleInput} from "../domain/schedule-input";
import type {
  SchedulePayload,
} from "../../../../contracts/schedules";
import { authenticateOptionalRequest, requireAdminUser, isAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { badRequest, getActorInfo, parseNumericId } from "../../../platform/http-helpers";
import type { ScheduleWriteOperation } from "../application/ports/schedule-write-authorization-policy";
import type { ScheduleService } from "../application/schedule-service";
import {
  type ScheduleActor,
} from "../domain/schedule";

const SCHEDULE_READ_CACHE_CONTROL = "no-store";
export type ResolveScheduleService = (env: Env, includeArchived: boolean) => ScheduleService;

const parseJson = async (request: Request): Promise<unknown | null> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const resolveAuthorizedActor = async (
  request: Request,
  env: Env,
  operation: ScheduleWriteOperation,
  service: ScheduleService,
  input: Parameters<ScheduleService["canWrite"]>[2],
): Promise<{ authorized: boolean; actor: ScheduleActor }> => {
  const authenticatedUser = await authenticateOptionalRequest(request, env);
  const actor:ScheduleActor = getActorInfo(request, authenticatedUser);
  if (env.SITE_ID === "luvdia") actor.isAdmin = authenticatedUser !== null && isAdminUser(env, authenticatedUser.id);
  const requestId=request.headers.get("Idempotency-Key");
  if(requestId && /^[A-Za-z0-9_-]{16,100}$/.test(requestId)) actor.requestId=requestId;
  const authorized = await service.canWrite(operation, actor, input);
  return { authorized, actor };
};

export const createScheduleRequestHandler =
  (resolveService: ResolveScheduleService) =>
  async (request: Request, env: Env) => {
  try {
  const url = new URL(request.url);
  const requestId=request.headers.get("Idempotency-Key");
  if(request.method!=="GET" && requestId!==null && !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return badRequest("Invalid Idempotency-Key");
  const includeArchived = request.method === "GET" && url.searchParams.get("archive") === "1";
  if (includeArchived) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }
  const service = resolveService(env, includeArchived);

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
      input,
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
        { id },
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
    input,
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
  } catch (error) {
    if (error instanceof Error && /(?:JSON path|bad JSON path).*schedule_member_policy/.test(error.message)) {
      return new Response("Schedule write permission required", { status: 403 });
    }
    throw error;
  }
  };

export type { SchedulePayload };
