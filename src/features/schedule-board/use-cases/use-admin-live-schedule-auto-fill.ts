import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
import { autoFillLiveSchedulesForMembers } from "@/features/chzzk";
import { queryKeys } from "@/shared/query/query-keys";

type AdminLiveScheduleAutoFillOptions = {
  enabled: boolean;
  sourceReady: boolean;
  snapshotVersion: string | null;
  members: MemberDto[];
  schedules: ScheduleDto[];
};

export function useAdminLiveScheduleAutoFill({
  enabled,
  sourceReady,
  snapshotVersion,
  members,
  schedules,
}: AdminLiveScheduleAutoFillOptions) {
  const queryClient = useQueryClient();
  const lastSnapshotVersionRef = useRef<string | null>(null);
  const inFlightSnapshotVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      !sourceReady ||
      !snapshotVersion ||
      lastSnapshotVersionRef.current === snapshotVersion ||
      inFlightSnapshotVersionRef.current === snapshotVersion
    ) {
      return;
    }
    inFlightSnapshotVersionRef.current = snapshotVersion;

    void autoFillLiveSchedulesForMembers(members, {
      schedules,
      snapshotVersion,
    })
      .then(async (result) => {
        if (inFlightSnapshotVersionRef.current === snapshotVersion) {
          lastSnapshotVersionRef.current = snapshotVersion;
        }
        if (result.scheduleAutoFill.updated === 0) return;
        await queryClient.invalidateQueries({
          queryKey: queryKeys.schedules.all,
        });
      })
      .catch((error) => {
        console.error("Failed to auto-fill live schedules:", error);
      })
      .finally(() => {
        if (inFlightSnapshotVersionRef.current === snapshotVersion) {
          inFlightSnapshotVersionRef.current = null;
        }
      });
  }, [
    enabled,
    members,
    queryClient,
    schedules,
    sourceReady,
    snapshotVersion,
  ]);
}
