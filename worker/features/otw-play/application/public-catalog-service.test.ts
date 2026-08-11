import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CATALOG_SEARCH_RANKS,
  decodePublicCatalogCursor,
  type PublicCatalogTitleCursorPosition,
} from "../domain/public-catalog-cursor";
import {
  canonicalizePublicCatalogQuery,
  parsePublicCatalogQuery,
} from "../domain/public-catalog-query";
import type {
  PublicCatalogCache,
  PublicCatalogCacheEntry,
} from "./ports/public-catalog-cache";
import type {
  PublicCatalogFacets,
  PublicCatalogMeta,
  PublicCatalogPerformanceDetail,
  PublicCatalogReader,
  PublicCatalogReaderPage,
  PublicCatalogSongDetail,
} from "./ports/public-catalog-reader";
import {
  PublicCatalogService,
  PublicCatalogServiceError,
} from "./public-catalog-service";

const META_ON: PublicCatalogMeta = {
  revision: 12,
  readModelRevision: 12,
  publicReadEnabled: true,
  navigationVisible: true,
  updatedAt: 1_786_374_000_000,
};

const META_OFF: PublicCatalogMeta = {
  ...META_ON,
  revision: 13,
  publicReadEnabled: false,
  navigationVisible: false,
};

const EMPTY_FACETS: PublicCatalogFacets = {
  members: [],
  groups: [],
  originalArtists: [],
};

const SONG_DETAIL: PublicCatalogSongDetail = {
  id: "song-1",
  slug: "song-one",
  title: "노래 하나",
  normalizedTitle: "노래 하나",
  isOtwOriginal: false,
  originalReleaseDate: null,
  originalReleasePrecision: "unknown",
  originalArtists: [],
  performances: [],
};

const PERFORMANCE_DETAIL: PublicCatalogPerformanceDetail = {
  song: SONG_DETAIL,
  performance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "solo",
    releasedAt: null,
    participants: [],
    sources: [],
    primarySourceId: null,
    playbackSourceId: null,
    playable: false,
    fallbackReason: "missing_primary",
  },
};

const parse = (query = "") =>
  parsePublicCatalogQuery(new URLSearchParams(query).entries());

const makeReader = (meta: PublicCatalogMeta = META_ON) => {
  const reader = {
    readMeta: vi.fn(async (): Promise<PublicCatalogMeta> => meta),
    readCatalog: vi.fn(
      async (): Promise<PublicCatalogReaderPage> => ({
        items: [],
        nextPosition: null,
      }),
    ),
    readFacets: vi.fn(async (): Promise<PublicCatalogFacets> => EMPTY_FACETS),
    readSongBySlug: vi.fn(
      async (): Promise<PublicCatalogSongDetail | null> => SONG_DETAIL,
    ),
    readPerformanceById: vi.fn(
      async (): Promise<PublicCatalogPerformanceDetail | null> =>
        PERFORMANCE_DETAIL,
    ),
  } satisfies PublicCatalogReader;
  return reader;
};

const makeCache = () => {
  const cache = {
    read: vi.fn(async (): Promise<PublicCatalogCacheEntry | null> => null),
    write: vi.fn(async () => undefined),
  } satisfies PublicCatalogCache;
  return cache;
};

