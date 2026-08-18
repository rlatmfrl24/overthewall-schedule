import {
  canonicalizePublicCatalogQuery,
  isStructuredFirstPagePublicCatalogCacheQuery,
  type PublicCatalogQuery,
} from "../domain/public-catalog-query";
import {
  decodePublicCatalogCursor,
  encodePublicCatalogCursor,
  PublicCatalogCursorError,
} from "../domain/public-catalog-cursor";
import type {
  PublicCatalogCache,
  PublicCatalogCacheDocument,
  PublicCatalogCacheEntry,
  PublicCatalogCacheKey,
  PublicCatalogCacheResource,
  PublicCatalogDocument,
} from "./ports/public-catalog-cache";
import type {
  PublicCatalogFacets,
  PublicCatalogMeta,
  PublicCatalogPerformanceDetail,
  PublicCatalogReader,
  PublicCatalogReaderQuery,
  PublicCatalogSongDetail,
  PublicCatalogSongSummary,
} from "./ports/public-catalog-reader";

const CACHE_TTL_SECONDS = {
  config: 30 * 60,
  catalog: 5 * 60,
  facets: 30 * 60,
  song: 10 * 60,
  performance: 10 * 60,
} as const;

export interface PublicCatalogReadContext {
  allowSharedCache: boolean;
  allowDisabledRead?: boolean;
}

export interface PublicCatalogConfigData {
  publicReadEnabled: boolean;
  navigationVisible: boolean;
  updatedAt: number;
}

export type PublicCatalogCacheStatus = "hit" | "miss" | "bypass";

export interface PublicCatalogOkResult<Data> {
  status: "ok";
  document: PublicCatalogDocument<Data>;
  cacheStatus: PublicCatalogCacheStatus;
}

export interface PublicCatalogDisabledResult {
  status: "disabled";
  reason: "public_read_disabled";
  catalogRevision: number;
}

export interface PublicCatalogNotFoundResult {
  status: "not_found";
  reason: "song_not_found" | "performance_not_found";
  catalogRevision: number;
}

export type PublicCatalogReadResult<Data> =
  | PublicCatalogOkResult<Data>
  | PublicCatalogDisabledResult;

export type PublicCatalogDetailResult<Data> =
  | PublicCatalogOkResult<Data>
  | PublicCatalogDisabledResult
  | PublicCatalogNotFoundResult;

export type PublicCatalogServiceErrorReason =
  | "invalid_meta"
  | "read_model_stale"
  | "reader_cursor_contract";

export class PublicCatalogServiceError extends Error {
  readonly reason: PublicCatalogServiceErrorReason;

  constructor(reason: PublicCatalogServiceErrorReason) {
    super(`Invalid public catalog service state: ${reason}`);
    this.name = "PublicCatalogServiceError";
    this.reason = reason;
  }
}

const validateMeta = (meta: PublicCatalogMeta) => {
  if (
    !Number.isSafeInteger(meta.revision) ||
    meta.revision < 0 ||
    (meta.readModelRevision !== null &&
      (!Number.isSafeInteger(meta.readModelRevision) ||
        meta.readModelRevision < 0)) ||
    typeof meta.publicReadEnabled !== "boolean" ||
    typeof meta.navigationVisible !== "boolean" ||
    (meta.navigationVisible && !meta.publicReadEnabled) ||
    !Number.isSafeInteger(meta.updatedAt) ||
    meta.updatedAt < 0
  ) {
    throw new PublicCatalogServiceError("invalid_meta");
  }
  return meta;
};

const disabled = (meta: PublicCatalogMeta): PublicCatalogDisabledResult => ({
  status: "disabled",
  reason: "public_read_disabled",
  catalogRevision: meta.revision,
});

const assertContentReadable = (
  meta: PublicCatalogMeta,
  allowDisabledRead: boolean,
): PublicCatalogDisabledResult | null => {
  if (!meta.publicReadEnabled && !allowDisabledRead) return disabled(meta);
  if (meta.readModelRevision !== meta.revision) {
    throw new PublicCatalogServiceError("read_model_stale");
  }
  return null;
};

export class PublicCatalogService {
  private readonly reader: PublicCatalogReader;
  private readonly cache: PublicCatalogCache;
  private readonly now: () => number;

  constructor(
    reader: PublicCatalogReader,
    cache: PublicCatalogCache,
    now: () => number = Date.now,
  ) {
    this.reader = reader;
    this.cache = cache;
    this.now = now;
  }

