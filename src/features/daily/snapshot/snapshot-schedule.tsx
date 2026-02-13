import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { fetchSchedulesByDate } from "@/lib/api/schedules";
import type { ScheduleItem } from "@/lib/types";
import { SnapshotCardMember } from "./snapshot-card-member";
import { SnapshotTimeline } from "./snapshot-timeline";

interface SnapshotScheduleProps {
  date: string;
  mode: "grid" | "timeline";
}

export const SnapshotSchedule = ({ date, mode }: SnapshotScheduleProps) => {
  const { members, hasLoaded } = useScheduleData();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isSchedulesLoaded, setIsSchedulesLoaded] = useState(false);
  const [isSnapshotReady, setIsSnapshotReady] = useState(false);
  const snapshotWidth = mode === "timeline" ? 520 : 1280;

  const currentDate = useMemo(() => parseISO(date), [date]);

  useEffect(() => {
    let isActive = true;
    const fetchSchedules = async () => {
      try {
        const data = await fetchSchedulesByDate(date);
        if (isActive) {
          setSchedules(data);
        }
      } catch (error) {
        console.error("Failed to fetch snapshot schedules:", error);
      } finally {
        if (isActive) {
          setIsSchedulesLoaded(true);
        }
      }
    };
    void fetchSchedules();
    return () => {
      isActive = false;
    };
  }, [date]);

  useEffect(() => {
    if (!hasLoaded || !isSchedulesLoaded) return;
    let frame2: number | null = null;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        setIsSnapshotReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2 !== null) cancelAnimationFrame(frame2);
    };
  }, [hasLoaded, isSchedulesLoaded]);

  const schedulesByMemberUid = useMemo(() => {
    const grouped = new Map<number, ScheduleItem[]>();
    for (const schedule of schedules) {
      const existing = grouped.get(schedule.member_uid);
      if (existing) {
        existing.push(schedule);
      } else {
        grouped.set(schedule.member_uid, [schedule]);
      }
    }
    return grouped;
  }, [schedules]);

  const isReady = hasLoaded && isSchedulesLoaded && isSnapshotReady;

  return (
    <div
      data-snapshot-root="true"
      data-snapshot-ready={isReady ? "true" : "false"}
      className={cn(
        "inline-block bg-background text-foreground",
        mode === "timeline" ? "p-4" : "p-5",
      )}
    >
      <div className="flex flex-col gap-6" style={{ width: snapshotWidth }}>
        <div className="flex flex-col gap-2">
          <h1 className="text-[2.1rem] font-extrabold tracking-tight text-foreground">
            오늘의 편성표
          </h1>
          <p className="text-xl font-semibold text-muted-foreground">
            {format(currentDate, "yyyy년 M월 d일")}
          </p>
        </div>

        {mode === "timeline" ? (
          <SnapshotTimeline members={members} schedules={schedules} />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {members.map((member) => {
              const memberSchedules =
                schedulesByMemberUid.get(member.uid) ?? [];
              return (
                <SnapshotCardMember
                  key={`snapshot-${member.uid}`}
                  member={member}
                  schedules={memberSchedules}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
