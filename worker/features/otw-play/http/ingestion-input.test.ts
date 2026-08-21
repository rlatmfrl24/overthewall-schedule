import { describe, expect, it } from "vitest";
import {
  parseCreatePlaylistImport,
  parseConvertIngestionCandidates,
  parsePlaylistPreflight,
  parseRetryIngestionJob,
  parseUpdateIngestionCandidate,
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

  it("strictly validates candidate review, conversion, and retry commands", () => {
    const review = {
      song: { kind: "existing", songId: "song-1" },
      participants: [{
        subject: { kind: "entity", entityId: "entity-1" },
        participantRole: "vocal",
        creditOrder: 0,
      }],
      relationType: "cover",
      releaseType: "official_video",
      participationType: "solo",
      internalNote: null,
    };
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      action: "save",
      input: review,
    })).toEqual({
      ok: true,
      value: { expectedVersion: 1, action: "save", input: review },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      action: "ignore",
      unexpected: true,
    })).toEqual({ ok: false, fields: { body: "invalid_shape" } });
    expect(parseConvertIngestionCandidates({
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-1", expectedVersion: 1 },
      ],
    })).toEqual({ ok: false, fields: { candidates: "invalid" } });
    expect(parseRetryIngestionJob({})).toEqual({ ok: true, value: {} });
    expect(parseRetryIngestionJob({ force: true })).toEqual({
      ok: false,
      fields: { body: "empty_object_required" },
    });
  });
});
