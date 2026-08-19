import { normalizeOtwPlaySearchText } from "./search-normalization";
import {
  decodePublicCatalogGroupKey,
  encodePublicCatalogGroupKey,
  PublicCatalogGroupKeyError,
  type PublicCatalogGroupSelector,
} from "./public-group-key";

export const PUBLIC_CATALOG_DEFAULT_LIMIT = 24;
export const PUBLIC_CATALOG_MAX_LIMIT = 60;
export const PUBLIC_CATALOG_MAX_MEMBERS = 10;
export const PUBLIC_CATALOG_MAX_QUERY_LENGTH = 80;

export const PUBLIC_CATALOG_SORTS = [
  "recent",
  "title",
  "participant",
] as const;
export type PublicCatalogSort = (typeof PUBLIC_CATALOG_SORTS)[number];

export const PUBLIC_CATALOG_MEMBER_MODES = ["any", "all"] as const;
export type PublicCatalogMemberMode =
  (typeof PUBLIC_CATALOG_MEMBER_MODES)[number];

export const PUBLIC_CATALOG_RELATIONS = ["original", "cover"] as const;
export type PublicCatalogRelation =
  (typeof PUBLIC_CATALOG_RELATIONS)[number];

export const PUBLIC_CATALOG_PARTICIPATION_TYPES = [
  "solo",
  "duet",
  "unit",
  "group",
  "external_collab",
] as const;
export type PublicCatalogParticipationType =
  (typeof PUBLIC_CATALOG_PARTICIPATION_TYPES)[number];

export const PUBLIC_CATALOG_PARTICIPANT_ROLES = [
  "vocal",
  "featured_vocal",
  "chorus",
  "other",
] as const;
export type PublicCatalogParticipantRole =
  (typeof PUBLIC_CATALOG_PARTICIPANT_ROLES)[number];

const ALLOWED_PARAMETERS = new Set([
  "q",
  "member",
  "memberMode",
  "group",
  "participant",
  "participantRole",
  "relation",
  "participation",
  "originalArtist",
  "publishedFrom",
  "publishedTo",
  "sort",
  "cursor",
  "limit",
]);
const SINGLETON_PARAMETERS = new Set(
  [...ALLOWED_PARAMETERS].filter((name) => name !== "member"),
);
const MAX_PUBLIC_SLUG_LENGTH = 128;
const MAX_CURSOR_LENGTH = 8_192;
const UNSAFE_PUBLIC_SLUG_CHARACTER = /[\p{Cc}\p{Cs}\\/?#%]/u;

export const isValidPublicCatalogSlug = (value: string) => {
  const length = Array.from(value).length;
  return (
    length > 0 &&
    length <= MAX_PUBLIC_SLUG_LENGTH &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !UNSAFE_PUBLIC_SLUG_CHARACTER.test(value)
  );
};

export type PublicCatalogQueryErrorReason =
  | "unknown_parameter"
  | "duplicate_parameter"
  | "invalid_query"
  | "too_many_members"
  | "invalid_member"
  | "member_mode_without_members"
  | "invalid_group"
  | "invalid_participant"
  | "invalid_participant_role"
  | "invalid_relation"
  | "invalid_participation"
  | "invalid_original_artist"
  | "invalid_date"
  | "invalid_date_range"
  | "invalid_sort"
  | "invalid_cursor"
  | "invalid_limit";

export class PublicCatalogQueryError extends Error {
  readonly reason: PublicCatalogQueryErrorReason;
  readonly field: string;

  constructor(reason: PublicCatalogQueryErrorReason, field: string) {
    super(`Invalid public catalog query field ${field}: ${reason}`);
    this.name = "PublicCatalogQueryError";
    this.reason = reason;
    this.field = field;
  }
}

export interface PublicCatalogQuery {
  normalizedQuery: string | null;
  memberUids: readonly number[];
  memberMode: PublicCatalogMemberMode;
  groupKey: string | null;
  group: PublicCatalogGroupSelector | null;
  participantSlug: string | null;
  participantRole: PublicCatalogParticipantRole | null;
  relation: PublicCatalogRelation | null;
  participation: PublicCatalogParticipationType | null;
  originalArtistSlug: string | null;
  publishedFrom: string | null;
  publishedTo: string | null;
  sort: PublicCatalogSort;
  cursorToken: string | null;
  limit: number;
}

const isOneOf = <Value extends string>(
  values: readonly Value[],
  value: string,
): value is Value => values.includes(value as Value);

const parsePositiveSafeInteger = (value: string) => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const isIsoDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
};

