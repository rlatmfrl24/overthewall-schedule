import type {
  PublicCatalogCache,
  PublicCatalogCacheEntry,
  PublicCatalogCacheKey,
  PublicCatalogCacheResource,
} from "../application/ports/public-catalog-cache";

const PUBLIC_CATALOG_CACHE_ORIGIN = "https://otw.internal";
const PUBLIC_CATALOG_CACHE_PREFIX = "/cache/play/v1";
const PUBLIC_CATALOG_BROWSER_MAX_AGE_SECONDS = 60;

const PUBLIC_CATALOG_CACHE_RESOURCES = new Set<PublicCatalogCacheResource>([
  "config",
  "catalog",
  "facets",
  "song",
  "performance",
]);

export type CloudflarePublicCatalogCacheOperation =
  | "read"
  | "write"
  | "etag";

export type CloudflarePublicCatalogCacheFailureReason =
  | "cache_api_unavailable"
  | "cache_read_failed"
  | "cache_write_failed"
  | "invalid_cache_key"
  | "invalid_cache_ttl"
  | "etag_failed";

export class CloudflarePublicCatalogCacheError extends Error {
  readonly operation: CloudflarePublicCatalogCacheOperation;
  readonly reason: CloudflarePublicCatalogCacheFailureReason;

  constructor(
    operation: CloudflarePublicCatalogCacheOperation,
    reason: CloudflarePublicCatalogCacheFailureReason,
    options?: ErrorOptions,
  ) {
    super(`OTW Play public catalog cache ${operation} failed: ${reason}`, options);
    this.name = "CloudflarePublicCatalogCacheError";
    this.operation = operation;
    this.reason = reason;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidCacheKey = (key: PublicCatalogCacheKey) =>
  key.version === 1 &&
  Number.isSafeInteger(key.catalogRevision) &&
  key.catalogRevision >= 0 &&
  PUBLIC_CATALOG_CACHE_RESOURCES.has(key.resource) &&
  typeof key.identity === "string" &&
  !key.identity.includes("#") &&
  !key.identity.startsWith("/") &&
  !key.identity.includes("../");

const canonicalPathAndQuery = (key: PublicCatalogCacheKey) => {
  if (key.resource === "config" || key.resource === "catalog") {
    return `${key.resource}${key.identity ? `?${key.identity}` : ""}`;
  }

  return key.identity;
};

const createCacheRequest = (key: PublicCatalogCacheKey) => {
  if (!isValidCacheKey(key)) {
    throw new CloudflarePublicCatalogCacheError(
      "read",
      "invalid_cache_key",
    );
  }

  const url = new URL(
    `${PUBLIC_CATALOG_CACHE_PREFIX}/${key.catalogRevision}/${canonicalPathAndQuery(key)}`,
    PUBLIC_CATALOG_CACHE_ORIGIN,
  );
  return new Request(url, { method: "GET" });
};

const getDefaultCache = () => {
  if (typeof caches === "undefined" || !caches.default) {
    throw new CloudflarePublicCatalogCacheError(
      "read",
      "cache_api_unavailable",
    );
  }
  return caches.default;
};

const isCacheEntryForKey = (
  value: unknown,
  key: PublicCatalogCacheKey,
): value is PublicCatalogCacheEntry => {
  if (!isRecord(value) || !isRecord(value.document)) return false;
  const document = value.document;
  const data = document.data;

  const validResourceData = (() => {
    if (!isRecord(data)) return false;
    if (key.resource === "config") {
      return (
        typeof data.publicReadEnabled === "boolean" &&
        typeof data.navigationVisible === "boolean" &&
        typeof data.updatedAt === "number" &&
        Number.isSafeInteger(data.updatedAt) &&
        data.updatedAt >= 0
      );
    }
    if (key.resource === "catalog") return Array.isArray(data.items);
    if (key.resource === "facets") {
      return (
        Array.isArray(data.members) &&
        Array.isArray(data.groups) &&
        Array.isArray(data.originalArtists)
      );
    }
    if (key.resource === "song") {
      return typeof data.id === "string" && Array.isArray(data.performances);
    }
    return isRecord(data.song) && isRecord(data.performance);
  })();

  return (
    value.version === 1 &&
    value.catalogRevision === key.catalogRevision &&
    value.resource === key.resource &&
    document.catalogRevision === key.catalogRevision &&
    validResourceData &&
    (document.nextCursor === null ||
      typeof document.nextCursor === "string") &&
    typeof document.generatedAt === "string" &&
    Number.isFinite(Date.parse(document.generatedAt))
  );
};

const warnCacheFailure = (operation: "read" | "write", reason: string) => {
  console.warn(`OTW Play public catalog cache ${operation} ${reason}`);
};

const isExpectedCacheControl = (value: string | null) =>
  value !== null &&
  /^public, max-age=60, s-maxage=[1-9]\d*$/.test(value);

export const createPublicCatalogEtag = async (material: string) => {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(material),
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `W/"${hex}"`;
  } catch (error) {
    throw new CloudflarePublicCatalogCacheError("etag", "etag_failed", {
      cause: error,
    });
  }
};

export class CloudflarePublicCatalogCache implements PublicCatalogCache {
  async read(key: PublicCatalogCacheKey) {
    const cacheRequest = createCacheRequest(key);
    let response: Response | undefined;

    try {
      response = await getDefaultCache().match(cacheRequest);
    } catch (error) {
      warnCacheFailure("read", "failed");
      if (error instanceof CloudflarePublicCatalogCacheError) throw error;
      throw new CloudflarePublicCatalogCacheError(
        "read",
        "cache_read_failed",
        { cause: error },
      );
    }

    if (!response) return null;
    if (!response.ok) {
      warnCacheFailure("read", "ignored a corrupt entry");
      return null;
    }

    const cachedEtag = response.headers.get("ETag");
    if (
      !/^W\/"[a-f0-9]{64}"$/.test(cachedEtag ?? "") ||
      !isExpectedCacheControl(response.headers.get("Cache-Control"))
    ) {
      warnCacheFailure("read", "ignored a corrupt entry");
      return null;
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      warnCacheFailure("read", "ignored a corrupt entry");
      return null;
    }

    if (!isCacheEntryForKey(value, key)) {
      warnCacheFailure("read", "ignored a corrupt entry");
      return null;
    }

    let expectedEtag: string;
    try {
      expectedEtag = await createPublicCatalogEtag(
        JSON.stringify(value.document),
      );
    } catch (error) {
      warnCacheFailure("read", "failed");
      throw error;
    }
    if (cachedEtag !== expectedEtag) {
      warnCacheFailure("read", "ignored a corrupt entry");
      return null;
    }

    return value;
  }

