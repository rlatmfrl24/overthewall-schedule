import type {
  LiveScheduleAutoFillRequestDto,
  LiveScheduleAutoFillResponseDto,
} from "@contracts/chzzk";
import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  getActorInfo,
  json,
  methodNotAllowed,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseChzzkChannelTargetArray,
  parseChzzkChannelTargets,
} from "../domain/channel-targets";
import {
  ChzzkAllowlistUnavailableError,
  ChzzkTargetsNotAllowedError,
  type ChzzkApplication,
} from "../application/chzzk-service";
import { parseJsonRequest } from "../../../platform/http/json";

export type BuildChzzkApplication = (env: Env) => ChzzkApplication;

const unavailable = (message: string) =>
  new Response(message, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });

const targetErrorResponse = (error: unknown) => {
  if (error instanceof ChzzkAllowlistUnavailableError) {
    return unavailable(error.message);
  }
  if (error instanceof ChzzkTargetsNotAllowedError) {
    return badRequest("Unapproved channelIds");
  }
  throw error;
};

export const createLiveStatusHandler =
  (buildApplication: BuildChzzkApplication) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const debug = url.searchParams.get("debug") === "1";
  if (debug) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }

  const parsed = parseChzzkChannelTargets(url.searchParams.get("channelIds"));
  if (!parsed.ok) return badRequest(parsed.message);
  let items;
  try {
    items = await buildApplication(env).fetchLiveStatuses(
      parsed.channelIds,
      debug,
    );
  } catch (error) {
    return targetErrorResponse(error);
  }

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      items,
      scheduleAutoFill: { updated: 0 },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Authorization",
      },
    },
  );
  };

export const createLiveScheduleAutoFillHandler =
  (buildApplication: BuildChzzkApplication) =>
  async (
    request: Request,
    env: Env,
  ) => {
  if (request.method !== "POST") return methodNotAllowed();

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;

  const parsedBody = await parseJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body =
    parsedBody.value as Partial<LiveScheduleAutoFillRequestDto> | null;
  const parsed = parseChzzkChannelTargetArray(
    body && typeof body === "object"
      ? (body as { channelIds?: unknown }).channelIds
      : undefined,
  );
  if (!parsed.ok) return badRequest(parsed.message);

  const actor = getActorInfo(request, admin.user);
  let result;
  try {
    result = await buildApplication(env).autoFillLiveSchedules(
      parsed.channelIds,
      actor,
    );
  } catch (error) {
    return targetErrorResponse(error);
  }

  const response: LiveScheduleAutoFillResponseDto = {
    updatedAt: new Date().toISOString(),
    checkedChannelCount: parsed.channelIds.length,
    scheduleAutoFill: { updated: result.updated },
  };
  return json(
    response,
    200,
    {
      headers: {
        "Cache-Control": "no-store",
        Vary: "Authorization",
      },
    },
  );
  };
