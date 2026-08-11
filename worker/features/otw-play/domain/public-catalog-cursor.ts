import type { PublicCatalogSort } from "./public-catalog-query";
import {
  decodeUtf8Base64Url,
  encodeUtf8Base64Url,
} from "./utf8-base64url";

const CURSOR_PREFIX = "c1_";
const MAX_CURSOR_TOKEN_LENGTH = 8_192;
const MAX_QUERY_KEY_LENGTH = 2_048;
const MAX_POSITION_TEXT_LENGTH = 500;
const MAX_SONG_ID_LENGTH = 128;

export type PublicCatalogSearchPhase = "indexed" | "contains" | null;

export const PUBLIC_CATALOG_SEARCH_RANKS = {
  titleExact: 0,
  titleAliasExact: 1,
  titlePrefix: 2,
  originalArtistExact: 3,
  originalArtistPrefix: 4,
  participantExact: 5,
  participantPrefix: 6,
  contains: 7,
} as const;

interface PublicCatalogCursorPositionBase {
  searchPhase: PublicCatalogSearchPhase;
  relevanceRank: number | null;
  songId: string;
}

export interface PublicCatalogRecentCursorPosition
  extends PublicCatalogCursorPositionBase {
  sort: "recent";
  releasedAt: number | null;
}

export interface PublicCatalogTitleCursorPosition
  extends PublicCatalogCursorPositionBase {
  sort: "title";
  normalizedTitle: string;
}

export interface PublicCatalogParticipantCursorPosition
  extends PublicCatalogCursorPositionBase {
  sort: "participant";
  normalizedParticipant: string | null;
}

export type PublicCatalogCursorPosition =
  | PublicCatalogRecentCursorPosition
  | PublicCatalogTitleCursorPosition
  | PublicCatalogParticipantCursorPosition;

export interface PublicCatalogCursorIdentity {
  catalogRevision: number;
  queryKey: string;
  hasSearch: boolean;
}

export type PublicCatalogCursorErrorReason =
  | "malformed"
  | "unsupported_version"
  | "revision_mismatch"
  | "query_mismatch"
  | "sort_mismatch"
  | "search_state_mismatch"
  | "invalid_position";

export class PublicCatalogCursorError extends Error {
  readonly reason: PublicCatalogCursorErrorReason;

