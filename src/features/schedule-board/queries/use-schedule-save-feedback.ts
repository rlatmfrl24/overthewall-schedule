import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveScheduleWithConflicts } from "@/features/schedules";
import { queryKeys } from "@/shared/query/query-keys";

type SaveInput = Parameters<typeof saveScheduleWithConflicts>[0];
export type ScheduleSaveFeedback = SaveInput & {
  scheduleId: number | null;
  deletedCount: number;
  refresh: "pending" | "ready" | "failed";
};

export function useScheduleSaveFeedback() {
  const queryClient = useQueryClient();
  const latestSave = useRef<ScheduleSaveFeedback | null>(null);
  const [feedback, setFeedback] = useState<ScheduleSaveFeedback | null>(null);

  const refreshSchedules = async (saved: ScheduleSaveFeedback) => {
    const update = (refresh: ScheduleSaveFeedback["refresh"]) => {
      setFeedback((current) => current && latestSave.current === saved
        ? { ...current, refresh } : current);
    };
    update("pending");
    try {
      await queryClient.invalidateQueries(
        { queryKey: queryKeys.schedules.all },
        { throwOnError: true },
      );
      update("ready");
    } catch {
      // The write already succeeded. Retrying this action must only read.
      update("failed");
    }
  };

  const save = async (data: SaveInput) => {
    const result = await saveScheduleWithConflicts(data);
    if (!result.success) throw new Error("Schedule save failed");
    const saved: ScheduleSaveFeedback = {
      ...data,
      scheduleId: result.scheduleId,
      deletedCount: result.deletedIds.length,
      refresh: "pending",
    };
    latestSave.current = saved;
    setFeedback(saved);
    void refreshSchedules(saved);
  };

  return {
    save,
    feedback,
    dismiss: () => { latestSave.current = null; setFeedback(null); },
    retryRefresh: () => { if (latestSave.current) void refreshSchedules(latestSave.current); },
  };
}
