import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  json,
  normalizeDDayType,
  parseNumericId,
} from "../../../platform/http-helpers";
import { isJsonObject, parseJsonRequest } from "../../../platform/http/json";
import type { DDayPayload, Env } from "../../../platform/types";
import {
  createDDay,
  deleteDDay,
  listDDays,
  updateDDay,
} from "../application/manage-ddays";
import type {
  DDayRepository,
  DDayWriteInput,
} from "../application/ports/dday-repository";

const DDAYS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export type DDayRepositoryResolver = (env: Env) => DDayRepository;

const parseWriteInput = (body: DDayPayload): DDayWriteInput | null => {
  if (!body.title?.trim() || !body.date?.trim()) return null;
  return {
    title: body.title.trim(),
    date: body.date.trim(),
    description: body.description?.trim() || null,
    color: body.color?.trim() || null,
    type: normalizeDDayType(body.type),
  };
};

export const createHandleDDays =
  (resolveRepository: DDayRepositoryResolver) =>
  async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    if (
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "DELETE"
    ) {
      const admin = await requireAdminUser(request, env);
      if (!admin.ok) return admin.response;
    }

    const repository = resolveRepository(env);
    if (request.method === "GET") {
      const noCache = url.searchParams.get("noCache") === "1";
      return json(await listDDays(repository), 200, {
        headers: {
          "Cache-Control": noCache ? "no-store" : DDAYS_CACHE_CONTROL,
        },
      });
    }

    if (request.method === "POST" || request.method === "PUT") {
      const parsedBody = await parseJsonRequest<DDayPayload>(request);
      if (!parsedBody.ok) return parsedBody.response;
      if (!isJsonObject(parsedBody.value)) {
        return badRequest("Invalid JSON body");
      }
      const body = parsedBody.value;

      let id: number | null = null;
      if (request.method === "PUT") {
        if (!body.id) return badRequest("ID is required");
        id = parseNumericId(body.id);
        if (id === null) return badRequest("Invalid id");
      }

      const input = parseWriteInput(body);
      if (!input) return badRequest("title and date are required");

      const success =
        request.method === "POST"
          ? await createDDay(repository, input)
          : await updateDDay(repository, id!, input);
      if (!success) {
        return new Response(
          request.method === "POST"
            ? "Failed to create"
            : "Failed to update",
          { status: 500 },
        );
      }
      return new Response(request.method === "POST" ? "Created" : "Updated", {
        status: request.method === "POST" ? 201 : 200,
      });
    }

    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return badRequest("ID parameter is required");
      const numericId = parseNumericId(id);
      if (numericId === null) return badRequest("Invalid id");

      return (await deleteDDay(repository, numericId))
        ? new Response("Deleted", { status: 200 })
        : new Response("Failed to delete", { status: 500 });
    }

    return new Response(null, { status: 405 });
  };
