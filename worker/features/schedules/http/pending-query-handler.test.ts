import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { PendingScheduleQueryService } from "../application/pending-schedule-query-service";
import { createPendingScheduleQueryHandler } from "./pending-query-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
const readReviewMock = vi.hoisted(() => vi.fn());
const readRejectionsMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

const handler = createPendingScheduleQueryHandler(
  () =>
    ({
      readReview: readReviewMock,
      readRejections: readRejectionsMock,
    }) as unknown as PendingScheduleQueryService,
);

const env = {
  YOUTUBE_API_KEY: "",
  otw_db: {} as D1Database,
} as Env;

describe("pending schedule query boundary", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin" },
    });
    readReviewMock.mockReset();
    readReviewMock.mockResolvedValue([]);
    readRejectionsMock.mockReset();
    readRejectionsMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it("기존 pending 목록 응답과 no-store 계약을 유지한다", async () => {
    const response = await handler(
      new Request("https://example.com/api/settings/pending"),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
    expect(readReviewMock).toHaveBeenCalledOnce();
  });

  it("거부 제외 검색·사유·날짜·페이지네이션을 전달한다", async () => {
    const response = await handler(
      new Request(
        "https://example.com/api/settings/pending/rejections?search=%ED%85%8C%EC%8A%A4%ED%8A%B8&reasonCode=duplicate&rejectedFrom=2026-07-01&rejectedTo=2026-07-29&page=2&pageSize=50",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(readRejectionsMock).toHaveBeenCalledWith({
      search: "테스트",
      reasonCode: "duplicate",
      rejectedFrom: "2026-07-01",
      rejectedTo: "2026-07-29",
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    ["page=0", "Invalid pagination"],
    ["pageSize=101", "Invalid pagination"],
    ["reasonCode=invalid", "Invalid reasonCode"],
    ["rejectedFrom=2026%2F07%2F01", "Invalid rejection date"],
  ])("잘못된 거부 제외 쿼리를 거부한다: %s", async (query, message) => {
    const response = await handler(
      new Request(
        `https://example.com/api/settings/pending/rejections?${query}`,
      ),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(message);
    expect(readRejectionsMock).not.toHaveBeenCalled();
  });
});
