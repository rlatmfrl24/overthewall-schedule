import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chzzkVideoCatalog, clearChzzkServiceCachesForTests } from "../../chzzk";
import { recordHolidayAssessments, type ScanCoverage } from "./holiday-suggestions";

const channelId = "0a2020b09b8cc7f2285b7ae5de2ce4d3";
const member = { uid: 2, url_chzzk: `https://chzzk.naver.com/${channelId}` };
const checkedAt = Date.parse("2026-10-16T16:03:00+09:00");

describe("holiday evidence after restricted live polling", () => {
  beforeEach(() => {
    clearChzzkServiceCachesForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["confirmed closed", { channelId, openLive: false }, "complete", "complete"],
    ["open without start time", { channelId, openLive: true }, "complete", "incomplete"],
    ["unconfirmed", { channelId }, "complete", "failed"],
    ["failed VOD coverage", { channelId, openLive: false }, "failed", "failed"],
    ["incomplete VOD coverage", { channelId, openLive: false }, "incomplete", "incomplete"],
  ] as const)("preserves %s through the normal catalog and assessment entry", async (_name, content, initial, expected) => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/live-status")) return Response.json({ code: 9004, message: "해외 시청 불가능한 컨텐츠 입니다." }, { status: 500 });
      if (url === `https://api.chzzk.naver.com/service/v1/channels/${channelId}`) return Response.json({ code: 200, content });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const coverage = new Map<string, ScanCoverage>([[channelId, initial]]);
    const planned: unknown[][] = [];
    // Capture write intent only: no SQL parser, D1 runtime, or database execution.
    const db = { prepare: () => ({ bind: (...values: unknown[]) => { planned.push(values); return {}; } }) } as unknown as D1Database;
    const statements: D1PreparedStatement[] = [];
    await recordHolidayAssessments(db, [member], coverage, chzzkVideoCatalog.fetchLiveStatus, checkedAt, statements);
    expect(coverage.get(channelId)).toBe(expected);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.slice(6, 8)).toEqual([expected, 0]);
    expect(statements).toHaveLength(1);
  });
});
