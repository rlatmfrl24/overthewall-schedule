// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { SourceHealthSection } from "./source-health-section";

const recheckSourceMock = vi.hoisted(() => vi.fn());
const batchMock = vi.hoisted(() => vi.fn());
const monitorMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/operations", () => ({ createOperationRun: batchMock, useOperationRun: monitorMock }));

vi.mock("../../api/admin", () => ({
  recheckOtwPlaySource: recheckSourceMock,
}));

const dueItem = {
  source: {
    id: "source-due",
    provider: "youtube" as const,
    externalId: "dQw4w9WgXcQ",
    channelId: "channel-due",
    title: "점검 영상",
    thumbnailUrl: null,
    durationSeconds: 180,
    providerPublishedAt: null,
    availabilityStatus: "unknown" as const,
    lastCheckedAt: 1_776_000_000_000,
    nextCheckAt: 1_776_100_000_000,
    version: 3,
  },
  channel: {
    id: "channel-due",
    externalChannelId: `UC${"D".repeat(22)}`,
    displayName: "점검 채널",
  },
  linkedPerformanceCount: 1,
  links: [{
    songId: "song-due",
    songTitle: "점검 곡",
    performanceId: "performance-due",
    publicationStatus: "published" as const,
  }],
  lastEvent: null,
  recoveredAt: null,
};

const show = () => {
    const run = vi.fn(async (_label: string, task: () => Promise<unknown>) => {
      await task();
      return true;
    });
    const onBatchFinished = vi.fn(async () => undefined);
    const panel = createElement(SourceHealthSection, {
      data: {
        generatedAt: 1_777_000_000_000,
        recentRecoveryWindowDays: 7,
        listLimit: 50,
        counts: { due: 1, unplayable: 0, recentlyRecovered: 0 },
        due: [dueItem],
        unplayable: [],
        recentlyRecovered: [],
      },
      loading: false,
      fetching: false,
      error: null,
      saving: null,
      run,
      refetch: vi.fn(async () => undefined),
      onBatchFinished,
    });
    return { ...render(panel, { wrapper: createQueryWrapper() }), panel, onBatchFinished };
};

describe("OTW Play source health section", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("groups summary, status lists, and actions into one dense panel", async () => {
    recheckSourceMock.mockResolvedValue({});
    monitorMock.mockReturnValue({});
    const { container } = show();

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getByLabelText("재확인 필요")).toBeTruthy();
    expect(screen.getByLabelText("재생 불가")).toBeTruthy();
    expect(screen.getByLabelText("최근 7일 복구")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "수동 재검사" })[0]!);

    await waitFor(() => expect(recheckSourceMock).toHaveBeenCalledWith(
      "source-due",
      {
        expectedVersion: 3,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channelId: "channel-due",
      },
    ));
  });

  it("confirms the batch, waits for its result, and refreshes source health on completion", async () => {
    batchMock.mockResolvedValue({ runId: "source-batch", acceptedAt: Date.now() });
    monitorMock.mockReturnValue({});
    const { panel, rerender, onBatchFinished } = show();
    fireEvent.click(screen.getByRole("button", { name: "일괄 재검사" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("재확인 시각이 지난 영상만");
    expect(batchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "재검사 실행" }));
    await screen.findByText("재검사 접수 · 대기 중");
    expect(batchMock).toHaveBeenCalledExactlyOnceWith("source_health");
    expect(onBatchFinished).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "일괄 재검사" })).toHaveProperty("disabled", true);

    monitorMock.mockReturnValue({ data: { runId: "source-batch", status: "partial" } });
    rerender(createElement(SourceHealthSection, panel.props));
    expect(await screen.findByText("일부 재검사 미완료")).toBeTruthy();
    expect(onBatchFinished).toHaveBeenCalledOnce();
  });
});
