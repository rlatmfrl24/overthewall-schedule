import { PLAY_PLAYLIST_MAX_ITEMS, type PlayDefaultPlaylistWrite, type PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import { OTW_PLAY_ADMIN_PREVIEW_HEADER } from "@contracts/otw-play";
import { authenticateRequest, requireAdminUser } from "../../../platform/auth";
import { getActorInfo } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { PlaylistService } from "../application/playlist-service";
import { PlaylistError } from "../application/ports/playlist-repository";
import { toPerformanceResponse } from "./public-catalog-handler";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization, Cookie" } });
const invalid = () => { throw new PlaylistError(400, "PLAY_PLAYLIST_INVALID_INPUT"); };
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function ids(value: unknown, limit = PLAY_PLAYLIST_MAX_ITEMS): string[] {
  if (!Array.isArray(value)) return invalid();
  if (value.length > limit) throw new PlaylistError(400, "PLAY_PLAYLIST_ITEM_LIMIT");
  if (!value.every(identifier) || new Set(value).size !== value.length) return invalid();
  return value;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
export function parseDefaultPlaylistWrite(value: Record<string, unknown>): PlayDefaultPlaylistWrite {
  if ((value.title !== null && (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 120)) ||
    (value.description !== null && (typeof value.description !== "string" || value.description.length > 2000)) ||
    (value.representativePerformanceId !== null && !identifier(value.representativePerformanceId))) return invalid();
  return { title: typeof value.title === "string" ? value.title.trim() : null,
    description: typeof value.description === "string" ? value.description.trim() : null,
    representativePerformanceId: value.representativePerformanceId as string | null };
}
export function parsePlaylistWrite(value: Record<string, unknown>): PlayPlaylistWrite {
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 120 ||
    typeof value.description !== "string" || value.description.length > 2000 ||
    (value.originDefaultId !== null && !identifier(value.originDefaultId))) return invalid();
  if (value.representativePerformanceId !== undefined && value.representativePerformanceId !== null && !identifier(value.representativePerformanceId)) return invalid();
  return { ...(value.representativePerformanceId !== undefined ? { representativePerformanceId: value.representativePerformanceId as string | null } : {}), title: value.title.trim(), description: value.description.trim(), performanceIds: ids(value.performanceIds), originDefaultId: value.originDefaultId };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("Content-Length")) > 1_000_000) throw new PlaylistError(413, "PLAY_PLAYLIST_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 1_000_000) throw new PlaylistError(413, "PLAY_PLAYLIST_TOO_LARGE");
  try { const value: unknown = JSON.parse(raw); if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; } catch { /* Invalid JSON is a client error. */ }
  return invalid();
}

export const createPlaylistHandler = (resolve: (env: Env) => PlaylistService) => async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/play/admin/playlists/defaults")) {
      const admin = await requireAdminUser(request, env);
      if (!admin.ok) return json({ error: { code: "PLAY_ADMIN_AUTH_REQUIRED" } }, admin.response.status);
      const match = url.pathname.match(/^\/api\/play\/admin\/playlists\/defaults(?:\/([a-zA-Z0-9_-]+))?$/);
      if (!match || url.searchParams.size) return invalid();
      const service = resolve(env), id = match[1];
      if (request.method === "GET") {
        const rows = await service.adminDefaults(id);
        return json({ data: id ? rows[0] : rows });
      }
      if (request.method !== "PUT" || !id) return json({ error: { code: "PLAY_METHOD_NOT_ALLOWED" } }, 405);
      const input = await body(request), actor = getActorInfo(request, admin.user);
      return json({ data: await service.saveDefault(id, parseDefaultPlaylistWrite(input), version(input.expectedVersion),
        { userId: admin.user.id, displayName: actor.actorName, ipAddress: actor.actorIp }) });
    }
    const preview = request.headers.get(OTW_PLAY_ADMIN_PREVIEW_HEADER) === "1";
    if (preview) { const admin = await requireAdminUser(request, env); if (!admin.ok) return json({ error: { code: "PLAY_AUTH_REQUIRED", message: "관리자 미리보기 권한이 필요합니다." } }, admin.response.status); }
    const context = { allowDisabledRead: preview, allowSharedCache: false };
    const service = resolve(env);
    if (url.pathname === "/api/play/playlists/defaults") {
      if (url.searchParams.size) return invalid();
      return json(await service.defaults(context));
    }
    if (url.pathname === "/api/play/performances") {
      const result = await service.browse(context, url.searchParams);
      return json({ ...result, data: { items: result.data.items.map(toPerformanceResponse) } });
    }
    if (url.pathname === "/api/play/performances/resolve") {
      const input = await body(request), requested = ids(input.performanceIds, 60);
      if (requested.length > 60 || url.searchParams.size) return invalid();
      const result = await service.resolve(context, requested);
      return json({ ...result, data: { ...result.data, items: result.data.items.map(toPerformanceResponse) } });
    }
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) return json({ error: { code: "PLAY_AUTH_REQUIRED", message: "로그인이 필요합니다." } }, auth.response.status);
    if (url.searchParams.size) return invalid();
    const owner = auth.user.id;
    if (url.pathname === "/api/play/me/playlists") {
      if (request.method === "GET") return json({ data: await service.list(context, owner) });
      const input = await body(request);
      if (!identifier(input.requestId)) return invalid();
      return json({ data: await service.write(context, owner, parsePlaylistWrite(input), { requestId: input.requestId }) }, 201);
    }
    const match = url.pathname.match(/^\/api\/play\/me\/playlists\/([a-zA-Z0-9_-]+)$/);
    if (!match) throw new PlaylistError(404, "PLAY_PLAYLIST_NOT_FOUND");
    const id = match[1];
    if (request.method === "GET") return json({ data: await service.read(context, owner, id) });
    const input = await body(request), expectedVersion = version(input.expectedVersion);
    if (request.method === "DELETE") {
      await service.delete(context, owner, id, expectedVersion);
      return json({ data: { deleted: true } });
    }
    return json({ data: await service.write(context, owner, parsePlaylistWrite(input), { id, expectedVersion }) });
  } catch (error) {
    if (error instanceof PlaylistError) return json({ error: { code: error.code, message: error.code } }, error.status);
    console.error("[otw-play] playlist request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: { code: "PLAY_PLAYLIST_UNAVAILABLE", message: "플레이리스트를 불러오지 못했습니다." } }, 503);
  }
};
