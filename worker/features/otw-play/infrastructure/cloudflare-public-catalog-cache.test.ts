import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PublicCatalogCacheEntry,
  PublicCatalogCacheKey,
} from "../application/ports/public-catalog-cache";
import {
  CloudflarePublicCatalogCache,
  CloudflarePublicCatalogCacheError,
  createPublicCatalogEtag,
} from "./cloudflare-public-catalog-cache";

const key: PublicCatalogCacheKey = {
  version: 1,
  catalogRevision: 17,
  resource: "catalog",
  identity: "member=2&member=7&sort=title",
};

const entry: PublicCatalogCacheEntry = {
  version: 1,
  catalogRevision: 17,
  resource: "catalog",
  document: {
    data: { items: [] },
    nextCursor: null,
    catalogRevision: 17,
    generatedAt: "2026-08-11T00:00:00.000Z",
  },
};

const stubCache = () => {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone());
    }),
  };
  vi.stubGlobal("caches", { default: cache });
  return { cache, store };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CloudflarePublicCatalogCache", () => {
  it("uses the fixed internal host and preserves JSON cache headers", async () => {
    const { cache } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();

    await adapter.write(key, entry, 300);

    expect(cache.put).toHaveBeenCalledOnce();
    const [request, response] = cache.put.mock.calls[0];
    expect(request.url).toBe(
      "https://otw.internal/cache/play/v1/17/catalog?member=2&member=7&sort=title",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=300",
    );
    expect(response.headers.get("Cache-Control")).not.toContain(
      "stale-while-revalidate",
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("ETag")).toMatch(/^W\/"[a-f0-9]{64}"$/);
    expect(await adapter.read(key)).toEqual(entry);
  });

  it("keeps config state in its deterministic cache URL identity", async () => {
    const { cache } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();
    const configKey: PublicCatalogCacheKey = {
      version: 1,
      catalogRevision: 21,
      resource: "config",
      identity: "public=0&navigation=0&updatedAt=1786406400000",
    };
    const configEntry: PublicCatalogCacheEntry = {
      version: 1,
      catalogRevision: 21,
      resource: "config",
      document: {
        data: {
          publicReadEnabled: false,
          navigationVisible: false,
          updatedAt: 1786406400000,
        },
        nextCursor: null,
        catalogRevision: 21,
        generatedAt: "2026-08-11T00:00:00.000Z",
      },
    };

    await adapter.write(configKey, configEntry, 1800);

    expect(cache.put.mock.calls[0][0].url).toBe(
      "https://otw.internal/cache/play/v1/21/config?public=0&navigation=0&updatedAt=1786406400000",
    );
    expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=1800",
    );
  });

  it("returns a miss without deleting malformed or mismatched JSON", async () => {
    const { cache, store } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cacheUrl =
      "https://otw.internal/cache/play/v1/17/catalog?member=2&member=7&sort=title";

    store.set(cacheUrl, new Response("not json"));
    await expect(adapter.read(key)).resolves.toBeNull();

    store.set(
      cacheUrl,
      Response.json({ ...entry, catalogRevision: 18 }),
    );
    await expect(adapter.read(key)).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(cache).not.toHaveProperty("delete");
  });

  it("treats an invalid resource data shape as a corrupt miss", async () => {
    const { store } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cacheUrl =
      "https://otw.internal/cache/play/v1/17/catalog?member=2&member=7&sort=title";
    const invalidEntry = {
      ...entry,
      document: { ...entry.document, data: null },
    };
    const body = JSON.stringify(invalidEntry);

    store.set(
      cacheUrl,
      new Response(body, {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
          ETag: await createPublicCatalogEtag(
            JSON.stringify(invalidEntry.document),
          ),
        },
      }),
    );

    await expect(adapter.read(key)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("treats missing cache headers and a mismatched ETag as corrupt misses", async () => {
    const { store } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cacheUrl =
      "https://otw.internal/cache/play/v1/17/catalog?member=2&member=7&sort=title";

    store.set(cacheUrl, Response.json(entry));
    await expect(adapter.read(key)).resolves.toBeNull();

    store.set(
      cacheUrl,
      Response.json(entry, {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
          ETag: `W/"${"0".repeat(64)}"`,
        },
      }),
    );
    await expect(adapter.read(key)).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("surfaces Cache API read and write failures as typed errors", async () => {
    const cache = {
      match: vi.fn(async () => {
        throw new Error("read failure");
      }),
      put: vi.fn(async () => {
        throw new Error("write failure");
      }),
    };
    vi.stubGlobal("caches", { default: cache });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new CloudflarePublicCatalogCache();

    await expect(adapter.read(key)).rejects.toMatchObject({
      name: "CloudflarePublicCatalogCacheError",
      operation: "read",
      reason: "cache_read_failed",
    });
    await expect(adapter.write(key, entry, 300)).rejects.toMatchObject({
      name: "CloudflarePublicCatalogCacheError",
      operation: "write",
      reason: "cache_write_failed",
    });
  });

  it("warns when cache integrity ETag generation fails", async () => {
    const { store } = stubCache();
    const adapter = new CloudflarePublicCatalogCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cacheUrl =
      "https://otw.internal/cache/play/v1/17/catalog?member=2&member=7&sort=title";
    store.set(
      cacheUrl,
      Response.json(entry, {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
          ETag: `W/"${"0".repeat(64)}"`,
        },
      }),
    );
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockRejectedValue(new Error("digest failed")),
      },
    });

    await expect(adapter.read(key)).rejects.toMatchObject({
      operation: "etag",
      reason: "etag_failed",
    });
    await expect(adapter.write(key, entry, 300)).rejects.toMatchObject({
      operation: "etag",
      reason: "etag_failed",
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable Cache API without falling back to stale data", async () => {
    vi.stubGlobal("caches", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new CloudflarePublicCatalogCache();

    await expect(adapter.read(key)).rejects.toEqual(
      expect.objectContaining<Partial<CloudflarePublicCatalogCacheError>>({
        operation: "read",
        reason: "cache_api_unavailable",
      }),
    );
    await expect(adapter.write(key, entry, 300)).rejects.toEqual(
      expect.objectContaining<Partial<CloudflarePublicCatalogCacheError>>({
        operation: "write",
        reason: "cache_api_unavailable",
      }),
    );
  });
});

describe("createPublicCatalogEtag", () => {
  it("produces a deterministic SHA-256 weak ETag from Unicode material", async () => {
    await expect(createPublicCatalogEtag("오버더월 プレイ play")).resolves.toBe(
      'W/"bd8abab297be27d95bc907cfa071987e8255f407c9fed2f92c5f7d4ab3168174"',
    );
    await expect(createPublicCatalogEtag("오버더월 プレイ play")).resolves.toBe(
      await createPublicCatalogEtag("오버더월 プレイ play"),
    );
  });
});
