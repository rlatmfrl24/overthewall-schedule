// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { DDayManager } from "./dday-manager";
import { ApiError } from "@/shared/api/client";

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
      expect(fetchDDaysMock).toHaveBeenCalledWith({ noCache: true,includeArchived:true }),
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
  it("기존 설명을 비우면 null로 저장하고 목록을 다시 조회한다", async () => {
    fetchDDaysMock.mockResolvedValue([{...makeDDay(2, "설명 제거"), description: "기존 설명"}]);
    updateDDayMock.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    const wrapper = ({children}: {children: ReactNode}) => createElement(QueryClientProvider, {client: queryClient}, children);
    render(createElement(DDayManager), {wrapper});
    fireEvent.click(await screen.findByTitle("수정"));
    fireEvent.change(screen.getByLabelText("설명 (선택)"), {target: {value: ""}});
    fireEvent.click(screen.getByRole("button", {name: "수정 완료"}));
    await waitFor(() => expect(updateDDayMock).toHaveBeenCalledWith(expect.objectContaining({id: 2, description: null}),expect.any(String)));
    await waitFor(() => expect(fetchDDaysMock).toHaveBeenCalledTimes(2));
  });
  it.each(["CONTENT_MOVED","CONTENT_CONFLICT"])("keeps the draft and original key after %s",async code=>{
    updateDDayMock.mockRejectedValue(new ApiError(`실제 ${code} 안내`,409,{code}));
    const client=createTestQueryClient();
    render(createElement(QueryClientProvider,{client},createElement(DDayManager)));
    fireEvent.click(await screen.findByTitle("수정"));
    fireEvent.change(screen.getByLabelText("설명 (선택)"),{target:{value:"유지할 내용"}});
    fireEvent.click(screen.getByRole("button",{name:"수정 완료"}));
    expect((await screen.findByRole("alert")).textContent).toContain(`실제 ${code} 안내`);
    expect((screen.getByLabelText("설명 (선택)") as HTMLTextAreaElement).value).toBe("유지할 내용");
    const original=updateDDayMock.mock.calls[0][1];expect(original).toMatch(/^[a-f0-9-]{36}$/);
    fireEvent.click(screen.getByRole("button",{name:"수정 완료"}));
    await waitFor(()=>expect(updateDDayMock).toHaveBeenCalledTimes(2));expect(updateDDayMock.mock.calls[1][1]).toBe(original);
    fireEvent.change(screen.getByLabelText("설명 (선택)"),{target:{value:"변경된 내용"}});
    fireEvent.click(screen.getByRole("button",{name:"수정 완료"}));
    await waitFor(()=>expect(updateDDayMock).toHaveBeenCalledTimes(3));expect(updateDDayMock.mock.calls[2][1]).not.toBe(original);
  });

});
