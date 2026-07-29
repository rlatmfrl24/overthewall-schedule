export type JsonRequestResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

export const parseJsonRequest = async <T = unknown>(
  request: Request,
  errorMessage = "Malformed JSON",
): Promise<JsonRequestResult<T>> => {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return {
      ok: false,
      response: new Response(errorMessage, { status: 400 }),
    };
  }
};

export const isJsonObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
