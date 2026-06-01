import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useScheduleBoard } from "@/hooks/use-schedule-board";
import { fetchLiveStatusesForMembers } from "@/lib/api/live-status";
import type { ChzzkLiveStatusMap, ScheduleItem } from "@/lib/types";
import { SnapshotCardMember } from "./snapshot-card-member";
import { SnapshotTimeline } from "./snapshot-timeline";

interface SnapshotScheduleProps {
  date: string;
  mode: "grid" | "timeline";
  theme?: "light" | "dark";
}

export const SnapshotSchedule = ({
  date,
  mode,
  theme,
}: SnapshotScheduleProps) => {
  const { members, schedules, hasLoaded } = useScheduleBoard(date, date);
  const [liveStatuses, setLiveStatuses] = useState<ChzzkLiveStatusMap>({});
  const [isLiveStatusesLoaded, setIsLiveStatusesLoaded] = useState(false);
  const [isSnapshotReady, setIsSnapshotReady] = useState(false);
  const snapshotWidth = mode === "timeline" ? 520 : 1280;

  const currentDate = useMemo(() => parseISO(date), [date]);
  const isSnapshotToday = useMemo(
    () => isSameDay(currentDate, new Date()),
    [currentDate],
  );

  useEffect(() => {
    let isActive = true;

    const fetchLiveStatuses = async () => {
      if (!hasLoaded) {
        setIsLiveStatusesLoaded(false);
        return;
      }

      setLiveStatuses({});
      setIsLiveStatusesLoaded(false);
      setIsSnapshotReady(false);

      if (!isSnapshotToday || members.length === 0) {
        if (isActive) {
          setIsLiveStatusesLoaded(true);
        }
        return;
      }

      try {
        const data = await fetchLiveStatusesForMembers(members, { schedules });
        if (isActive) {
          setLiveStatuses(data);
        }
      } catch (error) {
        console.error("Failed to fetch snapshot live statuses:", error);
      } finally {
        if (isActive) {
          setIsLiveStatusesLoaded(true);
        }
      }
    };

    void fetchLiveStatuses();

    return () => {
      isActive = false;
    };
  }, [hasLoaded, isSnapshotToday, members, schedules]);

  useEffect(() => {
    if (!theme) return;

    const root = window.document.documentElement;
    const hadLight = root.classList.contains("light");
    const hadDark = root.classList.contains("dark");

    root.classList.remove("light", "dark");
    root.classList.add(theme);

    return () => {
      root.classList.remove("light", "dark");
      if (hadLight) root.classList.add("light");
      if (hadDark) root.classList.add("dark");
    };
  }, [theme]);

  useEffect(() => {
    if (!hasLoaded || !isLiveStatusesLoaded) return;
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
  }, [hasLoaded, isLiveStatusesLoaded]);

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

  const isReady = hasLoaded && isLiveStatusesLoaded && isSnapshotReady;

  return (
    <div
      data-snapshot-root="true"
      data-snapshot-ready={isReady ? "true" : "false"}
      className={cn(
        "inline-block bg-background text-foreground",
        mode === "timeline" ? "p-4" : "p-5",
      )}
    >
      <div
        className={cn("flex flex-col", mode === "timeline" ? "gap-4" : "gap-5")}
        style={{ width: snapshotWidth }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-[2rem] font-extrabold leading-none tracking-tight text-foreground">
            오늘의 편성표
          </h1>
          <p className="min-w-0 truncate text-lg font-bold leading-none text-muted-foreground">
            {format(currentDate, "yyyy년 M월 d일")}
          </p>
        </div>

        {mode === "timeline" ? (
          <SnapshotTimeline
            members={members}
            schedules={schedules}
            liveStatuses={liveStatuses}
          />
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
                  liveStatus={liveStatuses[member.uid]}
                  theme={theme}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
