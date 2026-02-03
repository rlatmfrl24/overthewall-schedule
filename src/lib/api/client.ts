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

const isLatin1 = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      return false;
    }
  }
  return true;
};

const getActorHeaders = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  const clerk = (
    window as {
      Clerk?: {
        user?: {
          id?: string;
          fullName?: string | null;
          username?: string | null;
          primaryEmailAddress?: { emailAddress?: string | null };
        };
      };
    }
  ).Clerk;
  const user = clerk?.user;
  if (!user?.id) return {};
  const name =
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    user.id;
  const headers: Record<string, string> = {
    "x-otw-user-id": user.id,
  };
  if (name && isLatin1(name)) {
    headers["x-otw-user-name"] = name;
  }
  return headers;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { json, headers, ...rest } = options;
  const actorHeaders = getActorHeaders();
  const init: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...actorHeaders,
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
