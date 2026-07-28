import { QueryClient, type QueryState } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/shared/query/query-keys";
import { invalidateDDayConsumers } from "./invalidate-dday-consumers";

describe("invalidateDDayConsumers", () => {
  it("D-Day와 schedule-board aggregate query를 함께 무효화한다", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await invalidateDDayConsumers(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.ddays.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.schedules.all,
    });
  });

  it("공개 목록과 관리자 목록 캐시를 모두 stale 상태로 만든다", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.ddays.list(), [{ id: 1 }]);
    queryClient.setQueryData(queryKeys.ddays.admin(), [{ id: 2 }]);

    await invalidateDDayConsumers(queryClient);

    const getState = (queryKey: readonly unknown[]) =>
      queryClient.getQueryState(queryKey) as QueryState | undefined;

    expect(getState(queryKeys.ddays.list())?.isInvalidated).toBe(true);
    expect(getState(queryKeys.ddays.admin())?.isInvalidated).toBe(true);
  });
});
