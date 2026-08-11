export type ApiAuthMode = "omit" | "optional" | "required";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly fields: Record<string, string> | undefined;
  readonly requestId: string | null;

  constructor(
    message: string,
    status: number,
    details: {
      code?: string | null;
      fields?: Record<string, string>;
      requestId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = details.code ?? null;
    this.fields = details.fields;
    this.requestId = details.requestId ?? null;
  }
}

type ApiOptions = RequestInit & {
  json?: unknown;
  auth?: ApiAuthMode;
};

const isLatin1 = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      return false;
    }
  }
  return true;
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  if (typeof window === "undefined") return {};
  const clerk = (
    window as {
      Clerk?: {
        session?: {
          getToken?: () => Promise<string | null>;
        };
      };
    }
  ).Clerk;
  const token = await clerk?.session?.getToken?.().catch(() => null);
  if (!token) return {};

  const headers: Record<string, string> = {};
  if (isLatin1(token)) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const parseApiError = async (response: Response) => {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json") && raw.length > 0) {
    try {
      const payload: unknown = JSON.parse(raw);
      const error = isRecord(payload) ? payload.error : null;
      if (isRecord(error)) {
        const message =
          typeof error.message === "string" && error.message.length > 0
            ? error.message
            : "API request failed";
        return new ApiError(message, response.status, {
          code: typeof error.code === "string" ? error.code : null,
          fields: isStringRecord(error.fields) ? error.fields : undefined,
          requestId:
            typeof error.requestId === "string" ? error.requestId : null,
        });
      }
    } catch {
      // Preserve the raw response below when a server labels invalid JSON as JSON.
    }
  }

  return new ApiError(raw || "API request failed", response.status);
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { json, headers, auth = "optional", ...rest } = options;
  const callerHeaders = new Headers(headers);
  const authHeaders = auth === "omit" ? {} : await getAuthHeaders();
  const hasAuthorization =
    (callerHeaders.get("Authorization")?.trim().length ?? 0) > 0 ||
    (authHeaders.Authorization?.trim().length ?? 0) > 0;
  if (auth === "required" && !hasAuthorization) {
    throw new ApiError("Authentication required", 401, {
      code: "AUTH_REQUIRED",
    });
  }
  const isFormDataBody =
    typeof FormData !== "undefined" && rest.body instanceof FormData;
  const mergedHeaders = new Headers();
  if (json !== undefined || !isFormDataBody) {
    mergedHeaders.set("Content-Type", "application/json");
  }
  for (const [key, value] of Object.entries(authHeaders)) {
    mergedHeaders.set(key, value);
  }
  callerHeaders.forEach((value, key) => {
    mergedHeaders.set(key, value);
  });
  if (auth === "omit") {
    mergedHeaders.delete("Authorization");
  }
  const init: RequestInit = {
    ...rest,
    credentials: auth === "omit" ? "omit" : rest.credentials,
    headers: mergedHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };

  const res = await fetch(path, init);
  if (!res.ok) {
    throw await parseApiError(res);
  }
  const contentType = res.headers.get("content-type");
  const raw = await res.text();

  if (res.status === 204 || raw.length === 0) {
    return null as unknown as T;
  }

  if (!contentType || !contentType.includes("application/json")) {
    return raw as unknown as T;
  }

  return JSON.parse(raw) as T;
}
