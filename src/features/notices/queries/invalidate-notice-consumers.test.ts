import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { invalidateNoticeConsumers } from "./invalidate-notice-consumers";

describe("invalidateNoticeConsumers", () => {
  it("공지와 schedule-board aggregate query를 함께 무효화한다", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await invalidateNoticeConsumers(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.notices.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.schedules.all,
    });
  });
});
