class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  json?: unknown;
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

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { json, headers, ...rest } = options;
  const authHeaders = await getAuthHeaders();
  const isFormDataBody =
    typeof FormData !== "undefined" && rest.body instanceof FormData;
  const mergedHeaders = new Headers();
  if (json !== undefined || !isFormDataBody) {
    mergedHeaders.set("Content-Type", "application/json");
  }
  for (const [key, value] of Object.entries(authHeaders)) {
    mergedHeaders.set(key, value);
  }
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }
  const init: RequestInit = {
    ...rest,
    headers: mergedHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };

  const res = await fetch(path, init);
  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(message || "API request failed", res.status);
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
