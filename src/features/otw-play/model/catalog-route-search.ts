import type { OtwPlayPublicCatalogQuery } from "@contracts/otw-play";

export interface OtwPlayCatalogRouteSearch {
  q?: string;
  member?: string;
  memberMode?: "any" | "all";
  group?: string;
  participant?: string;
  participantRole?: "vocal" | "featured_vocal" | "chorus" | "other";
  relation?: "original" | "cover";
  participation?: "solo" | "duet" | "unit" | "group" | "external_collab";
  originalArtist?: string;
  publishedFrom?: string;
  publishedTo?: string;
  sort?: "recent" | "title" | "participant";
}

const readString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const oneOf = <Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined =>
  typeof value === "string" && allowed.includes(value as Value)
    ? (value as Value)
    : undefined;

export const validateOtwPlayCatalogRouteSearch = (
  search: Record<string, unknown>,
): OtwPlayCatalogRouteSearch => ({
  q: readString(search.q),
  member: readString(search.member),
  memberMode: oneOf(search.memberMode, ["any", "all"]),
  group: readString(search.group),
  participant: readString(search.participant),
  participantRole: oneOf(search.participantRole, [
    "vocal",
    "featured_vocal",
    "chorus",
    "other",
  ]),
  relation: oneOf(search.relation, ["original", "cover"]),
  participation: oneOf(search.participation, [
    "solo",
    "duet",
    "unit",
    "group",
    "external_collab",
  ]),
  originalArtist: readString(search.originalArtist),
  publishedFrom: readString(search.publishedFrom),
  publishedTo: readString(search.publishedTo),
  sort: oneOf(search.sort, ["recent", "title", "participant"]),
});

export const catalogQueryFromRouteSearch = (
  search: OtwPlayCatalogRouteSearch,
): OtwPlayPublicCatalogQuery => ({
  q: search.q,
  member: search.member
    ? [...new Set(
        search.member
          .split(",")
          .map(Number)
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      )].sort((left, right) => left - right)
    : undefined,
  memberMode: search.memberMode,
  group: search.group,
  participant: search.participant,
  participantRole: search.participantRole,
  relation: search.relation,
  participation: search.participation,
  originalArtist: search.originalArtist,
  publishedFrom: search.publishedFrom,
  publishedTo: search.publishedTo,
  sort: search.sort,
});

export const memberSearchValue = (values: readonly number[]) =>
  [...new Set(values)].sort((left, right) => left - right).join(",") || undefined;
