import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLiveStatus } from "../../../worker/routes/live";
import type { Env } from "../../../worker/types";

const fetchChzzkLiveStatusMock = vi.hoisted(() => vi.fn());
const fetchChzzkLiveStatusWithDebugMock = vi.hoisted(() => vi.fn());
const autoFillUndecidedLiveSchedulesMock = vi.hoisted(() => vi.fn());
const isLiveScheduleAutoFillEnabledMock = vi.hoisted(() => vi.fn());
const authenticateOptionalRequestMock = vi.hoisted(() => vi.fn());
const isAdminUserMock = vi.hoisted(() => vi.fn());
const fakeDb = vi.hoisted(() => ({}));

vi.mock("../../../worker/services/chzzk", () => ({
  fetchChzzkLiveStatus: fetchChzzkLiveStatusMock,
  fetchChzzkLiveStatusWithDebug: fetchChzzkLiveStatusWithDebugMock,
}));

vi.mock("../../../worker/services/live-schedule", () => ({
  autoFillUndecidedLiveSchedules: autoFillUndecidedLiveSchedulesMock,
  isLiveScheduleAutoFillEnabled: isLiveScheduleAutoFillEnabledMock,
}));

vi.mock("../../../worker/auth", () => ({
  authenticateOptionalRequest: authenticateOptionalRequestMock,
  isAdminUser: isAdminUserMock,
}));

vi.mock("../../../worker/db", () => ({
  getDb: () => fakeDb,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "",
    otw_db: {} as D1Database,
  }) as Env;

describe("live status route", () => {
  beforeEach(() => {
    fetchChzzkLiveStatusMock.mockReset();
    fetchChzzkLiveStatusWithDebugMock.mockReset();
    autoFillUndecidedLiveSchedulesMock.mockReset();
    isLiveScheduleAutoFillEnabledMock.mockReset();
    authenticateOptionalRequestMock.mockReset();
    isAdminUserMock.mockReset();
    isLiveScheduleAutoFillEnabledMock.mockResolvedValue(true);
    autoFillUndecidedLiveSchedulesMock.mockResolvedValue({
      updated: 0,
      details: [],
    });
    authenticateOptionalRequestMock.mockResolvedValue(null);
    isAdminUserMock.mockReturnValue(false);
  });

  it("관리자 로그인 요청은 라이브 상태 조회 후 시간 미정 스케쥴 자동 삽입을 시도하고 응답 형태는 유지한다", async () => {
    authenticateOptionalRequestMock.mockResolvedValueOnce({ id: "admin" });
    isAdminUserMock.mockReturnValueOnce(true);
    const liveContent = {
      status: "OPEN",
      liveTitle: "라이브 방송",
      concurrentUserCount: 10,
      liveImageUrl: "",
      defaultThumbnailImageUrl: "",
      openDate: "2026-06-30T20:15:00+09:00",
      channelId: "channel-a",
      channelName: "채널 A",
      channelImageUrl: "",
    };
    fetchChzzkLiveStatusMock.mockResolvedValueOnce(liveContent);

    const response = await handleLiveStatus(
      new Request("https://example.com/api/live-status?channelIds=channel-a"),
      makeEnv(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toEqual([{ channelId: "channel-a", content: liveContent }]);
    expect(body.scheduleAutoFill).toEqual({ updated: 0 });
    expect(authenticateOptionalRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      makeEnv(),
    );
    expect(isAdminUserMock).toHaveBeenCalledWith(makeEnv(), "admin");
    expect(autoFillUndecidedLiveSchedulesMock).toHaveBeenCalledWith(fakeDb, [
      { channelId: "channel-a", content: liveContent },
    ]);
  });

  it("비로그인 요청은 라이브 상태만 조회하고 스케쥴 자동 삽입을 건너뛴다", async () => {
    fetchChzzkLiveStatusMock.mockResolvedValueOnce({
      status: "OPEN",
      liveTitle: "라이브 방송",
      concurrentUserCount: 10,
      liveImageUrl: "",
      defaultThumbnailImageUrl: "",
      channelId: "channel-a",
      channelName: "채널 A",
      channelImageUrl: "",
    });

    const response = await handleLiveStatus(
      new Request("https://example.com/api/live-status?channelIds=channel-a"),
      makeEnv(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduleAutoFill).toEqual({ updated: 0 });
    expect(isLiveScheduleAutoFillEnabledMock).not.toHaveBeenCalled();
    expect(autoFillUndecidedLiveSchedulesMock).not.toHaveBeenCalled();
  });

  it("비관리자 로그인 요청은 스케쥴 자동 삽입을 건너뛴다", async () => {
    authenticateOptionalRequestMock.mockResolvedValueOnce({ id: "member" });
    isAdminUserMock.mockReturnValueOnce(false);
    fetchChzzkLiveStatusMock.mockResolvedValueOnce({
      status: "OPEN",
      liveTitle: "라이브 방송",
      concurrentUserCount: 10,
      liveImageUrl: "",
      defaultThumbnailImageUrl: "",
      channelId: "channel-a",
      channelName: "채널 A",
      channelImageUrl: "",
    });

    const response = await handleLiveStatus(
      new Request("https://example.com/api/live-status?channelIds=channel-a"),
      makeEnv(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduleAutoFill).toEqual({ updated: 0 });
    expect(isAdminUserMock).toHaveBeenCalledWith(makeEnv(), "member");
    expect(isLiveScheduleAutoFillEnabledMock).not.toHaveBeenCalled();
    expect(autoFillUndecidedLiveSchedulesMock).not.toHaveBeenCalled();
  });

  it("라이브 스케줄 자동 입력 설정이 꺼져 있으면 삽입을 건너뛴다", async () => {
    authenticateOptionalRequestMock.mockResolvedValueOnce({ id: "admin" });
    isAdminUserMock.mockReturnValueOnce(true);
    isLiveScheduleAutoFillEnabledMock.mockResolvedValueOnce(false);
    fetchChzzkLiveStatusMock.mockResolvedValueOnce({
      status: "OPEN",
      liveTitle: "라이브 방송",
      concurrentUserCount: 10,
      liveImageUrl: "",
      defaultThumbnailImageUrl: "",
      channelId: "channel-a",
      channelName: "채널 A",
      channelImageUrl: "",
    });

    const response = await handleLiveStatus(
      new Request("https://example.com/api/live-status?channelIds=channel-a"),
      makeEnv(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduleAutoFill).toEqual({ updated: 0 });
    expect(isLiveScheduleAutoFillEnabledMock).toHaveBeenCalledWith(fakeDb);
    expect(autoFillUndecidedLiveSchedulesMock).not.toHaveBeenCalled();
  });
});