const readSingleton = (
  values: ReadonlyMap<string, readonly string[]>,
  field: string,
) => values.get(field)?.[0] ?? null;

const appendCanonical = (
  output: string[],
  name: string,
  value: string | number,
) => output.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);

export const parsePublicCatalogQuery = (
  entries: Iterable<readonly [string, string]>,
): PublicCatalogQuery => {
  const values = new Map<string, string[]>();
  for (const [name, value] of entries) {
    if (!ALLOWED_PARAMETERS.has(name)) {
      throw new PublicCatalogQueryError("unknown_parameter", name);
    }
    const existing = values.get(name) ?? [];
    existing.push(value);
    values.set(name, existing);
    if (SINGLETON_PARAMETERS.has(name) && existing.length > 1) {
      throw new PublicCatalogQueryError("duplicate_parameter", name);
    }
  }

  const rawQuery = readSingleton(values, "q");
  let normalizedQuery: string | null = null;
  if (rawQuery !== null) {
    if (Array.from(rawQuery).length > PUBLIC_CATALOG_MAX_QUERY_LENGTH) {
      throw new PublicCatalogQueryError("invalid_query", "q");
    }
    normalizedQuery = normalizeOtwPlaySearchText(rawQuery);
    if (normalizedQuery.length === 0) {
      throw new PublicCatalogQueryError("invalid_query", "q");
    }
  }

  const rawMembers = values.get("member") ?? [];
  if (rawMembers.length > PUBLIC_CATALOG_MAX_MEMBERS) {
    throw new PublicCatalogQueryError("too_many_members", "member");
  }
  const parsedMembers = rawMembers.map(parsePositiveSafeInteger);
  if (parsedMembers.some((member) => member === null)) {
    throw new PublicCatalogQueryError("invalid_member", "member");
  }
  const memberUids = [
    ...new Set(parsedMembers as number[]),
  ].sort((left, right) => left - right);

  const rawMemberMode = readSingleton(values, "memberMode");
  if (rawMemberMode !== null && memberUids.length === 0) {
    throw new PublicCatalogQueryError(
      "member_mode_without_members",
      "memberMode",
    );
  }
  if (
    rawMemberMode !== null &&
    !isOneOf(PUBLIC_CATALOG_MEMBER_MODES, rawMemberMode)
  ) {
    throw new PublicCatalogQueryError("invalid_member", "memberMode");
  }
  const memberMode = rawMemberMode ?? "any";

  const rawGroup = readSingleton(values, "group");
  let groupKey: string | null = null;
  let group: PublicCatalogGroupSelector | null = null;
  if (rawGroup !== null) {
    try {
      group = decodePublicCatalogGroupKey(rawGroup);
      groupKey = encodePublicCatalogGroupKey(group);
    } catch (error) {
      if (error instanceof PublicCatalogGroupKeyError) {
        throw new PublicCatalogQueryError("invalid_group", "group");
      }
      throw error;
    }
  }

  const rawRelation = readSingleton(values, "relation");

  const rawParticipant = readSingleton(values, "participant");
  if (
    rawParticipant !== null &&
    !isValidPublicCatalogSlug(rawParticipant)
  ) {
    throw new PublicCatalogQueryError(
      "invalid_participant",
      "participant",
    );
  }

  const rawParticipantRole = readSingleton(values, "participantRole");
  if (
    rawParticipantRole !== null &&
    !isOneOf(PUBLIC_CATALOG_PARTICIPANT_ROLES, rawParticipantRole)
  ) {
    throw new PublicCatalogQueryError(
      "invalid_participant_role",
      "participantRole",
    );
  }

  if (
    rawRelation !== null &&
    !isOneOf(PUBLIC_CATALOG_RELATIONS, rawRelation)
  ) {
    throw new PublicCatalogQueryError("invalid_relation", "relation");
  }

  const rawParticipation = readSingleton(values, "participation");
  if (
    rawParticipation !== null &&
    !isOneOf(PUBLIC_CATALOG_PARTICIPATION_TYPES, rawParticipation)
  ) {
    throw new PublicCatalogQueryError(
      "invalid_participation",
      "participation",
    );
  }

  const rawOriginalArtist = readSingleton(values, "originalArtist");
  if (
    rawOriginalArtist !== null &&
    !isValidPublicCatalogSlug(rawOriginalArtist)
  ) {
    throw new PublicCatalogQueryError(
      "invalid_original_artist",
      "originalArtist",
    );
  }

  const publishedFrom = readSingleton(values, "publishedFrom");
  const publishedTo = readSingleton(values, "publishedTo");
  if (publishedFrom !== null && !isIsoDay(publishedFrom)) {
    throw new PublicCatalogQueryError("invalid_date", "publishedFrom");
  }
  if (publishedTo !== null && !isIsoDay(publishedTo)) {
    throw new PublicCatalogQueryError("invalid_date", "publishedTo");
  }
  if (
    publishedFrom !== null &&
    publishedTo !== null &&
    publishedFrom > publishedTo
  ) {
    throw new PublicCatalogQueryError("invalid_date_range", "publishedTo");
  }

  const rawSort = readSingleton(values, "sort");
  if (rawSort !== null && !isOneOf(PUBLIC_CATALOG_SORTS, rawSort)) {
    throw new PublicCatalogQueryError("invalid_sort", "sort");
  }

  const cursorToken = readSingleton(values, "cursor");
  if (
    cursorToken !== null &&
    (cursorToken.length === 0 || cursorToken.length > MAX_CURSOR_LENGTH)
  ) {
    throw new PublicCatalogQueryError("invalid_cursor", "cursor");
  }

  const rawLimit = readSingleton(values, "limit");
  const limit =
    rawLimit === null ? PUBLIC_CATALOG_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > PUBLIC_CATALOG_MAX_LIMIT ||
    (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))
  ) {
    throw new PublicCatalogQueryError("invalid_limit", "limit");
  }

  return {
    normalizedQuery,
    memberUids,
    memberMode,
    groupKey,
    group,
    participantSlug: rawParticipant,
    participantRole: rawParticipantRole,
    relation: rawRelation,
    participation: rawParticipation,
    originalArtistSlug: rawOriginalArtist,
    publishedFrom,
    publishedTo,
    sort: rawSort ?? "recent",
    cursorToken,
    limit,
  };
};

