import { describe, expect, it } from "vitest";
import {
  parseCreateSubmission,
  parseSubmissionPreflight,
  parseUpdateSubmission,
  parseWithdrawSubmission,
} from "./member-submission-input";

const valid = () => ({
  clientRequestId: "8a6b62f0-c785-4b8e-a480-6fcb10eb0112",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  title: "테스트 곡",
  suggestedSongId: null,
  originalArtists: [{ kind: "external", displayName: "원곡 가수" }],
  participants: [{ kind: "member", memberUid: 1 }],
  note: "검수 부탁드립니다",
});

describe("member submission input", () => {
  it("accepts only the member submission snapshot contract", () => {
    const legacy = parseCreateSubmission(valid());
    expect(legacy.ok && legacy.value.participants[0]?.participantRole).toBe("vocal");
    const classified = parseCreateSubmission({
      ...valid(),
      participants: [
        { kind: "member", memberUid: 1, participantRole: "chorus" },
      ],
    });
    expect(classified.ok && classified.value.participants[0]?.participantRole).toBe("chorus");
    expect(parseSubmissionPreflight({ youtubeUrl: valid().youtubeUrl }).ok).toBe(true);
  });

  it("rejects unknown participant roles", () => {
    expect(
      parseCreateSubmission({
        ...valid(),
        participants: [
          { kind: "member", memberUid: 1, participantRole: "producer" },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects actor, status, publication, and reviewer injection", () => {
    for (const field of ["status", "submitter", "reviewer", "publicationStatus"]) {
      expect(parseCreateSubmission({ ...valid(), [field]: "approved" })).toEqual({
        ok: false,
        fields: { body: "invalid_shape" },
      });
    }
  });

  it("enforces UUID, text and collection bounds", () => {
    expect(parseCreateSubmission({ ...valid(), clientRequestId: "bad" }).ok).toBe(false);
    expect(parseCreateSubmission({ ...valid(), note: "가".repeat(1001) }).ok).toBe(false);
    expect(parseCreateSubmission({ ...valid(), originalArtists: [] }).ok).toBe(false);
    expect(
      parseCreateSubmission({
        ...valid(),
        participants: Array.from({ length: 31 }, () => ({
          kind: "external",
          displayName: "가창자",
        })),
      }).ok,
    ).toBe(false);
  });

  it("requires a non-negative CAS version for update and withdrawal", () => {
    const base = valid();
    const editable = {
      youtubeUrl: base.youtubeUrl,
      title: base.title,
      suggestedSongId: base.suggestedSongId,
      originalArtists: base.originalArtists,
      participants: base.participants,
      note: base.note,
    };
    expect(parseUpdateSubmission({ ...editable, expectedVersion: 0 }).ok).toBe(true);
    expect(parseUpdateSubmission({ ...editable, expectedVersion: -1 }).ok).toBe(false);
    expect(parseWithdrawSubmission({ expectedVersion: 3 })).toEqual({
      ok: true,
      value: { expectedVersion: 3 },
    });
    expect(parseWithdrawSubmission({ expectedVersion: 3, reason: "secret" }).ok).toBe(false);
  });
});
