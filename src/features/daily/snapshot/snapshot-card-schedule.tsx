import type { ScheduleItem } from "@/lib/types";
import { CardSchedule } from "../card-schedule";

interface SnapshotCardScheduleProps {
  schedule: ScheduleItem;
  accentColor?: string;
}

export const SnapshotCardSchedule = ({
  schedule,
  accentColor,
}: SnapshotCardScheduleProps) => (
  <CardSchedule schedule={schedule} accentColor={accentColor} compact />
);
