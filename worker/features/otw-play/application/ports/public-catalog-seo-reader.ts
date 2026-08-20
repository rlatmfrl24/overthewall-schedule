export interface PublicCatalogSeoState {
  revision: number;
  readModelRevision: number | null;
  publicReadEnabled: boolean;
  navigationVisible: boolean;
  updatedAt: number;
}

export interface PublicCatalogSongSeoProjection {
  slug: string;
  title: string;
  originalArtistNames: string[];
  mainVocalNames: string[];
  thumbnailUrl: string | null;
}

export interface PublicCatalogSeoReader {
  readSeoState(): Promise<PublicCatalogSeoState>;
  listPublishedSeoSongSlugs(): Promise<string[]>;
  readPublishedSongSeoBySlug(
    slug: string,
  ): Promise<PublicCatalogSongSeoProjection | null>;
}
