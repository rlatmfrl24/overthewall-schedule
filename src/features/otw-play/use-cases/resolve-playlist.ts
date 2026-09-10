import type { PlayPerformanceQuery } from "@contracts/otw-play-playlists";
import type { OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";
import { fetchPlaylistPerformances, resolvePlaylistPerformances, type PlaylistRequestOptions } from "../api/playlists";

export async function collectPlaylist(query: PlayPerformanceQuery | string[], request: PlaylistRequestOptions,
  progress?: (count: number) => void) {
  const items: OtwPlayPublicPerformanceResponseDto[] = [];
  const unavailableIds: string[] = [];
  let revision: number | undefined;
  let cursor: string | undefined;
  const cursors = new Set<string>();
  let offset = 0;
  do {
    request.signal?.throwIfAborted();
    const response = Array.isArray(query)
      ? await resolvePlaylistPerformances(query.slice(offset, offset + 60), request)
      : await fetchPlaylistPerformances({ ...query, limit: 60, cursor }, request);
    request.signal?.throwIfAborted();
    if (revision !== undefined && revision !== response.catalogRevision) throw new Error("목록이 변경되었습니다. 다시 시도해 주세요.");
    revision = response.catalogRevision;
    items.push(...response.data.items);
    if ("unavailableIds" in response.data && Array.isArray(response.data.unavailableIds)) unavailableIds.push(...response.data.unavailableIds as string[]);
    offset += 60;
    cursor = response.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error("목록의 다음 페이지를 확인하지 못했습니다.");
    if (cursor) cursors.add(cursor);
    progress?.(items.length + unavailableIds.length);
  } while (Array.isArray(query) ? offset < query.length : cursor);
  if (Array.isArray(query)) {
    const order = new Map(query.map((id, index) => [id, index]));
    items.sort((a, b) => order.get(a.performance.id)! - order.get(b.performance.id)!);
  }
  return { items, unavailableIds };
}
