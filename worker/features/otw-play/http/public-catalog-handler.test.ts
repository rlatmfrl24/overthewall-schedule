import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type {
  PublicCatalogCache,
  PublicCatalogCacheEntry,
  PublicCatalogCacheKey,
} from "../application/ports/public-catalog-cache";
import type {
  PublicCatalogMeta,
  PublicCatalogReader,
} from "../application/ports/public-catalog-reader";
import { PublicCatalogService } from "../application/public-catalog-service";
import { encodePublicCatalogCursor } from "../domain/public-catalog-cursor";
import { createPublicCatalogHandler } from "./public-catalog-handler";

const env = {} as Env;

class MemoryCache implements PublicCatalogCache {
  readonly entries = new Map<string, PublicCatalogCacheEntry>();
  reads = 0;
  writes = 0;

  private key(value: PublicCatalogCacheKey) {
    return JSON.stringify(value);
  }

  async read(key: PublicCatalogCacheKey) {
    this.reads += 1;
    return this.entries.get(this.key(key)) ?? null;
  }

  async write(
    key: PublicCatalogCacheKey,
    entry: PublicCatalogCacheEntry,
  ) {
    this.writes += 1;
    this.entries.set(this.key(key), entry);
  }
}

const makeReader = (
  options: {
    meta?: Partial<PublicCatalogMeta>;
    failMeta?: boolean;
  } = {},
): PublicCatalogReader => ({
  async readMeta() {
    if (options.failMeta) throw new Error("sensitive SQL failure");
    return {
      revision: 7,
      readModelRevision: 7,
      publicReadEnabled: true,
      navigationVisible: false,
      updatedAt: 1_786_000_000_000,
      ...options.meta,
    };
  },
  async readCatalog() {
    return { items: [], nextPosition: null };
  },
  async readFacets() {
    return { members: [], groups: [], originalArtists: [] };
  },
  async readSongBySlug() {
    return null;
  },
  async readPerformanceById() {
    return null;
  },
});

const makeHandler = (
  reader: PublicCatalogReader,
  cache = new MemoryCache(),
) => {
  const service = new PublicCatalogService(
    reader,
    cache,
    () => 1_786_000_000_000,
  );
  return {
    cache,
    handler: createPublicCatalogHandler(
      () => service,
      async () => 'W/"catalog-etag"',
    ),
  };
};

const request = (path: string, init?: RequestInit) =>
  new Request(`https://example.com${path}`, init);

