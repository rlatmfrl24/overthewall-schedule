import { describe, expect, it } from "vitest";
import {
  parseCreatePlaylistImport,
  parseConvertIngestionCandidate,
  parseConvertIngestionCandidates,
  parseIgnoreIngestionCandidates,
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

  it("accepts explicit all-new ranges and rejects partial or oversized ranges", () => {
    expect(parsePlaylistPreflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      rangeStart: 5_000,
      rangeLimit: 1,
    })).toEqual({
      ok: true,
      value: {
        playlistUrl: "PL1234567890",
        mode: "all_new",
        rangeStart: 5_000,
        rangeLimit: 1,
      },
    });
    expect(parsePlaylistPreflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      rangeStart: 5_000,
    })).toEqual({ ok: false, fields: { body: "invalid_playlist_import" } });
    expect(parsePlaylistPreflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
      rangeStart: 0,
      rangeLimit: 5_001,
    })).toEqual({ ok: false, fields: { body: "invalid_playlist_import" } });
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
      performanceTags: ["방송 클립"],
      internalNote: null,
    };
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      expectedReviewInput: null,
      expectedReviewStatus: "needs_input",
      action: "save",
      input: review,
    })).toEqual({
      ok: true,
      value: {
        expectedVersion: 1,
        expectedReviewInput: null,
        expectedReviewStatus: "needs_input",
        action: "save",
        input: review,
      },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      expectedReviewInput: { invalid: true },
      expectedReviewStatus: "needs_input",
      action: "save",
      input: review,
    })).toEqual({
      ok: false,
      fields: { expectedReviewInput: "invalid_review_input" },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      expectedReviewInput: null,
      expectedReviewStatus: "invalid",
      action: "save",
      input: review,
    })).toEqual({
      ok: false,
      fields: { expectedReviewStatus: "invalid" },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      action: "ignore",
      unexpected: true,
    })).toEqual({ ok: false, fields: { body: "invalid_shape" } });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 2,
      action: "approve_channel",
      channel: {
        ownershipKind: "member",
        channelRole: "member_music",
        entityIds: ["entity-1"],
      },
    })).toEqual({
      ok: true,
      value: {
        expectedVersion: 2,
        action: "approve_channel",
        channel: {
          ownershipKind: "member",
          channelRole: "member_music",
          entityIds: ["entity-1"],
        },
      },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 2,
      action: "approve_channel",
      channel: {
        ownershipKind: "external",
        channelRole: "approved_kirinuki",
        entityIds: [],
        externalApprovalConfirmed: true,
      },
    })).toEqual({ ok: false, fields: { channel: "invalid" } });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 2,
      action: "approve_channel",
      channel: {
        ownershipKind: "otw_official",
        channelRole: "otw_official",
        entityIds: [],
      },
    })).toEqual({
      ok: true,
      value: {
        expectedVersion: 2,
        action: "approve_channel",
        channel: {
          ownershipKind: "otw_official",
          channelRole: "otw_official",
          entityIds: [],
        },
      },
    });
    expect(parseUpdateIngestionCandidate({
      expectedVersion: 2,
      action: "approve_channel",
      channel: {
        ownershipKind: "external",
        channelRole: "project_official",
        entityIds: ["entity-external"],
        externalApprovalConfirmed: false,
      },
    })).toEqual({ ok: false, fields: { channel: "invalid" } });
    expect(parseConvertIngestionCandidates({
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-1", expectedVersion: 1 },
      ],
    })).toEqual({ ok: false, fields: { candidates: "invalid" } });
    expect(parseConvertIngestionCandidate({ expectedVersion: 3 })).toEqual({
      ok: true,
      value: { expectedVersion: 3 },
    });
    expect(parseConvertIngestionCandidate({ expectedVersion: 3, force: true })).toEqual({
      ok: false,
      fields: { body: "invalid_shape" },
    });
    expect(parseIgnoreIngestionCandidates({
      candidates: [{ id: "candidate-1", expectedVersion: 1 }],
    })).toEqual({
      ok: true,
      value: { candidates: [{ id: "candidate-1", expectedVersion: 1 }] },
    });
    expect(parseIgnoreIngestionCandidates({
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-1", expectedVersion: 2 },
      ],
    })).toEqual({ ok: false, fields: { candidates: "invalid" } });
    expect(parseRetryIngestionJob({})).toEqual({ ok: true, value: {} });
    expect(parseRetryIngestionJob({ force: true })).toEqual({
      ok: false,
      fields: { body: "empty_object_required" },
    });
  });
});
