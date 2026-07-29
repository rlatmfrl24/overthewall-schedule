import {
  extractXHandle,
  X_HANDLE_PATTERN,
} from "../domain/handle-targets";

const ACTIVE_HANDLES_TTL_MS = 5 * 60_000;

let activeHandlesCache:
  | { database: D1Database; fetchedAt: number; handles: ReadonlySet<string> }
  | undefined;

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  return Array.isArray(results) ? (results as T[]) : [];
};

export class XAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("X handle allowlist is unavailable", options);
    this.name = "XAllowlistUnavailableError";
  }
}

export const readActiveXHandles = async (
  database: D1Database,
): Promise<ReadonlySet<string>> => {
  const now = Date.now();
  if (
    activeHandlesCache?.database === database &&
    now - activeHandlesCache.fetchedAt < ACTIVE_HANDLES_TTL_MS
  ) {
    return activeHandlesCache.handles;
  }

  try {
    const statement = database.prepare(
      `SELECT url_twitter
         FROM members
         WHERE url_twitter IS NOT NULL
           AND TRIM(url_twitter) <> ''
           AND (is_deprecated IS NULL OR is_deprecated != 1)`,
    );
    const executable =
      typeof (statement as { all?: unknown }).all === "function"
        ? statement
        : statement.bind();
    const result = await executable.all<{ url_twitter: string | null }>();
    const handles = new Set<string>();
    for (const row of getD1Results<{ url_twitter: string | null }>(result)) {
      const handle = extractXHandle(row.url_twitter)?.toLowerCase();
      if (handle && X_HANDLE_PATTERN.test(handle)) handles.add(handle);
    }
    activeHandlesCache = { database, fetchedAt: now, handles };
    return handles;
  } catch (error) {
    throw new XAllowlistUnavailableError({ cause: error });
  }
};

export const clearActiveXHandlesCacheForTests = () => {
  activeHandlesCache = undefined;
};
