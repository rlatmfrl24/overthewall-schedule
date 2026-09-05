import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";

export const invalidateDDayConsumers = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({queryKey: queryKeys.operations.all}),
    queryClient.invalidateQueries({queryKey: queryKeys.settings.all}),
    queryClient.invalidateQueries({ queryKey: queryKeys.ddays.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all }),
  ]);
