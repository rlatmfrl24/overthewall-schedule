import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";

export const invalidateNoticeConsumers = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({queryKey: queryKeys.operations.all}),
    queryClient.invalidateQueries({queryKey: queryKeys.settings.all}),
    queryClient.invalidateQueries({ queryKey: queryKeys.notices.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all }),
  ]);
