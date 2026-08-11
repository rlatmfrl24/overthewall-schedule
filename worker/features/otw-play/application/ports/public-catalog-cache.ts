import type {
  PublicCatalogFacets,
  PublicCatalogPerformanceDetail,
  PublicCatalogSongDetail,
  PublicCatalogSongSummary,
} from "./public-catalog-reader";

export type PublicCatalogCacheResource =
  | "config"
  | "catalog"
  | "facets"
  | "song"
  | "performance";

export interface PublicCatalogDocument<Data> {
  data: Data;
  nextCursor: string | null;
  catalogRevision: number;
  generatedAt: string;
}

export type PublicCatalogCacheDocument =
  | PublicCatalogDocument<{
      publicReadEnabled: boolean;
      navigationVisible: boolean;
      updatedAt: number;
    }>
  | PublicCatalogDocument<{ items: PublicCatalogSongSummary[] }>
  | PublicCatalogDocument<PublicCatalogFacets>
  | PublicCatalogDocument<PublicCatalogSongDetail>
  | PublicCatalogDocument<PublicCatalogPerformanceDetail>;

export interface PublicCatalogCacheKey {
  version: 1;
  catalogRevision: number;
  resource: PublicCatalogCacheResource;
  identity: string;
}

export interface PublicCatalogCacheEntry {
  version: 1;
  catalogRevision: number;
  resource: PublicCatalogCacheResource;
  document: PublicCatalogCacheDocument;
}

export interface PublicCatalogCache {
  read(key: PublicCatalogCacheKey): Promise<PublicCatalogCacheEntry | null>;
  write(
    key: PublicCatalogCacheKey,
    entry: PublicCatalogCacheEntry,
    ttlSeconds: number,
  ): Promise<void>;
}
