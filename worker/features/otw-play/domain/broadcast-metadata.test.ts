import { describe, expect, it } from "vitest";
import { emptyBroadcastMetadata, parseBroadcastMetadata, readBroadcastMetadata } from "./broadcast-metadata";
import { parsePlaylistQuery, playlistCursor } from "./playlist-query";

describe("broadcast metadata and browse boundaries", () => {
  it("keeps unknown dates and originals, including partial singing", () => {
    const input = { ...emptyBroadcastMetadata(), extent: "partial" as const };
    expect(parseBroadcastMetadata(input)).toEqual(input);
    expect(readBroadcastMetadata(null)).toEqual(emptyBroadcastMetadata());
  });
  it("rejects invalid dates, missing fields and unsafe original links", () => {
    for (const performedOn of ["2026-02-30", "2026-9-1", "unknown", 123]) {
      expect(parseBroadcastMetadata({ ...emptyBroadcastMetadata(), performedOn })).toBeNull();
    }
    for (const originalUrl of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com"]) {
      expect(parseBroadcastMetadata({ ...emptyBroadcastMetadata(), originalUrl })).toBeNull();
    }
    expect(parseBroadcastMetadata({ extent: "full" })).toBeNull();
  });
  it("binds cursors to broadcast filters while retaining official defaults", () => {
    const query = parsePlaylistQuery(new URLSearchParams("scope=broadcast&dateUnknown=1"), 1);
    const cursor = playlistCursor(query, 1, { id: "clip", releasedAt: 42 });
    expect(parsePlaylistQuery(new URLSearchParams({ scope: "broadcast", dateUnknown: "1", cursor }), 1).after?.id).toBe("clip");
    expect(() => parsePlaylistQuery(new URLSearchParams({ cursor }), 1)).toThrow();
    expect(() => parsePlaylistQuery(new URLSearchParams("scope=broadcast&broadcastFrom=2026-09-10&broadcastTo=2026-09-01"), 1)).toThrow();
    expect(() => parsePlaylistQuery(new URLSearchParams("broadcastFrom=2026-09-01"), 1)).toThrow();
  });
});