  constructor(reason: PublicCatalogCursorErrorReason) {
    super(`Invalid public catalog cursor: ${reason}`);
    this.name = "PublicCatalogCursorError";
    this.reason = reason;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isValidSearchState = (phase: unknown, rank: unknown) =>
  (phase === null && rank === null) ||
  (phase === "indexed" &&
    typeof rank === "number" &&
    Number.isSafeInteger(rank) &&
    rank >= PUBLIC_CATALOG_SEARCH_RANKS.titleExact &&
    rank <= PUBLIC_CATALOG_SEARCH_RANKS.participantPrefix) ||
  (phase === "contains" && rank === PUBLIC_CATALOG_SEARCH_RANKS.contains);

const isValidSongId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_SONG_ID_LENGTH &&
  value === value.trim();

const isValidRequiredPositionText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_POSITION_TEXT_LENGTH &&
  value === value.trim();

const isValidNullablePositionText = (
  value: unknown,
): value is string | null =>
  value === null || isValidRequiredPositionText(value);

const validatePosition = (
  sort: PublicCatalogSort,
  phase: unknown,
  rank: unknown,
  key: unknown,
  songId: unknown,
): PublicCatalogCursorPosition => {
  if (!isValidSearchState(phase, rank) || !isValidSongId(songId)) {
    throw new PublicCatalogCursorError("invalid_position");
  }
  const searchPhase = phase as PublicCatalogSearchPhase;
  const relevanceRank = rank as number | null;

  if (sort === "recent") {
    if (
      key !== null &&
      (typeof key !== "number" || !Number.isSafeInteger(key) || key < 0)
    ) {
      throw new PublicCatalogCursorError("invalid_position");
    }
    return {
      sort,
      searchPhase,
      relevanceRank,
      releasedAt: key as number | null,
      songId,
    };
  }
  if (sort === "title") {
    if (!isValidRequiredPositionText(key)) {
      throw new PublicCatalogCursorError("invalid_position");
    }
    return {
      sort,
      searchPhase,
      relevanceRank,
      normalizedTitle: key,
      songId,
    };
  }
  if (!isValidNullablePositionText(key)) {
    throw new PublicCatalogCursorError("invalid_position");
  }
  return {
    sort,
    searchPhase,
    relevanceRank,
    normalizedParticipant: key,
    songId,
  };
};

const positionKey = (position: PublicCatalogCursorPosition) => {
  switch (position.sort) {
    case "recent":
      return position.releasedAt;
    case "title":
      return position.normalizedTitle;
    case "participant":
      return position.normalizedParticipant;
  }
};

const validateSearchPresence = (
  hasSearch: boolean,
  position: PublicCatalogCursorPosition,
) => {
  if (
    (hasSearch && position.searchPhase === null) ||
    (!hasSearch && position.searchPhase !== null)
  ) {
    throw new PublicCatalogCursorError("search_state_mismatch");
  }
};

export const encodePublicCatalogCursor = (
  identity: PublicCatalogCursorIdentity,
  position: PublicCatalogCursorPosition,
) => {
  if (
    !isValidRevision(identity.catalogRevision) ||
    identity.queryKey.length > MAX_QUERY_KEY_LENGTH
  ) {
    throw new PublicCatalogCursorError("malformed");
  }
  const validated = validatePosition(
    position.sort,
    position.searchPhase,
    position.relevanceRank,
    positionKey(position),
    position.songId,
  );
  validateSearchPresence(identity.hasSearch, validated);

  const token = `${CURSOR_PREFIX}${encodeUtf8Base64Url(
    JSON.stringify({
      v: 1,
      r: identity.catalogRevision,
      q: identity.queryKey,
      s: validated.sort,
      p: validated.searchPhase,
      a: validated.relevanceRank,
      k: positionKey(validated),
      i: validated.songId,
    }),
  )}`;
  if (token.length > MAX_CURSOR_TOKEN_LENGTH) {
    throw new PublicCatalogCursorError("malformed");
  }
  return token;
};

export const decodePublicCatalogCursor = (
  token: string,
  expected: PublicCatalogCursorIdentity & { sort: PublicCatalogSort },
): PublicCatalogCursorPosition => {
  if (token.length > MAX_CURSOR_TOKEN_LENGTH) {
    throw new PublicCatalogCursorError("malformed");
  }
  const versionMatch = token.match(/^c(\d+)_/);
  if (!versionMatch) {
    throw new PublicCatalogCursorError("malformed");
  }
  if (versionMatch[1] !== "1") {
    throw new PublicCatalogCursorError("unsupported_version");
  }

  try {
    const value = JSON.parse(
      decodeUtf8Base64Url(token.slice(CURSOR_PREFIX.length)),
    ) as unknown;
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(",") !== "a,i,k,p,q,r,s,v" ||
      value.v !== 1 ||
      !isValidRevision(value.r) ||
      typeof value.q !== "string" ||
      value.q.length > MAX_QUERY_KEY_LENGTH ||
      !["recent", "title", "participant"].includes(String(value.s))
    ) {
      throw new PublicCatalogCursorError("malformed");
    }

    if (value.r !== expected.catalogRevision) {
      throw new PublicCatalogCursorError("revision_mismatch");
    }
    if (value.q !== expected.queryKey) {
      throw new PublicCatalogCursorError("query_mismatch");
    }
    if (value.s !== expected.sort) {
      throw new PublicCatalogCursorError("sort_mismatch");
    }

    const position = validatePosition(
      value.s as PublicCatalogSort,
      value.p,
      value.a,
      value.k,
      value.i,
    );
    validateSearchPresence(expected.hasSearch, position);
    if (encodePublicCatalogCursor(expected, position) !== token) {
      throw new PublicCatalogCursorError("malformed");
    }
    return position;
  } catch (error) {
    if (error instanceof PublicCatalogCursorError) throw error;
    throw new PublicCatalogCursorError("malformed");
  }
};
