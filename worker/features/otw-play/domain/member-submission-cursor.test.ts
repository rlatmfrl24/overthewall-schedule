import { describe, expect, it } from "vitest";
import {
  decodeMemberSubmissionCursor,
  encodeMemberSubmissionCursor,
  MemberSubmissionCursorError,
} from "./member-submission-cursor";

describe("member submission cursor", () => {
  it("round-trips a Unicode-safe keyset tuple", () => {
    const cursor = { createdAt: 1_786_000_000_000, id: "제안-1" };
    expect(decodeMemberSubmissionCursor(encodeMemberSubmissionCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed and non-canonical payloads", () => {
    expect(() => decodeMemberSubmissionCursor("not-json")).toThrow(
      MemberSubmissionCursorError,
    );
    expect(() => decodeMemberSubmissionCursor("a".repeat(513))).toThrow(
      MemberSubmissionCursorError,
    );
  });
});
