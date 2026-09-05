import { describe, expect, it, vi } from "vitest";
import { readAdminReviewSummary } from "./admin-review-summary";

describe("admin review read model", () => {
  it("reads stored counts without writes or provider calls, retaining unavailable counts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const statements: string[] = [];
    const mutation = vi.fn(() => { throw new Error("A read must not mutate"); });
    const db = {prepare: (sql: string) => {
      statements.push(sql);
      return {first: async () => {
        if (sql.includes("music_cover_proposals")) throw new Error("read unavailable");
        return {count: sql.includes("JOIN music_channel_upload") ? 3 : 0};
      }, run: mutation, all: mutation};
    }, batch: mutation, exec: mutation} as unknown as D1Database;
    try {
      const result = await readAdminReviewSummary(db, 1234);
      expect(result.entries).toEqual([
        {kind: "proposals", status: "unavailable", count: null, checkedAt: 1234},
        {kind: "automatic", status: "available", count: 3, checkedAt: 1234},
        {kind: "imports", status: "available", count: 0, checkedAt: 1234},
      ]);
      expect(statements.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true);
      expect(mutation).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
});
