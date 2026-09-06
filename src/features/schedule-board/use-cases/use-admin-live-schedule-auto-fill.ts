import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
import { autoFillLiveSchedulesForMembers } from "@/features/chzzk";
import { queryKeys } from "@/shared/query/query-keys";

type AdminLiveScheduleAutoFillOptions = {
  enabled: boolean;
  sourceReady: boolean;
  snapshotReceivedAt?: number;
  snapshotVersion: string | null;
  members: MemberDto[];
  schedules: ScheduleDto[];
};

export function useAdminLiveScheduleAutoFill({
  enabled,
  sourceReady,
  snapshotVersion,
  snapshotReceivedAt,
  members,
  schedules,
}: AdminLiveScheduleAutoFillOptions) {
  const queryClient = useQueryClient();
  const lastRequestKeyRef = useRef<string | null>(null);
  const inFlightRequestKeyRef = useRef<string | null>(null);

  const requestKey = JSON.stringify([snapshotVersion,
    members.map((member) => [member.uid, member.url_chzzk]),
    schedules.map((schedule) => [schedule.id, schedule.member_uid, schedule.date, schedule.status, schedule.start_time, schedule.title]),
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !sourceReady ||
      !snapshotVersion ||
      lastRequestKeyRef.current === requestKey ||
      inFlightRequestKeyRef.current === requestKey
    ) {
      return;
    }
    inFlightRequestKeyRef.current = requestKey;

    void autoFillLiveSchedulesForMembers(members, {
      schedules,
      snapshotVersion,
    })
      .then(async (result) => {
        if (inFlightRequestKeyRef.current === requestKey) {
          lastRequestKeyRef.current = requestKey;
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
        if (inFlightRequestKeyRef.current === requestKey) {
          inFlightRequestKeyRef.current = null;
        }
      });
  }, [
    enabled,
    members,
    queryClient,
    schedules,
    sourceReady,
    snapshotVersion,
    snapshotReceivedAt,
    requestKey,
  ]);
}
