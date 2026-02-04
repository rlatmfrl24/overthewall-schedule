import type { ScheduleItem } from "@/lib/types";
import { Clock } from "lucide-react";

interface SnapshotCardScheduleProps {
  schedule: ScheduleItem;
}

export const SnapshotCardSchedule = ({
  schedule,
}: SnapshotCardScheduleProps) => {
  return (
    <div className="group/schedule relative flex flex-col rounded-2xl bg-card shadow-sm transition-all duration-200 gap-2 p-5 border border-border/40">
      <div className="flex items-center justify-start gap-2">
        {schedule.start_time && (
          <div className="flex items-center text-xl font-bold text-foreground/80 tracking-tight">
            <Clock size={20} className="mr-1.5" />
            {schedule.start_time}
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-foreground line-clamp-2 leading-tight tracking-tight">
        {schedule.title || "방송 예정"}
      </p>
    </div>
  );
};