describe("OTW Play public catalog service", () => {
  it("reads authoritative meta before a config cache hit and keeps config readable while disabled", async () => {
    const order: string[] = [];
    const reader = makeReader(META_OFF);
    reader.readMeta.mockImplementation(async () => {
      order.push("meta");
      return META_OFF;
    });
    const cache = makeCache();
    cache.read.mockImplementation(async () => {
      order.push("cache");
      return {
        version: 1,
        catalogRevision: META_OFF.revision,
        resource: "config",
        document: {
          data: {
            publicReadEnabled: false,
            navigationVisible: false,
            updatedAt: META_OFF.updatedAt,
          },
          nextCursor: null,
          catalogRevision: META_OFF.revision,
          generatedAt: "2026-08-11T00:00:00.000Z",
        },
      } satisfies PublicCatalogCacheEntry;
    });

    const result = await new PublicCatalogService(reader, cache).readConfig({
      allowSharedCache: true,
    });

    expect(order).toEqual(["meta", "cache"]);
    expect(result).toMatchObject({
      status: "ok",
      cacheStatus: "hit",
      document: {
        catalogRevision: META_OFF.revision,
        data: { publicReadEnabled: false, navigationVisible: false },
      },
    });
    expect(cache.read).toHaveBeenCalledWith({
      version: 1,
      catalogRevision: META_OFF.revision,
      resource: "config",
      identity: `public=0&navigation=0&updatedAt=${META_OFF.updatedAt}`,
    });
  });

  it("uses a 30 minute config TTL and treats cache failures as misses", async () => {
    const reader = makeReader();
    const cache = makeCache();
    cache.read.mockRejectedValueOnce(new Error("cache unavailable"));
    cache.write.mockRejectedValueOnce(new Error("cache unavailable"));

    const result = await new PublicCatalogService(
      reader,
      cache,
      () => 1_786_374_000_000,
    ).readConfig({ allowSharedCache: true });

    expect(result).toMatchObject({
      status: "ok",
      cacheStatus: "miss",
      document: {
        data: {
          publicReadEnabled: true,
          navigationVisible: true,
          updatedAt: META_ON.updatedAt,
        },
      },
    });
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "config" }),
      expect.objectContaining({ resource: "config" }),
      30 * 60,
    );
  });

  it("fails closed from one preflight before cache or content reads for every non-config endpoint", async () => {
    const reader = makeReader(META_OFF);
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);
    const preloadedMeta = await service.readPublicState();

    const results = await Promise.all([
      service.browseCatalog(
        parse(),
        { allowSharedCache: true },
        preloadedMeta,
      ),
      service.readFacets({ allowSharedCache: true }, preloadedMeta),
      service.readSong(
        "song-one",
        { allowSharedCache: true },
        preloadedMeta,
      ),
      service.readPerformance(
        "performance-1",
        { allowSharedCache: true },
        preloadedMeta,
      ),
    ]);

    expect(results).toEqual(
      Array.from({ length: 4 }, () => ({
        status: "disabled",
        reason: "public_read_disabled",
        catalogRevision: META_OFF.revision,
      })),
    );
    expect(cache.read).not.toHaveBeenCalled();
    expect(reader.readMeta).toHaveBeenCalledTimes(1);
    expect(reader.readCatalog).not.toHaveBeenCalled();
    expect(reader.readFacets).not.toHaveBeenCalled();
    expect(reader.readSongBySlug).not.toHaveBeenCalled();
    expect(reader.readPerformanceById).not.toHaveBeenCalled();
  });

  it("rejects a stale read model before shared cache or content reads", async () => {
    const reader = makeReader({ ...META_ON, readModelRevision: 11 });
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);

    const reads = [
      () => service.browseCatalog(parse(), { allowSharedCache: true }),
      () => service.readFacets({ allowSharedCache: true }),
      () => service.readSong("song-one", { allowSharedCache: true }),
      () =>
        service.readPerformance("performance-1", {
          allowSharedCache: true,
        }),
    ];

    for (const read of reads) {
      await expect(read()).rejects.toEqual(
        expect.objectContaining<Partial<PublicCatalogServiceError>>({
          reason: "read_model_stale",
        }),
      );
    }
    expect(cache.read).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
    expect(reader.readCatalog).not.toHaveBeenCalled();
    expect(reader.readFacets).not.toHaveBeenCalled();
    expect(reader.readSongBySlug).not.toHaveBeenCalled();
    expect(reader.readPerformanceById).not.toHaveBeenCalled();

    await expect(
      service.readConfig({ allowSharedCache: false }),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("caches filtered and sorted structured first pages but bypasses search", async () => {
    const reader = makeReader();
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);
    const structured = parse("relation=cover&sort=title&limit=60");

    await expect(
      service.browseCatalog(structured, { allowSharedCache: true }),
    ).resolves.toMatchObject({ status: "ok", cacheStatus: "miss" });
    expect(cache.read).toHaveBeenCalledWith({
      version: 1,
      catalogRevision: META_ON.revision,
      resource: "catalog",
      identity: canonicalizePublicCatalogQuery(structured),
    });
    expect(cache.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: "catalog" }),
      expect.objectContaining({ resource: "catalog" }),
      5 * 60,
    );

    cache.read.mockClear();
    cache.write.mockClear();
    const searched = await service.browseCatalog(parse("q=노래&sort=title"), {
      allowSharedCache: true,
    });
    expect(searched).toMatchObject({ status: "ok", cacheStatus: "bypass" });
    expect(cache.read).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("round-trips the Unicode search phase cursor into the reader", async () => {
    const reader = makeReader();
    const nextPosition: PublicCatalogTitleCursorPosition = {
      sort: "title",
      searchPhase: "indexed",
      relevanceRank: PUBLIC_CATALOG_SEARCH_RANKS.titlePrefix,
      normalizedTitle: "노래・하나",
      songId: "song-1",
    };
    reader.readCatalog.mockResolvedValue({ items: [], nextPosition });
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);
    const firstQuery = parse("q=노래&sort=title&limit=1");

    const first = await service.browseCatalog(firstQuery, {
      allowSharedCache: true,
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") throw new Error("expected catalog result");
    expect(first.document.data).not.toHaveProperty("totalCount");
    expect(first.document.nextCursor).not.toBeNull();

    const cursor = first.document.nextCursor as string;
    expect(
      decodePublicCatalogCursor(cursor, {
        catalogRevision: META_ON.revision,
        queryKey: canonicalizePublicCatalogQuery(firstQuery),
        hasSearch: true,
        sort: "title",
      }),
    ).toEqual(nextPosition);

    const secondQuery = parse(
      `q=${encodeURIComponent("노래")}&sort=title&limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    await service.browseCatalog(secondQuery, { allowSharedCache: true });
    expect(reader.readCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: nextPosition }),
    );
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("classifies an invalid reader next-position as an internal reader contract error", async () => {
    const reader = makeReader();
    reader.readCatalog.mockResolvedValue({
      items: [],
      nextPosition: {
        sort: "recent",
        searchPhase: "contains",
        relevanceRank: 6,
        releasedAt: 1,
        songId: "song-invalid",
      },
    });
    const service = new PublicCatalogService(reader, makeCache());

    await expect(
      service.browseCatalog(parse("q=song"), { allowSharedCache: true }),
    ).rejects.toMatchObject({
      reason: "reader_cursor_contract",
    });
  });

  it("orchestrates facets and both detail reads without pass-through framework types", async () => {
    const reader = makeReader();
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);
    const context = { allowSharedCache: false };

    await expect(service.readFacets(context)).resolves.toMatchObject({
      status: "ok",
      cacheStatus: "bypass",
      document: { data: EMPTY_FACETS },
    });
    await expect(service.readSong("song-one", context)).resolves.toMatchObject({
      status: "ok",
      document: { data: SONG_DETAIL },
    });
    await expect(
      service.readPerformance("performance-1", context),
    ).resolves.toMatchObject({
      status: "ok",
      document: { data: PERFORMANCE_DETAIL },
    });
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("does not serve cache after D1 meta failure and never converts D1 failures to stale success", async () => {
    const reader = makeReader();
    reader.readMeta.mockRejectedValueOnce(new Error("D1 unavailable"));
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);

    await expect(
      service.readFacets({ allowSharedCache: true }),
    ).rejects.toThrow("D1 unavailable");
    expect(cache.read).not.toHaveBeenCalled();

    cache.read.mockResolvedValueOnce(null);
    reader.readFacets.mockRejectedValueOnce(new Error("D1 unavailable"));
    await expect(
      service.readFacets({ allowSharedCache: true }),
    ).rejects.toThrow("D1 unavailable");
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("returns typed detail misses without caching them", async () => {
    const reader = makeReader();
    reader.readSongBySlug.mockResolvedValueOnce(null);
    reader.readPerformanceById.mockResolvedValueOnce(null);
    const cache = makeCache();
    const service = new PublicCatalogService(reader, cache);
    const context = { allowSharedCache: true };

    await expect(service.readSong("missing", context)).resolves.toEqual({
      status: "not_found",
      reason: "song_not_found",
      catalogRevision: META_ON.revision,
    });
    await expect(
      service.readPerformance("missing", context),
    ).resolves.toEqual({
      status: "not_found",
      reason: "performance_not_found",
      catalogRevision: META_ON.revision,
    });
    expect(cache.write).not.toHaveBeenCalled();
  });
});
