import type { PublicCatalogCursorPosition } from "../../domain/public-catalog-cursor";
import type {
  PublicCatalogParticipationType,
  PublicCatalogQuery,
  PublicCatalogRelation,
} from "../../domain/public-catalog-query";
import type { PublicSourceFallbackReason } from "../../domain/public-source-selection";

export interface PublicCatalogMeta {
  revision: number;
  readModelRevision: number | null;
  publicReadEnabled: boolean;
  navigationVisible: boolean;
  updatedAt: number;
}

export interface PublicCatalogEntity {
  id: string;
  slug: string;
  displayName: string;
  entityKind: "person" | "group" | "organization";
}

export interface PublicCatalogOriginalArtist extends PublicCatalogEntity {
  isPrimary: boolean;
  creditOrder: number;
}

export interface PublicCatalogMemberIdentity {
  uid: number;
  code: string;
  name: string;
  oshiMark: string | null;
  unitName: string | null;
}

export interface PublicCatalogParticipant extends PublicCatalogEntity {
  creditName: string;
  participantRole: "vocal" | "featured_vocal" | "chorus" | "other";
  creditOrder: number;
  kind: "current_member" | "external" | "group";
  member: PublicCatalogMemberIdentity | null;
}

export interface PublicCatalogSource {
  id: string;
  provider: "youtube";
  externalId: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  providerPublishedAt: number | null;
  availabilityStatus:
    | "unknown"
    | "playable"
    | "private"
    | "embed_disabled"
    | "deleted"
    | "region_blocked"
    | "unavailable";
  sourceRole: "official" | "alternate";
  priority: number;
  isPrimary: boolean;
  startSeconds: number;
  endSeconds: number | null;
  channel: {
    id: string;
    displayName: string;
    channelRole:
      | "otw_official"
      | "unit_official"
      | "member_music"
      | "member_main"
      | "project_official";
  };
}

export interface PublicCatalogPerformance {
  id: string;
  relation: PublicCatalogRelation;
  releaseType:
    | "official_mv"
    | "official_video";
  participation: PublicCatalogParticipationType;
  releasedAt: number | null;
  participants: PublicCatalogParticipant[];
  sources: PublicCatalogSource[];
  primarySourceId: string | null;
  playbackSourceId: string | null;
  playable: boolean;
  fallbackReason: PublicSourceFallbackReason;
}

export interface PublicCatalogSongCore {
  id: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  isOtwOriginal: boolean;
  originalReleaseDate: string | null;
  originalReleasePrecision: "year" | "month" | "day" | "unknown";
  originalArtists: PublicCatalogOriginalArtist[];
  tags: string[];
}

export interface PublicCatalogSongSummary extends PublicCatalogSongCore {
  publishedPerformanceCount: number;
  representativePerformance: PublicCatalogPerformance;
}

export interface PublicCatalogSongDetail extends PublicCatalogSongCore {
  performances: PublicCatalogPerformance[];
}

export interface PublicCatalogPerformanceDetail {
  song: PublicCatalogSongCore;
  performance: PublicCatalogPerformance;
}

export interface PublicCatalogFacetMember {
  memberUid: number;
  entityId: string;
  code: string;
  name: string;
  oshiMark: string | null;
  unitName: string | null;
}

export interface PublicCatalogFacetGroup {
  key: string;
  kind: "entity" | "unit";
  displayName: string;
}

export interface PublicCatalogFacets {
  members: PublicCatalogFacetMember[];
  groups: PublicCatalogFacetGroup[];
  originalArtists: PublicCatalogEntity[];
}

export type PublicCatalogReaderQuery = Omit<
  PublicCatalogQuery,
  "cursorToken"
> & {
  cursor: PublicCatalogCursorPosition | null;
};

export interface PublicCatalogReaderPage {
  items: PublicCatalogSongSummary[];
  nextPosition: PublicCatalogCursorPosition | null;
}

export interface PublicCatalogReader {
  readMeta(): Promise<PublicCatalogMeta>;
  readCatalog(query: PublicCatalogReaderQuery): Promise<PublicCatalogReaderPage>;
  readFacets(): Promise<PublicCatalogFacets>;
  readSongBySlug(slug: string): Promise<PublicCatalogSongDetail | null>;
  readPerformanceById(
    performanceId: string,
  ): Promise<PublicCatalogPerformanceDetail | null>;
}
export interface PublicCatalogReadDiagnostics {
  statements: number;
  bindParameters: number;
  rowsRead: number;
  statementRowsRead: readonly number[];
  usesOffset: boolean;
}
