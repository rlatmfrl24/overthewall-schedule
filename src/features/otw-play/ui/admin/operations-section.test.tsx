// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { OperationsSection } from "./operations-section";

const updateReleaseMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("../../api/admin", () => ({
  updateOtwPlayAdminRelease: updateReleaseMock,
}));
vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const observability = {
  status: "available" as const,
  generatedAt: "2026-08-20T00:00:00.000Z",
  windowHours: 24 as const,
  summary: {
    requestCount: 100,
    errorCount: 2,
    errorRate: 0.02,
    cacheHit: 80,
    cacheMiss: 10,
    cacheBypass: 10,
    p95DurationMs: 125,
    d1RowsRead: 450,
    d1RowsWritten: 12,
  },
  routes: [{
    routeId: "otw-play.public.catalog",
    requestCount: 80,
    errorCount: 1,
    errorRate: 0.0125,
    cacheHit: 70,
    cacheMiss: 5,
    cacheBypass: 5,
    p95DurationMs: 100,
    d1RowsRead: 300,
    d1RowsWritten: 0,
  }],
  events: [{ event: "play.catalog.read", count: 100 }],
};

const release = {
  data: {
    publicReadEnabled: false,
    navigationVisible: false,
    catalogRevision: 7,
    readModelRevision: 7,
    updatedAt: 10,
    readyForPublicRead: true,
  },
  recentChanges: [],
};

const props = () => ({
  observability,
  observabilityLoading: false,
  observabilityError: null,
  observabilityFetching: false,
  refetchObservability: vi.fn(async () => undefined),
  release,
  releaseLoading: false,
  releaseError: null,
  sourceHealth: {
    generatedAt: 1,
    recentRecoveryWindowDays: 7 as const,
    listLimit: 50 as const,
    counts: { due: 2, unplayable: 1, recentlyRecovered: 3 },
    due: [],
    unplayable: [],
    recentlyRecovered: [],
  },
  onReleaseChanged: vi.fn(async () => undefined),
  onOpenSourceHealth: vi.fn(),
});

describe("OTW Play operations section", () => {
  beforeEach(() => {
    updateReleaseMock.mockReset();
    toastMock.mockReset();
    updateReleaseMock.mockResolvedValue({
      data: {
        ...release.data,
        publicReadEnabled: true,
        updatedAt: 11,
      },
      transition: "enable_public_read",
      changedAt: 11,
    });
  });

  afterEach(() => cleanup());

  it("renders 24-hour metrics for desktop table and mobile cards", () => {
    const { container } = render(createElement(OperationsSection, props()));
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
    expect(screen.getByText("최근 24시간 관측")).toBeTruthy();
    expect(screen.getByText("2.0%")).toBeTruthy();
    expect(screen.getByText("125ms")).toBeTruthy();
    expect(screen.getAllByText("otw-play.public.catalog")).toHaveLength(2);
    expect(screen.getByText("재확인 필요 2")).toBeTruthy();
  });

  it("keeps release controls available when Analytics is unconfigured", () => {
    render(createElement(OperationsSection, {
      ...props(),
      observability: {
        ...observability,
        status: "unconfigured",
        summary: {
          requestCount: 0,
          errorCount: 0,
          errorRate: 0,
          cacheHit: 0,
          cacheMiss: 0,
          cacheBypass: 0,
          p95DurationMs: null,
          d1RowsRead: null,
          d1RowsWritten: null,
        },
        routes: [],
        events: [],
        reasonCode: "analytics_unconfigured",
      },
    }));
    expect(screen.getByText(/Analytics 조회 token/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /공개 API canary 시작/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders an observability query failure with retry without hiding release controls", () => {
    const refetchObservability = vi.fn(async () => undefined);
    render(createElement(OperationsSection, {
      ...props(),
      observability: undefined,
      observabilityError: new Error("analytics unavailable"),
      refetchObservability,
    }));

    expect(screen.getByRole("alert").textContent).toContain("운영 지표를 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: /공개 API canary 시작/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetchObservability).toHaveBeenCalledOnce();
  });

  it("requires confirmation, avoids optimistic state, invalidates, and restores focus", async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    updateReleaseMock.mockReturnValueOnce(
      new Promise((resolve) => { resolveUpdate = resolve; }),
    );
    const value = props();
    render(createElement(OperationsSection, value));
    const trigger = screen.getByRole("button", { name: /공개 API canary 시작/ });
    fireEvent.click(trigger);
    const submit = screen.getByRole("button", { name: "권위 상태 변경" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(screen.getAllByText("비활성").length).toBeGreaterThanOrEqual(1);
    expect(updateReleaseMock).toHaveBeenCalledWith({
      expected: {
        publicReadEnabled: false,
        navigationVisible: false,
        updatedAt: 10,
      },
      target: { publicReadEnabled: true, navigationVisible: false },
      confirmation: "direct_routes_verified",
    });
    resolveUpdate?.({});
    await waitFor(() => expect(value.onReleaseChanged).toHaveBeenCalledOnce());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("refreshes authoritative state after a stale conflict", async () => {
    updateReleaseMock.mockRejectedValueOnce(
      new ApiError("stale", 409, { code: "PLAY_ADMIN_STALE_WRITE" }),
    );
    const value = props();
    render(createElement(OperationsSection, value));
    fireEvent.click(screen.getByRole("button", { name: /공개 API canary 시작/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "권위 상태 변경" }));
    await waitFor(() => expect(value.onReleaseChanged).toHaveBeenCalledOnce());
    expect(toastMock).toHaveBeenCalledWith({
      variant: "info",
      description: "다른 변경이 먼저 반영되었습니다. 최신 권위 상태를 다시 불러왔습니다.",
    });
  });

  it("disables forward transitions while revisions are not ready", () => {
    render(createElement(OperationsSection, {
      ...props(),
      release: {
        ...release,
        data: {
          ...release.data,
          readModelRevision: 6,
          readyForPublicRead: false,
        },
      },
    }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button", { name: /공개 API canary 시작/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
