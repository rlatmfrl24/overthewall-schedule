import type { OtwPlayMemberSongbookQuery } from "@contracts/otw-play-members";

export function validateMemberSongbookSearch(search: Record<string, unknown>): OtwPlayMemberSongbookQuery {
  const result: OtwPlayMemberSongbookQuery = {};
  if (typeof search.q === "string" && search.q.trim()) result.q = search.q.trim().slice(0, 80);
  if (search.category === "original" || search.category === "cover" || search.category === "collaboration") result.category = search.category;
  if (search.participantRole === "vocal" || search.participantRole === "featured_vocal" || search.participantRole === "chorus") result.participantRole = search.participantRole;
  if (search.sort === "title") result.sort = "title";
  const limit = Number(search.limit);
  if (Number.isInteger(limit) && limit > 0 && limit <= 60) result.limit = limit;
  if (typeof search.cursor === "string" && search.cursor.length <= 8192) result.cursor = search.cursor;
  return result;
}
