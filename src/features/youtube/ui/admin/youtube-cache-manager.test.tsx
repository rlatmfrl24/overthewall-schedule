// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { YouTubeCacheManager } from "./youtube-cache-manager";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const fetchStatusMock = vi.hoisted(() => vi.fn());
const refreshCacheMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/configuration", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
  MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS: 1,
  MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS: 10000,
}));

vi.mock("../../api/youtube-cache", () => ({
  fetchYouTubeCacheStatus: fetchStatusMock,
  refreshYouTubeCache: refreshCacheMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const makeRun = (source: "manual" | "scheduled", startedAt: number) => ({
  id: startedAt,
  source,
  status: "success" as const,
  targetCount: 3,
  skippedFreshCount: 0,
  refreshedCount: 3,
  failedCount: 0,
  staleFallbackCount: 0,
  baselineCount: 3,
  changedCount: 1,
  unchangedCount: 2,
  apiCalls: 6,
  quotaUnits: 6,
  durationMs: 1200,
  startedAt,
  finishedAt: startedAt + 1200,
  error: null,
});

const status = {
  updatedAt: "2026-08-31T00:00:00.000Z",
  window: { hours: 168, since: 1, until: 2 },
  cache: {
    total: 3,
    fresh: 1,
    stale: 1,
    expired: 1,
    byType: [],
  },
  usage: {
    apiCalls: 1722,
    quotaUnits: 1722,
    successCount: 6,
    failureCount: 1,
    rateLimitCount: 0,
    quotaErrorCount: 0,
    byOperation: [],
    byOrigin: [
      {
        origin: "demand" as const,
        apiCalls: 5,
        quotaUnits: 5,
        failureCount: 1,
      },
      {
        origin: "manual" as const,
        apiCalls: 2,
        quotaUnits: 2,
        failureCount: 0,
      },
      {
        origin: "legacy_unknown" as const,
        apiCalls: 1715,
        quotaUnits: 1715,
        failureCount: 0,
      },
    ],
  },
  channels: [],
  warmup: {
    settings: {
      enabled: false,
      intervalHours: 2,
      dailyQuotaUnits: 900,
      officialEnabled: false,
      kirinukiEnabled: false,
      lastRun: null,
    },
    quota: { limit: 900, used: 7, remaining: 893, windowHours: 168, since: 1 },
    targets: {
      total: 3,
      official: 2,
      kirinuki: 1,
      fresh: 1,
      stale: 1,
      expired: 0,
      missing: 1,
    },
    latestRun: makeRun("manual", 1000),
    recentRuns: [makeRun("manual", 1000)],
  },
  analytics: {
    status: "available" as const,
    generatedAt: "2026-08-31T00:00:00.000Z",
    windowHours: 168,
    observedSince: "2026-08-24T00:00:00.000Z",
    coverageHours: 168,
    schemaVersion: "v2" as const,
    sampled: true as const,
    summary: {
      requestCount: 10,
      nonBlockingServeCount: 8,
      requestedTargetCount: 20,
      immediateAvailableCount: 18,
      refreshCount: 4,
      baselineCount: 1,
      changedCount: 1,
      unchangedCount: 2,
    },
    bySource: [],
    byOrigin: [],
    reasonCode: null,
  },
  effectiveness: {
    requestCount: 10,
    nonBlockingServeCount: 8,
    nonBlockingServeRate: 0.8,
    externalApiCalls: 7,
    activeQuotaUnits: 7,
    baselineCount: 1,
    changedCount: 1,
    unchangedCount: 2,
    changeRate: 1 / 3,
    quotaPerChange: 7,
  },
  targetStates: {
    official: { total: 2, fresh: 1, stale: 0, expired: 0, missing: 1 },
    kirinuki: { total: 1, fresh: 0, stale: 1, expired: 0, missing: 0 },
  },
  legacyScheduledRuns: [makeRun("scheduled", 500)],
};

const openOperationalDetails = async () => {
  const summary = await screen.findByText("운영 상세 보기");
  const details = summary.closest("details");
  if (!details) throw new Error("YouTube operational details were not found");
  details.open = true;
  fireEvent(details, new Event("toggle"));
  return details;
};

describe("YouTubeCacheManager", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    fetchSettingsMock.mockReset();
    updateSettingsMock.mockReset();
    fetchStatusMock.mockReset();
    refreshCacheMock.mockReset();
    toastMock.mockReset();
    fetchSettingsMock.mockResolvedValue({
      youtube_api_daily_quota_units: "900",
    });
    fetchStatusMock.mockResolvedValue(status);
    updateSettingsMock.mockResolvedValue(undefined);
    refreshCacheMock.mockResolvedValue(makeRun("manual", 2000));
  });

  afterEach(() => cleanup());

  it("수요 기반 운영 요약에서 현재 캐시와 활성 호출만 우선 표시한다", async () => {
    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledWith(168));
    expect(screen.getByText("수요 기반 SWR · 예약 예열 없음")).toBeTruthy();
    expect(await screen.findByText("캐시 가용성")).toBeTruthy();
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("최근 7일 활성 API 사용량")).toBeTruthy();
    expect(screen.getByText("7 calls")).toBeTruthy();
    expect(screen.getByText(/7 quota · 실패 1 · Demand\/Manual만 집계/)).toBeTruthy();
    expect(screen.getByText("확인 필요")).toBeTruthy();
    expect(screen.getByText("1건")).toBeTruthy();
    expect(screen.getByText("공식 채널")).toBeTruthy();
    expect(screen.getByText("키리누키 채널")).toBeTruthy();
    expect(screen.getByText("운영 상세 보기")).toBeTruthy();
    expect(
      screen.getByText("이전 자동 예열 기록 · 읽기 전용"),
    ).toBeTruthy();
    expect(screen.queryByText("백그라운드 예열")).toBeNull();
    expect(screen.queryByText("실행 간격")).toBeNull();
  });

  it("Analytics 조회 불가를 상세 보조 진단에서 0%로 오인하지 않는다", async () => {
    fetchStatusMock.mockResolvedValueOnce({
      ...status,
      analytics: {
        ...status.analytics,
        status: "unconfigured" as const,
        observedSince: null,
        coverageHours: null,
        reasonCode: "analytics_unconfigured" as const,
      },
      effectiveness: {
        ...status.effectiveness,
        requestCount: null,
        nonBlockingServeCount: null,
        nonBlockingServeRate: null,
        baselineCount: null,
        changedCount: null,
        unchangedCount: null,
        changeRate: null,
        quotaPerChange: null,
      },
    });

    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    await openOperationalDetails();
    expect(
      await screen.findByText("Analytics 읽기 설정이 필요합니다."),
    ).toBeTruthy();
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  it("부분 관측 Analytics를 전체 기간 지표가 아닌 관측 하한으로 표시한다", async () => {
    fetchStatusMock.mockResolvedValueOnce({
      ...status,
      analytics: {
        ...status.analytics,
        observedSince: "2026-08-30T00:00:00.000Z",
        coverageHours: 24,
      },
    });

    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    await openOperationalDetails();
    expect(
      await screen.findByText(/8월 30일.*최소 24.0시간 관측/),
    ).toBeTruthy();
    expect(screen.getByText("비차단 제공률")).toBeTruthy();
    expect(screen.getByText("80.0%")).toBeTruthy();
  });

  it("상세 조회 기간을 바꾸면 같은 상태 API를 새 기간으로 조회한다", async () => {
    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    await openOperationalDetails();
    fireEvent.click(screen.getByRole("combobox", { name: "조회 기간" }));
    fireEvent.click(await screen.findByRole("option", { name: "24시간" }));

    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledWith(24));
  });

  it("canonical quota를 저장하고 확인 후 동기 새로고침 결과를 표시한다", async () => {
    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });
    const quota = await screen.findByLabelText("YouTube API 일일 쿼터 상한");

    await waitFor(() => expect((quota as HTMLInputElement).value).toBe("900"));
    fireEvent.change(quota, { target: { value: "1200" } });
    expect((quota as HTMLInputElement).value).toBe("1200");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(updateSettingsMock).toHaveBeenCalledWith({
        youtube_api_daily_quota_units: "1200",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 새로고침" }));
    expect(refreshCacheMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("전체 YouTube 캐시를 새로고침할까요?"),
    ).toBeTruthy();
    expect(screen.getByText(/활성 공식·키리누키 채널 3개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 갱신 실행" }));
    await waitFor(() => expect(refreshCacheMock).toHaveBeenCalledOnce());
    expect(await screen.findByText("이번 실행 결과")).toBeTruthy();
    expect(screen.getByText("갱신 3/3")).toBeTruthy();
  });
});
