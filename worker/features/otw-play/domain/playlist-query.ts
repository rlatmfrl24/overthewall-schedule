import { normalizeOtwPlaySearchText } from "./search-normalization";
import { PlaylistError } from "./playlist-error";

export interface PlaylistPerformanceQuery {
  q: string | null;
  member: number | null;
  relation: "original" | "cover" | null;
  limit: number;
  after: { releasedAt: number | null; id: string } | null;
}

export function parsePlaylistQuery(params: URLSearchParams, revision: number): PlaylistPerformanceQuery {
  const allowed = new Set(["q", "member", "relation", "cursor", "limit"]);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new PlaylistError(400, "PLAY_INVALID_QUERY");
  const q = params.get("q")?.trim() || null;
  const member = params.has("member") ? Number(params.get("member")) : null;
  const relation = params.get("relation");
  const limit = params.has("limit") ? Number(params.get("limit")) : 60;
  if ((q && q.length > 80) || (member !== null && (!Number.isSafeInteger(member) || member < 1)) ||
    (relation !== null && relation !== "original" && relation !== "cover") || !Number.isInteger(limit) || limit < 1 || limit > 60) throw new PlaylistError(400, "PLAY_INVALID_QUERY");
  const normalized = q ? normalizeOtwPlaySearchText(q) : null;
  const identity = JSON.stringify([normalized, member, relation]);
  let after: PlaylistPerformanceQuery["after"] = null;
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 4096) throw new Error();
      const decoded = JSON.parse(decodeURIComponent(cursor));
      if (decoded.identity !== identity || typeof decoded.id !== "string" || !decoded.id ||
        !(decoded.releasedAt === null || Number.isSafeInteger(decoded.releasedAt))) throw new Error();
      if (decoded.revision !== revision) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
      after = { id: decoded.id, releasedAt: decoded.releasedAt };
    } catch (error) {
      if (error instanceof PlaylistError) throw error;
      throw new PlaylistError(400, "PLAY_INVALID_CURSOR");
    }
  }
  return { q: normalized, member, relation, limit, after };
}

export function playlistCursor(query: PlaylistPerformanceQuery, revision: number, last: { id: string; releasedAt: number | null }) {
  return encodeURIComponent(JSON.stringify({ revision, identity: JSON.stringify([query.q, query.member, query.relation]), ...last }));
}
