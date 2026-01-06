export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  json?: unknown;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { json, headers, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
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
