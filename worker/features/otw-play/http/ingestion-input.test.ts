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
  it("accepts explicit singing imports and rejects invalid kinds and unversioned corrections", () => {
    expect(parseCreatePlaylistImport({ playlistUrl: "PL1234567890", mode: "all_new", candidateKind: "singing_clip", idempotencyKey: "request_1234" })).toMatchObject({ ok: true, value: { candidateKind: "singing_clip" } });
    expect(parsePlaylistPreflight({ playlistUrl: "PL1234567890", mode: "all_new", candidateKind: "broadcast" }).ok).toBe(false);
    expect(parseUpdateIngestionCandidate({ action: "change_kind", candidateKind: "singing_clip", expectedVersion: 3 })).toMatchObject({ ok: true });
    expect(parseUpdateIngestionCandidate({ action: "change_kind", candidateKind: "singing_clip" }).ok).toBe(false);
  });

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

  const createCandidateReview = () => ({
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
    });

it("accepts a versioned candidate review", () => {
const review = createCandidateReview();
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
});

it("rejects malformed expected review input", () => {
const review = createCandidateReview();
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
});

it("rejects an unknown expected review status", () => {
const review = createCandidateReview();
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
});

it("rejects unknown ignore fields", () => {
expect(parseUpdateIngestionCandidate({
      expectedVersion: 1,
      action: "ignore",
      unexpected: true,
    })).toEqual({ ok: false, fields: { body: "invalid_shape" } });
});

it("accepts member channel ownership", () => {
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
});

it("rejects external channel approval without an owner", () => {
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
});

it("accepts site-owned official channel approval", () => {
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
});

it("requires explicit external project channel confirmation", () => {
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
});

it("rejects duplicate batch conversion candidates", () => {
expect(parseConvertIngestionCandidates({
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-1", expectedVersion: 1 },
      ],
    })).toEqual({ ok: false, fields: { candidates: "invalid" } });
});

it("accepts a versioned single conversion", () => {
expect(parseConvertIngestionCandidate({ expectedVersion: 3 })).toEqual({
      ok: true,
      value: { expectedVersion: 3 },
    });
});

it("rejects unrecognized single-conversion fields", () => {
expect(parseConvertIngestionCandidate({ expectedVersion: 3, force: true })).toEqual({
      ok: false,
      fields: { body: "invalid_shape" },
    });
});

it("accepts a versioned ignore batch", () => {
expect(parseIgnoreIngestionCandidates({
      candidates: [{ id: "candidate-1", expectedVersion: 1 }],
    })).toEqual({
      ok: true,
      value: { candidates: [{ id: "candidate-1", expectedVersion: 1 }] },
    });
});

it("rejects duplicate ignore candidates with different versions", () => {
expect(parseIgnoreIngestionCandidates({
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-1", expectedVersion: 2 },
      ],
    })).toEqual({ ok: false, fields: { candidates: "invalid" } });
});

it("accepts an empty retry command", () => {
expect(parseRetryIngestionJob({})).toEqual({ ok: true, value: {} });
});

it("rejects forcing a retry through an unknown field", () => {
expect(parseRetryIngestionJob({ force: true })).toEqual({
      ok: false,
      fields: { body: "empty_object_required" },
    });
});
});
