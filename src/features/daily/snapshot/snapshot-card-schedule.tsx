import type { ScheduleItem } from "@/lib/types";
import { Clock } from "lucide-react";

interface SnapshotCardScheduleProps {
  schedule: ScheduleItem;
}

export const SnapshotCardSchedule = ({
  schedule,
}: SnapshotCardScheduleProps) => {
  return (
    <div className="group/schedule relative flex flex-col rounded-xl bg-card shadow-sm transition-all duration-200 gap-1 p-2 border border-border/40">
      <div className="flex items-center justify-start gap-2">
        {schedule.start_time && (
          <div className="flex items-center text-base font-medium text-foreground/80">
            <Clock size={14} className="mr-1" />
            {schedule.start_time}
          </div>
        )}
      </div>
      <p className="text-lg sm:text-[1.2rem] font-bold text-foreground line-clamp-2 leading-snug">
        {schedule.title || "방송 예정"}
      </p>
    </div>
  );
};
