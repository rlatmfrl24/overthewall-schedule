import { describe, expect, it } from "vitest";
import { readRecordedChanges } from "./recorded-changes";

describe("recorded audit changes", () => {
  it("preserves zero, false and explicit empty values separately from missing history", () => {
    expect(readRecordedChanges(JSON.stringify({changes: [
      {key: "limit", previousValue: 0, nextValue: false},
      {key: "label", nextValue: ""},
      {key: "unset", previousValue: null},
    ]}))).toEqual([
      {key: "limit", before: "0", after: "false"},
      {key: "label", before: "기록 없음", after: "빈 값"},
      {key: "unset", before: "미설정", after: "기록 없음"},
    ]);
  });
  it("does not invent changes from old or malformed logs", () => {
    for (const detail of [null, "old text", "null", '{"result":"success"}', '{"changes":[null,{}]}']) {
      expect(readRecordedChanges(detail)).toEqual([]);
    }
  });
});
