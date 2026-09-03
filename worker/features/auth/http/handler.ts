import type { AdminStatusResponse } from "@contracts/auth";
import {
  authenticateOptionalRequest,
  isAdminUser,
} from "../../../platform/auth";
import { json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Authorization, Cookie",
};

export const createAuthStatusHandler = () =>
  async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== "GET") return methodNotAllowed();

    const user = await authenticateOptionalRequest(request, env);
    const response: AdminStatusResponse = {
      authenticated: user !== null,
      isAdmin: user !== null && isAdminUser(env, user.id),
    };
    return json(response, 200, { headers: NO_STORE_HEADERS });
  };