  async write(
    key: PublicCatalogCacheKey,
    entry: PublicCatalogCacheEntry,
    ttlSeconds: number,
  ) {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new CloudflarePublicCatalogCacheError(
        "write",
        "invalid_cache_ttl",
      );
    }
    if (!isCacheEntryForKey(entry, key)) {
      throw new CloudflarePublicCatalogCacheError(
        "write",
        "invalid_cache_key",
      );
    }

    let cacheRequest: Request;
    try {
      cacheRequest = createCacheRequest(key);
    } catch (error) {
      if (error instanceof CloudflarePublicCatalogCacheError) {
        throw new CloudflarePublicCatalogCacheError(
          "write",
          error.reason,
          { cause: error },
        );
      }
      throw error;
    }

    const body = JSON.stringify(entry);
    let etag: string;
    try {
      etag = await createPublicCatalogEtag(JSON.stringify(entry.document));
    } catch (error) {
      warnCacheFailure("write", "failed");
      throw error;
    }
    const response = new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": `public, max-age=${PUBLIC_CATALOG_BROWSER_MAX_AGE_SECONDS}, s-maxage=${ttlSeconds}`,
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
      },
    });

    try {
      await getDefaultCache().put(cacheRequest, response);
    } catch (error) {
      warnCacheFailure("write", "failed");
      if (error instanceof CloudflarePublicCatalogCacheError) {
        throw new CloudflarePublicCatalogCacheError(
          "write",
          error.reason,
          { cause: error },
        );
      }
      throw new CloudflarePublicCatalogCacheError(
        "write",
        "cache_write_failed",
        { cause: error },
      );
    }
  }
}
