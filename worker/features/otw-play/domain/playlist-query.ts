import { normalizeOtwPlaySearchText } from "./search-normalization";
import { PlaylistError } from "./playlist-error";

export interface PlaylistPerformanceQuery {
  scope?: "official" | "broadcast";
  songSlug?: string | null;
  broadcastFrom?: string | null;
  broadcastTo?: string | null;
  dateUnknown?: boolean;
  q: string | null;
  member: number | null;
  relation: "original" | "cover" | null;
  limit: number;
  after: { releasedAt: number | null; id: string } | null;
}

export function parsePlaylistQuery(params: URLSearchParams, revision: number): PlaylistPerformanceQuery {
  const allowed = new Set(["q", "member", "relation", "cursor", "limit", "scope", "songSlug", "broadcastFrom", "broadcastTo", "dateUnknown"]);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new PlaylistError(400, "PLAY_INVALID_QUERY");
  const scope = params.get("scope") ?? "official";
  const songSlug = params.get("songSlug"), broadcastFrom = params.get("broadcastFrom"), broadcastTo = params.get("broadcastTo");
  const dateUnknown = params.get("dateUnknown") === "1";
  const validDate = (date: string | null) => date === null || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date);
  if ((scope !== "official" && scope !== "broadcast") || (songSlug !== null && (!songSlug || songSlug.length > 128)) ||
    !validDate(broadcastFrom) || !validDate(broadcastTo) || (broadcastFrom && broadcastTo && broadcastFrom > broadcastTo) ||
    (params.has("dateUnknown") && params.get("dateUnknown") !== "1") || (dateUnknown && (broadcastFrom || broadcastTo)) ||
    (scope !== "broadcast" && (broadcastFrom || broadcastTo || dateUnknown))) throw new PlaylistError(400, "PLAY_INVALID_QUERY");
  const q = params.get("q")?.trim() || null;
  const member = params.has("member") ? Number(params.get("member")) : null;
  const relation = params.get("relation");
  const limit = params.has("limit") ? Number(params.get("limit")) : 60;
  if ((q && q.length > 80) || (member !== null && (!Number.isSafeInteger(member) || member < 1)) ||
    (relation !== null && relation !== "original" && relation !== "cover") || !Number.isInteger(limit) || limit < 1 || limit > 60) throw new PlaylistError(400, "PLAY_INVALID_QUERY");
  const normalized = q ? normalizeOtwPlaySearchText(q) : null;
  const filters = { scope: scope as "official" | "broadcast", songSlug, broadcastFrom, broadcastTo, dateUnknown };
  const identity = queryIdentity({ q: normalized, member, relation, ...filters });
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
  return { q: normalized, member, relation, limit, after, ...filters };
}

export function playlistCursor(query: PlaylistPerformanceQuery, revision: number, last: { id: string; releasedAt: number | null }) {
  return encodeURIComponent(JSON.stringify({ revision, identity: queryIdentity(query), id: last.id, releasedAt: last.releasedAt }));
}

function queryIdentity(query: Pick<PlaylistPerformanceQuery, "q" | "member" | "relation" | "scope" | "songSlug" | "broadcastFrom" | "broadcastTo" | "dateUnknown">) {
  const base = [query.q, query.member, query.relation];
  return JSON.stringify(query.scope === "broadcast" || query.songSlug
    ? [...base, query.scope ?? "official", query.songSlug ?? null, query.broadcastFrom ?? null, query.broadcastTo ?? null, query.dateUnknown ?? false] : base);
}