export const canonicalizePublicCatalogQuery = (
  query: PublicCatalogQuery,
  options: { includeCursor?: boolean } = {},
) => {
  const output: string[] = [];
  if (query.normalizedQuery !== null) {
    appendCanonical(output, "q", query.normalizedQuery);
  }
  for (const memberUid of query.memberUids) {
    appendCanonical(output, "member", memberUid);
  }
  if (query.memberUids.length > 0 && query.memberMode === "all") {
    appendCanonical(output, "memberMode", "all");
  }
  if (query.groupKey !== null) appendCanonical(output, "group", query.groupKey);
  if (query.participantSlug !== null) {
    appendCanonical(output, "participant", query.participantSlug);
  }
  if (query.participantRole !== null) {
    appendCanonical(output, "participantRole", query.participantRole);
  }
  if (query.relation !== null) {
    appendCanonical(output, "relation", query.relation);
  }
  if (query.participation !== null) {
    appendCanonical(output, "participation", query.participation);
  }
  if (query.originalArtistSlug !== null) {
    appendCanonical(output, "originalArtist", query.originalArtistSlug);
  }
  if (query.publishedFrom !== null) {
    appendCanonical(output, "publishedFrom", query.publishedFrom);
  }
  if (query.publishedTo !== null) {
    appendCanonical(output, "publishedTo", query.publishedTo);
  }
  if (query.sort !== "recent") appendCanonical(output, "sort", query.sort);
  if (query.limit !== PUBLIC_CATALOG_DEFAULT_LIMIT) {
    appendCanonical(output, "limit", query.limit);
  }
  if (options.includeCursor && query.cursorToken !== null) {
    appendCanonical(output, "cursor", query.cursorToken);
  }
  return output.join("&");
};

export const isStructuredFirstPagePublicCatalogCacheQuery = (
  query: PublicCatalogQuery,
) =>
  query.normalizedQuery === null &&
  query.cursorToken === null;