describe("OTW Play public catalog HTTP handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns config even while public reads are disabled", async () => {
    const { handler } = makeHandler(
      makeReader({
        meta: { publicReadEnabled: false, navigationVisible: false },
      }),
    );

    const response = await handler(request("/api/play/config"), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { publicReadEnabled: false, navigationVisible: false },
      nextCursor: null,
      catalogRevision: 7,
    });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=1800",
    );
  });

  it("fails closed for catalog and facets while disabled", async () => {
    const { handler } = makeHandler(
      makeReader({ meta: { publicReadEnabled: false } }),
    );

    for (const path of [
      "/api/play/catalog",
      "/api/play/catalog?limit=999&cursor=malformed",
      "/api/play/facets",
    ]) {
      const response = await handler(request(path), env);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "PLAY_PUBLIC_READ_DISABLED" },
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("returns 503 for a stale read model before cache or catalog reads while keeping config available", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reader = makeReader({ meta: { readModelRevision: 6 } });
    const readCatalog = vi.spyOn(reader, "readCatalog");
    const cache = new MemoryCache();
    const { handler } = makeHandler(reader, cache);

    const response = await handler(request("/api/play/catalog"), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PLAY_CATALOG_UNAVAILABLE" },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(cache.reads).toBe(0);
    expect(cache.writes).toBe(0);
    expect(readCatalog).not.toHaveBeenCalled();

    const config = await handler(request("/api/play/config"), env);
    expect(config.status).toBe(200);
    expect(await config.json()).toMatchObject({
      data: { publicReadEnabled: true, navigationVisible: false },
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/api/play/catalog?unknown=1",
    "/api/play/catalog?limit=61",
    "/api/play/catalog?sort=recent&sort=title",
    `/api/play/catalog?${Array.from({ length: 11 }, (_, index) => `member=${index + 1}`).join("&")}`,
    "/api/play/catalog?q=%20%20%20",
    "/api/play/config?extra=1",
  ])("returns a standard strict-query 400 for %s", async (path) => {
    const { handler } = makeHandler(makeReader());

    const response = await handler(request(path), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "PLAY_INVALID_QUERY",
        requestId: expect.any(String),
      },
    });
  });

  it("distinguishes stale cursors from malformed cursors", async () => {
    const staleCursor = encodePublicCatalogCursor(
      { catalogRevision: 6, queryKey: "", hasSearch: false },
      {
        sort: "recent",
        searchPhase: null,
        relevanceRank: null,
        releasedAt: 1,
        songId: "song-1",
      },
    );
    const { handler } = makeHandler(makeReader());

    const stale = await handler(
      request(`/api/play/catalog?cursor=${encodeURIComponent(staleCursor)}`),
      env,
    );
    const malformed = await handler(
      request("/api/play/catalog?cursor=not-a-cursor"),
      env,
    );

    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "PLAY_CURSOR_STALE" },
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: "PLAY_INVALID_CURSOR" },
    });
  });

  it("returns 404 for unknown canonical song and performance identities", async () => {
    const reader = makeReader();
    const readSong = vi.spyOn(reader, "readSongBySlug");
    const { handler } = makeHandler(reader);

    for (const path of [
      "/api/play/songs/missing-song",
      "/api/play/songs/%EC%98%A4%EB%B2%84%EB%8D%94%EC%9B%94-%E5%8E%9F%E6%9B%B2",
      "/api/play/performances/missing-performance",
    ]) {
      const response = await handler(request(path), env);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "PLAY_NOT_FOUND" },
      });
    }
    expect(readSong).toHaveBeenCalledWith("오버더월-原曲");
  });

  it("supports weak ETag conditional 304", async () => {
    const { handler } = makeHandler(makeReader());

    const response = await handler(
      request("/api/play/config", {
        headers: { "If-None-Match": '"catalog-etag"' },
      }),
      env,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe('W/"catalog-etag"');
    expect(await response.text()).toBe("");
  });

  it("bypasses shared cache for Authorization or Cookie requests", async () => {
    const cache = new MemoryCache();
    const { handler } = makeHandler(makeReader(), cache);

    const response = await handler(
      request("/api/play/facets", {
        headers: { Authorization: "Bearer token", Cookie: "session=1" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
    expect(cache.reads).toBe(0);
    expect(cache.writes).toBe(0);
  });

  it("keeps private cache variance on disabled error responses", async () => {
    const { handler } = makeHandler(
      makeReader({ meta: { publicReadEnabled: false } }),
    );

    const response = await handler(
      request("/api/play/catalog?limit=999", {
        headers: { Authorization: "Bearer token" },
      }),
      env,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
  });

  it("returns a redacted 503 on authoritative D1 failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = makeHandler(makeReader({ failMeta: true }));

    const response = await handler(
      request("/api/play/catalog?q=secret-cursor-value"),
      env,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PLAY_CATALOG_UNAVAILABLE" },
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("SQL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a reader cursor contract violation to a public 500", async () => {
    const reader = makeReader();
    reader.readCatalog = async () => ({
      items: [],
      nextPosition: {
        sort: "title",
        searchPhase: null,
        relevanceRank: null,
        normalizedTitle: "reader drift",
        songId: "song-reader-drift",
      },
    });
    const { handler } = makeHandler(reader);

    const response = await handler(request("/api/play/catalog"), env);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "PLAY_INTERNAL_ERROR" },
    });
  });

  it("does not emit a public slug that the request boundary rejects", async () => {
    const reader = makeReader();
    reader.readFacets = async () => ({
      members: [],
      groups: [],
      originalArtists: [
        {
          id: "invalid-artist",
          slug: "invalid/artist",
          displayName: "Invalid Artist",
          entityKind: "person",
        },
      ],
    });
    const { handler } = makeHandler(reader);

    const response = await handler(request("/api/play/facets"), env);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "PLAY_INTERNAL_ERROR" },
    });
  });

  it("projects an opaque server-issued group key for group participants", async () => {
    const reader = makeReader();
    reader.readCatalog = async () => ({
      items: [
        {
          id: "song-1",
          slug: "song-1",
          title: "Group Song",
          normalizedTitle: "group song",
          isOtwOriginal: true,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          originalArtists: [],
          publishedPerformanceCount: 1,
          representativePerformance: {
            id: "performance-1",
            relation: "original",
            releaseType: "official_video",
            participation: "group",
            releasedAt: null,
            participants: [
              {
                id: "entity-group",
                slug: "otw-unit",
                displayName: "OTW Unit",
                entityKind: "group",
                creditName: "OTW Unit",
                participantRole: "vocal",
                creditOrder: 0,
                kind: "group",
                member: null,
              },
            ],
            sources: [],
            primarySourceId: null,
            playbackSourceId: null,
            playable: false,
            fallbackReason: "missing_primary",
          },
        },
      ],
      nextPosition: null,
    });
    const { handler } = makeHandler(reader);

    const response = await handler(request("/api/play/catalog"), env);
    const body = await response.json<{
      data: { items: Array<{ representativePerformance: { participants: Array<{ groupKey?: string }> } }> };
    }>();

    expect(response.status).toBe(200);
    expect(
      body.data.items[0]?.representativePerformance.participants[0]?.groupKey,
    ).toMatch(/^g1_/);
  });
});