  async readConfig(
    context: PublicCatalogReadContext,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogOkResult<PublicCatalogConfigData>> {
    const meta = await this.resolveMeta(preloadedMeta);
    const identity = [
      `public=${Number(meta.publicReadEnabled)}`,
      `navigation=${Number(meta.navigationVisible)}`,
      `updatedAt=${meta.updatedAt}`,
    ].join("&");
    const key = this.cacheKey(meta, "config", identity);
    const cached = context.allowSharedCache
      ? await this.readCache<PublicCatalogConfigData>(key)
      : null;
    if (cached) {
      return { status: "ok", document: cached, cacheStatus: "hit" };
    }
    const document = this.createDocument(meta, {
      publicReadEnabled: meta.publicReadEnabled,
      navigationVisible: meta.navigationVisible,
      updatedAt: meta.updatedAt,
    });
    if (context.allowSharedCache) await this.writeCache(key, document);
    return {
      status: "ok",
      document,
      cacheStatus: context.allowSharedCache ? "miss" : "bypass",
    };
  }

  async browseCatalog(
    query: PublicCatalogQuery,
    context: PublicCatalogReadContext,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogReadResult<{ items: PublicCatalogSongSummary[] }>> {
    const meta = await this.resolveMeta(preloadedMeta);
    const unavailable = assertContentReadable(
      meta,
      context.allowDisabledRead === true,
    );
    if (unavailable) return unavailable;

    const queryKey = canonicalizePublicCatalogQuery(query);
    const cursor = query.cursorToken
      ? decodePublicCatalogCursor(query.cursorToken, {
          catalogRevision: meta.revision,
          queryKey,
          hasSearch: query.normalizedQuery !== null,
          sort: query.sort,
        })
      : null;
    const readerQuery: PublicCatalogReaderQuery = {
      normalizedQuery: query.normalizedQuery,
      memberUids: query.memberUids,
      memberMode: query.memberMode,
      groupKey: query.groupKey,
      group: query.group,
      participantSlug: query.participantSlug,
      relation: query.relation,
      participation: query.participation,
      originalArtistSlug: query.originalArtistSlug,
      publishedFrom: query.publishedFrom,
      publishedTo: query.publishedTo,
      sort: query.sort,
      limit: query.limit,
      cursor,
    };
    const cacheAllowed =
      context.allowSharedCache &&
      isStructuredFirstPagePublicCatalogCacheQuery(query);
    const key = this.cacheKey(meta, "catalog", queryKey);
    const cached = cacheAllowed
      ? await this.readCache<{ items: PublicCatalogSongSummary[] }>(key)
      : null;
    if (cached) {
      return { status: "ok", document: cached, cacheStatus: "hit" };
    }

    const page = await this.reader.readCatalog(readerQuery);
    if (page.nextPosition && page.nextPosition.sort !== query.sort) {
      throw new PublicCatalogServiceError("reader_cursor_contract");
    }
    let nextCursor: string | null = null;
    if (page.nextPosition) {
      try {
        nextCursor = encodePublicCatalogCursor(
          {
            catalogRevision: meta.revision,
            queryKey,
            hasSearch: query.normalizedQuery !== null,
          },
          page.nextPosition,
        );
      } catch (error) {
        if (error instanceof PublicCatalogCursorError) {
          throw new PublicCatalogServiceError("reader_cursor_contract");
        }
        throw error;
      }
    }
    const document = this.createDocument(
      meta,
      { items: page.items },
      nextCursor,
    );
    if (cacheAllowed) await this.writeCache(key, document);
    return {
      status: "ok",
      document,
      cacheStatus: cacheAllowed ? "miss" : "bypass",
    };
  }

  async readFacets(
    context: PublicCatalogReadContext,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogReadResult<PublicCatalogFacets>> {
    return this.readCachedResource(
      "facets",
      "facets",
      context,
      () => this.reader.readFacets(),
      preloadedMeta,
    );
  }

  async readSong(
    slug: string,
    context: PublicCatalogReadContext,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogDetailResult<PublicCatalogSongDetail>> {
    return this.readCachedDetail(
      "song",
      `songs/${encodeURIComponent(slug)}`,
      "song_not_found",
      context,
      () => this.reader.readSongBySlug(slug),
      preloadedMeta,
    );
  }

  async readPerformance(
    performanceId: string,
    context: PublicCatalogReadContext,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogDetailResult<PublicCatalogPerformanceDetail>> {
    return this.readCachedDetail(
      "performance",
      `performances/${encodeURIComponent(performanceId)}`,
      "performance_not_found",
      context,
      () => this.reader.readPerformanceById(performanceId),
      preloadedMeta,
    );
  }

  async readPublicState(): Promise<PublicCatalogMeta> {
    return validateMeta(await this.reader.readMeta());
  }

  private async resolveMeta(preloadedMeta?: PublicCatalogMeta) {
    return preloadedMeta
      ? validateMeta(preloadedMeta)
      : this.readPublicState();
  }

  private createDocument<Data>(
    meta: PublicCatalogMeta,
    data: Data,
    nextCursor: string | null = null,
  ): PublicCatalogDocument<Data> {
    const timestamp = this.now();
    if (!Number.isFinite(timestamp)) {
      throw new PublicCatalogServiceError("invalid_meta");
    }
    return {
      data,
      nextCursor,
      catalogRevision: meta.revision,
      generatedAt: new Date(timestamp).toISOString(),
    };
  }

  private cacheKey(
    meta: PublicCatalogMeta,
    resource: PublicCatalogCacheResource,
    identity: string,
  ): PublicCatalogCacheKey {
    return {
      version: 1,
      catalogRevision: meta.revision,
      resource,
      identity,
    };
  }

  private async readCache<Data>(
    key: PublicCatalogCacheKey,
  ): Promise<PublicCatalogDocument<Data> | null> {
    try {
      const entry = await this.cache.read(key);
      if (
        !entry ||
        entry.version !== 1 ||
        entry.catalogRevision !== key.catalogRevision ||
        entry.resource !== key.resource ||
        entry.document.catalogRevision !== key.catalogRevision
      ) {
        return null;
      }
      return entry.document as PublicCatalogDocument<Data>;
    } catch {
      return null;
    }
  }

  private async writeCache<Data>(
    key: PublicCatalogCacheKey,
    document: PublicCatalogDocument<Data>,
  ) {
    const entry: PublicCatalogCacheEntry = {
      version: 1,
      catalogRevision: key.catalogRevision,
      resource: key.resource,
      document: document as PublicCatalogCacheDocument,
    };
    try {
      await this.cache.write(
        key,
        entry,
        CACHE_TTL_SECONDS[key.resource],
      );
    } catch {
      // A public Cache API failure is a miss; authoritative D1 data still wins.
    }
  }

  private async readCachedResource<Data>(
    resource: PublicCatalogCacheResource,
    identity: string,
    context: PublicCatalogReadContext,
    read: () => Promise<Data>,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogReadResult<Data>> {
    const meta = await this.resolveMeta(preloadedMeta);
    const unavailable = assertContentReadable(
      meta,
      context.allowDisabledRead === true,
    );
    if (unavailable) return unavailable;
    const key = this.cacheKey(meta, resource, identity);
    const cached = context.allowSharedCache
      ? await this.readCache<Data>(key)
      : null;
    if (cached) {
      return { status: "ok", document: cached, cacheStatus: "hit" };
    }
    const document = this.createDocument(meta, await read());
    if (context.allowSharedCache) await this.writeCache(key, document);
    return {
      status: "ok",
      document,
      cacheStatus: context.allowSharedCache ? "miss" : "bypass",
    };
  }

  private async readCachedDetail<Data>(
    resource: "song" | "performance",
    identity: string,
    notFoundReason: PublicCatalogNotFoundResult["reason"],
    context: PublicCatalogReadContext,
    read: () => Promise<Data | null>,
    preloadedMeta?: PublicCatalogMeta,
  ): Promise<PublicCatalogDetailResult<Data>> {
    const meta = await this.resolveMeta(preloadedMeta);
    const unavailable = assertContentReadable(
      meta,
      context.allowDisabledRead === true,
    );
    if (unavailable) return unavailable;
    const key = this.cacheKey(meta, resource, identity);
    const cached = context.allowSharedCache
      ? await this.readCache<Data>(key)
      : null;
    if (cached) {
      return { status: "ok", document: cached, cacheStatus: "hit" };
    }
    const data = await read();
    if (data === null) {
      return {
        status: "not_found",
        reason: notFoundReason,
        catalogRevision: meta.revision,
      };
    }
    const document = this.createDocument(meta, data);
    if (context.allowSharedCache) await this.writeCache(key, document);
    return {
      status: "ok",
      document,
      cacheStatus: context.allowSharedCache ? "miss" : "bypass",
    };
  }
}
