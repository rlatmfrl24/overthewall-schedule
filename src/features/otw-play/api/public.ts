import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type {
  OtwPlayPublicCatalogDto,
  OtwPlayPublicCatalogQuery,
  OtwPlayPublicConfigDto,
  OtwPlayPublicEnvelope,
  OtwPlayPublicFacetsDto,
  OtwPlayPublicPerformanceResponseDto,
  OtwPlayPublicSongDetailDto,
} from "@contracts/otw-play";
import { apiFetch } from "@/shared/api/client";

const DEFAULT_CATALOG_LIMIT = 24;
const DEFAULT_CATALOG_SORT = "recent";
const DEFAULT_MEMBER_MODE = "any";
const WHITESPACE_PATTERN = /\s+/gu;
const PUNCTUATION_PATTERN = /\p{P}+/gu;

const normalizeSearchQueryKey = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(WHITESPACE_PATTERN, " ")
    .toLowerCase()
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();

const compareMemberValues = (left: string, right: string) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  return bothNumeric
    ? leftNumber - rightNumber || left.localeCompare(right)
    : left.localeCompare(right);
};

const appendOptional = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined) {
    params.set(key, String(value));
  }
};

export function serializeOtwPlayCatalogQuery(
  query: OtwPlayPublicCatalogQuery,
  options: { includeCursor?: boolean } = {},
) {
  const params = new URLSearchParams();
  appendOptional(params, "q", query.q);

  const members = Array.from(
    new Set((query.member ?? []).map((memberUid) => String(memberUid))),
  ).sort(compareMemberValues);
  for (const memberUid of members) {
    params.append("member", memberUid);
  }

  if (query.memberMode !== undefined && query.memberMode !== DEFAULT_MEMBER_MODE) {
    params.set("memberMode", query.memberMode);
  }
  appendOptional(params, "group", query.group);
  appendOptional(params, "relation", query.relation);
  appendOptional(params, "participation", query.participation);
  appendOptional(params, "originalArtist", query.originalArtist);
  appendOptional(params, "publishedFrom", query.publishedFrom);
  appendOptional(params, "publishedTo", query.publishedTo);
  if (query.sort !== undefined && query.sort !== DEFAULT_CATALOG_SORT) {
    params.set("sort", query.sort);
  }
  if (query.limit !== undefined && query.limit !== DEFAULT_CATALOG_LIMIT) {
    params.set("limit", String(query.limit));
  }
  if (options.includeCursor !== false) {
    appendOptional(params, "cursor", query.cursor);
  }

  params.sort();
  return params.toString();
}

export function getOtwPlayCatalogQueryKey(
  query: OtwPlayPublicCatalogQuery,
) {
  return serializeOtwPlayCatalogQuery(
    {
      ...query,
      q: query.q === undefined ? undefined : normalizeSearchQueryKey(query.q),
    },
    { includeCursor: false },
  );
}

const publicGet = <T>(path: string) =>
  apiFetch<OtwPlayPublicEnvelope<T>>(path, { auth: "omit" });

export function fetchOtwPlayConfig() {
  return publicGet<OtwPlayPublicConfigDto>(apiRoutes.otwPlay.config.build());
}

export function fetchOtwPlayCatalog(query: OtwPlayPublicCatalogQuery = {}) {
  const search = serializeOtwPlayCatalogQuery(query);
  return publicGet<OtwPlayPublicCatalogDto>(
    withRouteSearch(apiRoutes.otwPlay.catalog.build(), search),
  );
}

export function fetchOtwPlayFacets() {
  return publicGet<OtwPlayPublicFacetsDto>(apiRoutes.otwPlay.facets.build());
}

export function fetchOtwPlaySong(slug: string) {
  return publicGet<OtwPlayPublicSongDetailDto>(
    apiRoutes.otwPlay.song.build(slug),
  );
}

export function fetchOtwPlayPerformance(id: string) {
  return publicGet<OtwPlayPublicPerformanceResponseDto>(
    apiRoutes.otwPlay.performance.build(id),
  );
}
