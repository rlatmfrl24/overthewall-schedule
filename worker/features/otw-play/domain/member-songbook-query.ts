import { parsePublicCatalogQuery, PublicCatalogQueryError } from "./public-catalog-query";

const allowed = new Set(["q", "category", "participantRole", "sort", "limit", "cursor"]);

export function parseMemberSongbookQuery(entries: Iterable<readonly [string, string]>) {
  const params = new URLSearchParams();
  let category = "all";
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (!allowed.has(key)) throw new PublicCatalogQueryError("unknown_parameter", key);
    if (seen.has(key)) throw new PublicCatalogQueryError("duplicate_parameter", key);
    seen.add(key);
    if (key === "category") {
      if (!["all", "original", "cover", "collaboration"].includes(value)) {
        throw new PublicCatalogQueryError("invalid_query", key);
      }
      category = value;
    } else {
      if (key === "sort" && !["recent", "title"].includes(value)) throw new PublicCatalogQueryError("invalid_sort", key);
      if (key === "participantRole" && !["vocal", "featured_vocal", "chorus"].includes(value)) throw new PublicCatalogQueryError("invalid_participant_role", key);
      params.set(key, value);
    }
  }
  if (category === "original" || category === "cover") params.set("relation", category);
  return { ...parsePublicCatalogQuery(params), collaborationOnly: category === "collaboration" };
}
