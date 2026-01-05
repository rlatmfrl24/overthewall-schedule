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
  if (res.status === 204) {
    return null as unknown as T;
  }
  return (await res.json()) as T;
}
