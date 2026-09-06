// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { queryKeys } from "@/shared/query/query-keys";

const autoFillLiveSchedulesForMembersMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/chzzk", () => ({
  autoFillLiveSchedulesForMembers: autoFillLiveSchedulesForMembersMock,
}));

const members = [{ uid: 1 }] as MemberDto[];
const schedules = [{ id: 1 }] as ScheduleDto[];

describe("useAdminLiveScheduleAutoFill", () => {
  beforeEach(() => {
    autoFillLiveSchedulesForMembersMock.mockReset();
  });

  it("관리자에게 새 live-status 결과가 도착할 때 한 번만 POST를 실행한다", async () => {
    autoFillLiveSchedulesForMembersMock.mockResolvedValue({
      updatedAt: "2026-07-28T00:00:00.000Z",
      checkedChannelCount: 1,
      scheduleAutoFill: { updated: 0 },
    });
    const { useAdminLiveScheduleAutoFill } = await import(
      "./use-admin-live-schedule-auto-fill"
    );
    const { rerender } = renderHook(
      (props) => useAdminLiveScheduleAutoFill(props),
      {
        initialProps: {
          enabled: false,
          sourceReady: true,
          snapshotVersion: "v1-100",
          members,
          schedules,
        },
        wrapper: createQueryWrapper(),
      },
    );

    rerender({
      enabled: true,
      sourceReady: true,
      snapshotVersion: "v1-100",
      members,
      schedules,
    });
    await waitFor(() =>
      expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(1),
    );

    rerender({
      enabled: true,
      sourceReady: true,
      snapshotVersion: "v1-100",
      members: [...members],
      schedules: [...schedules],
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(1);

    rerender({
      enabled: true,
      sourceReady: true,
      snapshotVersion: "v1-200",
      members,
      schedules,
    });
    await waitFor(() =>
      expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(2),
    );
  });

  it("일정이 갱신된 경우 schedule query를 무효화한다", async () => {
    autoFillLiveSchedulesForMembersMock.mockResolvedValue({
      updatedAt: "2026-07-28T00:00:00.000Z",
      checkedChannelCount: 1,
      scheduleAutoFill: { updated: 1 },
    });
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { useAdminLiveScheduleAutoFill } = await import(
      "./use-admin-live-schedule-auto-fill"
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () =>
        useAdminLiveScheduleAutoFill({
          enabled: true,
          sourceReady: true,
          snapshotVersion: "v1-100",
          members,
          schedules,
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.schedules.all,
      }),
    );
  });

  it("같은 snapshot의 일시 실패는 다음 렌더에서 다시 시도한다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    autoFillLiveSchedulesForMembersMock
      .mockRejectedValueOnce(new Error("snapshot expired"))
      .mockResolvedValueOnce({
        updatedAt: "2026-07-28T00:00:00.000Z",
        checkedChannelCount: 1,
        scheduleAutoFill: { updated: 0 },
      });
    const { useAdminLiveScheduleAutoFill } = await import(
      "./use-admin-live-schedule-auto-fill"
    );
    const { rerender } = renderHook(
      (props) => useAdminLiveScheduleAutoFill(props),
      {
        initialProps: {
          enabled: true,
          sourceReady: true,
          snapshotVersion: "v1-retry",
          members,
          schedules,
        },
        wrapper: createQueryWrapper(),
      },
    );

    await waitFor(() =>
      expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());

    rerender({
      enabled: true,
      sourceReady: true,
      snapshotVersion: "v1-retry",
      members: [...members],
      schedules: [...schedules],
    });
    await waitFor(() =>
      expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(2),
    );
    consoleError.mockRestore();
  });
  it("같은 라이브라도 빈 일정이 새로 생기면 다시 보완한다", async () => {
    autoFillLiveSchedulesForMembersMock.mockResolvedValue({scheduleAutoFill: {updated: 0}});
    const { useAdminLiveScheduleAutoFill } = await import("./use-admin-live-schedule-auto-fill");
    const { rerender } = renderHook((props) => useAdminLiveScheduleAutoFill(props), {initialProps: {enabled: true, sourceReady: true, snapshotVersion: "same", members, schedules}, wrapper: createQueryWrapper()});
    await waitFor(() => expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(1));
    rerender({enabled: true, sourceReady: true, snapshotVersion: "same", members, schedules: [{...schedules[0], title: "", start_time: "13:00"}]});
    await waitFor(() => expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(2));
  });

  it("동일 데이터의 다음 조회 완료 시 실패한 요청을 재시도한다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    autoFillLiveSchedulesForMembersMock.mockRejectedValueOnce(new Error("expired")).mockResolvedValue({scheduleAutoFill: {updated: 0}});
    const { useAdminLiveScheduleAutoFill } = await import("./use-admin-live-schedule-auto-fill");
    const props = {enabled: true, sourceReady: true, snapshotVersion: "same", snapshotReceivedAt: 1, members, schedules};
    const { rerender } = renderHook((options) => useAdminLiveScheduleAutoFill(options), {initialProps: props, wrapper: createQueryWrapper()});
    await waitFor(() => expect(errorSpy).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    rerender({...props, snapshotReceivedAt: 2});
    await waitFor(() => expect(autoFillLiveSchedulesForMembersMock).toHaveBeenCalledTimes(2));
    errorSpy.mockRestore();
  });

});
