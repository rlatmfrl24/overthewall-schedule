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
    apiCalls: 7,
    quotaUnits: 7,
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

describe("YouTubeCacheManager", () => {
  beforeEach(() => {
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

  it("수요 기반 운영 상태와 이전 자동 예열 기록을 분리해 표시한다", async () => {
    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledWith(168));
    expect(screen.getAllByText("수요 기반 갱신 · 정기 예열 없음")).toHaveLength(
      2,
    );
    expect(
      await screen.findByText("최근 7일 비차단 제공률 (추정)"),
    ).toBeTruthy();
    expect(await screen.findByText("80.0%")).toBeTruthy();
    expect(
      screen.getByText(
        "Analytics v2 · 표본 보정 추정치 · 이벤트 기반 관측 하한",
      ),
    ).toBeTruthy();
    expect(screen.getByText("콘텐츠 변경률 (추정)")).toBeTruthy();
    expect(screen.getByText("변경 1건당 quota (추정)")).toBeTruthy();
    expect(screen.getByText("공식 채널")).toBeTruthy();
    expect(screen.getByText("키리누키 채널")).toBeTruthy();
    expect(screen.getByText("이전 자동 예열 기록")).toBeTruthy();
    expect(screen.queryByText("백그라운드 예열")).toBeNull();
    expect(screen.queryByText("실행 간격")).toBeNull();
  });

  it("Analytics 조회 불가를 0%로 오인하지 않고 별도 상태로 표시한다", async () => {
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

    expect(
      await screen.findAllByText("Analytics 읽기 설정이 필요합니다."),
    ).toHaveLength(3);
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  it("부분 관측 coverage를 최근 7일 전체 지표로 표시하지 않는다", async () => {
    fetchStatusMock.mockResolvedValueOnce({
      ...status,
      analytics: {
        ...status.analytics,
        observedSince: "2026-08-30T00:00:00.000Z",
        coverageHours: 24,
      },
    });

    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    expect(
      await screen.findByText("관측 범위 비차단 제공률 (추정)"),
    ).toBeTruthy();
    expect(screen.queryByText("최근 7일 비차단 제공률 (추정)")).toBeNull();
    expect((await screen.findByRole("status")).textContent).toContain(
      "이벤트 기반 최소 관측 · 8월 30일",
    );
    expect(screen.getByRole("status").textContent).toContain("24.0/168시간");
    expect(
      screen.getByText(/선택 기간 D1 \/ 이벤트 기반 부분 관측/),
    ).toBeTruthy();
  });

  it("available 응답의 coverage가 불명확하면 최근 7일 전체로 표시하지 않는다", async () => {
    fetchStatusMock.mockResolvedValueOnce({
      ...status,
      analytics: {
        ...status.analytics,
        observedSince: "2026-08-30T00:00:00.000Z",
        coverageHours: null,
      },
    });

    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    expect(
      await screen.findByText("관측 범위 비차단 제공률 (추정)"),
    ).toBeTruthy();
    expect(screen.queryByText("최근 7일 비차단 제공률 (추정)")).toBeNull();
    expect((await screen.findByRole("status")).textContent).toContain(
      "관측 범위 확인 불가",
    );
  });

  it("관측 이벤트가 없는 available 응답을 0%로 표시하지 않는다", async () => {
    fetchStatusMock.mockResolvedValueOnce({
      ...status,
      analytics: {
        ...status.analytics,
        observedSince: null,
        coverageHours: 0,
        summary: {
          ...status.analytics.summary,
          requestCount: 0,
          nonBlockingServeCount: 0,
        },
      },
      effectiveness: {
        ...status.effectiveness,
        requestCount: 0,
        nonBlockingServeCount: 0,
        nonBlockingServeRate: null,
      },
    });

    render(<YouTubeCacheManager />, { wrapper: createQueryWrapper() });

    expect((await screen.findByRole("status")).textContent).toContain(
      "선택 기간 내 v2 관측 이벤트 없음",
    );
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  it("canonical quota 키를 저장하고 동기 새로고침 결과를 직접 표시한다", async () => {
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
    await waitFor(() => expect(refreshCacheMock).toHaveBeenCalledOnce());
    expect(await screen.findByText("이번 실행 결과")).toBeTruthy();
    expect(screen.getByText("갱신 3/3")).toBeTruthy();
  });
});
