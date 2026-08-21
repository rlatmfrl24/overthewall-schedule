import { describe, expect, it } from "vitest";
import {
  parseCreatePlaylistImport,
  parsePlaylistPreflight,
} from "./ingestion-input";

describe("OTW Play ingestion input", () => {
  it("accepts bounded recent imports and normalizes surrounding whitespace", () => {
    expect(parseCreatePlaylistImport({
      playlistUrl: "  PL1234567890  ",
      mode: "recent",
      recentLimit: 50,
      idempotencyKey: "request_1234",
    })).toEqual({
      ok: true,
      value: {
        playlistUrl: "PL1234567890",
        mode: "recent",
        recentLimit: 50,
        idempotencyKey: "request_1234",
      },
    });
  });

  it("rejects unknown fields, implicit all-new limits, and invalid keys", () => {
    expect(parsePlaylistPreflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      unexpected: true,
    })).toEqual({ ok: false, fields: { body: "invalid_shape" } });
    expect(parsePlaylistPreflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      recentLimit: 50,
    })).toEqual({ ok: false, fields: { body: "invalid_playlist_import" } });
    expect(parseCreatePlaylistImport({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      idempotencyKey: "short",
    })).toEqual({ ok: false, fields: { idempotencyKey: "invalid" } });
  });
});
