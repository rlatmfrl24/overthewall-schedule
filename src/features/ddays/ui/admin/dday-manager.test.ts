// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { DDayManager } from "./dday-manager";

const fetchDDaysMock = vi.hoisted(() => vi.fn());
const createDDayMock = vi.hoisted(() => vi.fn());
const updateDDayMock = vi.hoisted(() => vi.fn());
const deleteDDayMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/ddays", () => ({
  fetchDDays: fetchDDaysMock,
  createDDay: createDDayMock,
  updateDDay: updateDDayMock,
  deleteDDay: deleteDDayMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const makeDDay = (id: number, title: string) => ({
  id,
  title,
  date: "2026-07-28",
  description: null,
  color: "#f97316",
  colors: ["#f97316"],
  type: "event" as const,
  created_at: null,
});

describe("DDayManager", () => {
  beforeEach(() => {
    fetchDDaysMock.mockResolvedValue([makeDDay(2, "관리자 최신 D-Day")]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("공개 D-Day 캐시가 fresh여도 관리자 no-cache 조회를 수행한다", async () => {
    const queryClient = createTestQueryClient();
    const publicDDays = [makeDDay(1, "공개 캐시 D-Day")];
    queryClient.setQueryData(queryKeys.ddays.list(), publicDDays);

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    render(createElement(DDayManager), { wrapper });

    await waitFor(() =>
      expect(fetchDDaysMock).toHaveBeenCalledWith({ noCache: true }),
    );
    expect(fetchDDaysMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("관리자 최신 D-Day")).toBeTruthy();
    expect(screen.queryByText("공개 캐시 D-Day")).toBeNull();
    expect(queryClient.getQueryData(queryKeys.ddays.list())).toEqual(
      publicDDays,
    );
    expect(queryClient.getQueryData(queryKeys.ddays.admin())).toEqual([
      makeDDay(2, "관리자 최신 D-Day"),
    ]);
  });
});
