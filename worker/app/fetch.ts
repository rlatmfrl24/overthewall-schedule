import type { Env } from "../platform/types";
import { workerRouteRegistry } from "./routes";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

const serializeError = (
  error: unknown,
  includeStack: boolean,
  depth = 0,
): SerializedError => {
  if (error instanceof Error) {
    const cause =
      depth < 3 && "cause" in error && error.cause !== undefined
        ? serializeError(error.cause, includeStack, depth + 1)
        : undefined;

    return {
      name: error.name,
      message: error.message,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
      ...(cause ? { cause } : {}),
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
};

const isLocalApiRequest = (request: Request) => {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1";
};

const handleApiRouteError = (request: Request, error: unknown) => {
  const url = new URL(request.url);
  const includeDetails = isLocalApiRequest(request);
  const details = serializeError(error, includeDetails);

  console.error("[api] request failed", {
    method: request.method,
    path: url.pathname,
    search: url.search,
    error: details,
  });

  return Response.json(
    includeDetails
      ? {
          error: "Internal Server Error",
          details,
        }
      : {
          error: "Internal Server Error",
        },
    { status: 500 },
  );
};

export const handleWorkerFetch = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const url = new URL(request.url);

  try {
    const routedResponse = await workerRouteRegistry.dispatch(request, env);
    if (routedResponse) return routedResponse;
  } catch (error) {
    if (url.pathname.startsWith("/api/")) {
      return handleApiRouteError(request, error);
    }
    throw error;
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response(null, { status: 404 });
};
