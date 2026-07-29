import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
import { autoFillLiveSchedulesForMembers } from "@/features/chzzk";
import { queryKeys } from "@/shared/query/query-keys";

type AdminLiveScheduleAutoFillOptions = {
  enabled: boolean;
  sourceReady: boolean;
  sourceUpdatedAt: number;
  members: MemberDto[];
  schedules: ScheduleDto[];
};

export function useAdminLiveScheduleAutoFill({
  enabled,
  sourceReady,
  sourceUpdatedAt,
  members,
  schedules,
}: AdminLiveScheduleAutoFillOptions) {
  const queryClient = useQueryClient();
  const lastSourceUpdatedAtRef = useRef(0);

  useEffect(() => {
    if (
      !enabled ||
      !sourceReady ||
      sourceUpdatedAt === 0 ||
      lastSourceUpdatedAtRef.current === sourceUpdatedAt
    ) {
      return;
    }
    lastSourceUpdatedAtRef.current = sourceUpdatedAt;

    void autoFillLiveSchedulesForMembers(members, { schedules })
      .then(async (result) => {
        if (result.scheduleAutoFill.updated === 0) return;
        await queryClient.invalidateQueries({
          queryKey: queryKeys.schedules.all,
        });
      })
      .catch((error) => {
        console.error("Failed to auto-fill live schedules:", error);
      });
  }, [
    enabled,
    members,
    queryClient,
    schedules,
    sourceReady,
    sourceUpdatedAt,
  ]);
}
