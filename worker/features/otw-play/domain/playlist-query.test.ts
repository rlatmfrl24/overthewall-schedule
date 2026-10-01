import { describe, expect, it } from "vitest";
import { parsePlaylistQuery, playlistCursor } from "./playlist-query";
describe("performance cursors", () => {
  it("keeps performance identity and nullable date and binds the cursor to its filter/revision", () => {
    const query = parsePlaylistQuery(new URLSearchParams("member=1&relation=cover"), 4);
    const cursor = playlistCursor(query, 4, { id: "performance-two", releasedAt: null });
    expect(parsePlaylistQuery(new URLSearchParams({ member: "1", relation: "cover", cursor }), 4).after).toEqual({ id: "performance-two", releasedAt: null });
    expect(() => parsePlaylistQuery(new URLSearchParams({ member: "2", relation: "cover", cursor }), 4)).toThrow();
    expect(() => parsePlaylistQuery(new URLSearchParams({ member: "1", relation: "cover", cursor }), 5)).toThrow("PLAY_CURSOR_STALE");
  });
  it.each(["limit=61", "member=-1", "relation=chorus", "q=a&q=b", "sort=random", "cursor=bad"])("rejects %s", query => {
    expect(() => parsePlaylistQuery(new URLSearchParams(query), 1)).toThrow();
  });
  it("uses the broadcast date for clip cursors and rejects old publication-order cursors as stale", () => {
    const query = parsePlaylistQuery(new URLSearchParams("scope=broadcast"), 4);
    const cursor = playlistCursor(query, 4, { id: "clip", releasedAt: 999,
      broadcast: { performedOn: "2026-09-01" } });
    expect(parsePlaylistQuery(new URLSearchParams({ scope: "broadcast", cursor }), 4).after)
      .toEqual({ id: "clip", releasedAt: Date.UTC(2026, 8, 1) });
    const unknown = playlistCursor(query, 4, { id: "unknown", releasedAt: 1000, broadcast: { performedOn: null } });
    expect(parsePlaylistQuery(new URLSearchParams({ scope: "broadcast", cursor: unknown }), 4).after)
      .toEqual({ id: "unknown", releasedAt: null });
    const legacy = JSON.parse(decodeURIComponent(cursor));
    delete legacy.order;
    expect(() => parsePlaylistQuery(new URLSearchParams({ scope: "broadcast", cursor: encodeURIComponent(JSON.stringify(legacy)) }), 4))
      .toThrow("PLAY_CURSOR_STALE");
  });
});
