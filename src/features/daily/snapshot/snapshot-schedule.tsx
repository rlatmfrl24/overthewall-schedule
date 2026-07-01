import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useScheduleBoard } from "@/hooks/use-schedule-board";
import type { ScheduleItem } from "@/lib/types";
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
  const [isSnapshotReady, setIsSnapshotReady] = useState(false);
  const snapshotWidth = mode === "timeline" ? 520 : 1280;

  const currentDate = useMemo(() => parseISO(date), [date]);

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
    setIsSnapshotReady(false);
    if (!hasLoaded) return;
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
  }, [date, hasLoaded, members.length, schedules.length]);

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

  const isReady = hasLoaded && isSnapshotReady;

  return (
    <div
      data-snapshot-root="true"
      data-snapshot-ready={isReady ? "true" : "false"}
      className={cn(
        "inline-block bg-background text-foreground",
        mode === "timeline" ? "p-3" : "p-5",
      )}
    >
      <div
        className={cn("flex flex-col", mode === "timeline" ? "gap-3" : "gap-5")}
        style={{ width: snapshotWidth }}
      >
        <SnapshotHeader
          dateLabel={format(currentDate, "yyyy년 M월 d일")}
          dateValue={date}
          mode={mode}
        />

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

function SnapshotHeader({
  dateLabel,
  dateValue,
  mode,
}: {
  dateLabel: string;
  dateValue: string;
  mode: "grid" | "timeline";
}) {
  return (
    <header
      className={cn(
        "overflow-hidden border border-zinc-200/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-zinc-950 dark:shadow-[0_18px_42px_rgba(0,0,0,0.34)]",
        mode === "timeline" ? "rounded-[24px] p-3" : "rounded-[28px] p-5",
      )}
    >
      <div
        className={cn(
          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center",
          mode === "timeline" ? "gap-3" : "gap-4",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/15",
            mode === "timeline" ? "h-11 w-[76px]" : "h-14 w-24",
          )}
        >
          <img
            src="/logo_otw.svg"
            width={90}
            height={25}
            alt="오버더월"
            className={cn(
              "h-auto shrink-0",
              mode === "timeline" ? "w-16" : "w-20",
            )}
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={cn(
                "font-black uppercase leading-none text-zinc-500 dark:text-zinc-400",
                mode === "timeline"
                  ? "text-[10px] tracking-[0.14em]"
                  : "text-[11px] tracking-[0.18em]",
              )}
            >
              OTW Schedule
            </p>
            <span
              aria-hidden="true"
              className="text-[10px] font-black leading-none text-zinc-300 dark:text-zinc-600"
            >
              /
            </span>
            <SnapshotDateText
              value={dateLabel}
              dateTime={dateValue}
              compact={mode === "timeline"}
            />
          </div>
          <h1
            className={cn(
              "mt-1 truncate font-black leading-none text-zinc-950 dark:text-zinc-50",
              mode === "timeline" ? "text-[1.75rem]" : "text-[2.45rem]",
            )}
          >
            오늘의 편성표
          </h1>
        </div>
      </div>
    </header>
  );
}

function SnapshotDateText({
  value,
  dateTime,
  compact = false,
}: {
  value: string;
  dateTime: string;
  compact?: boolean;
}) {
  return (
    <p
      aria-label={`편성표 날짜 ${value}`}
      className={cn(
        "shrink-0 whitespace-nowrap font-black leading-none tabular-nums text-zinc-500 dark:text-zinc-300",
        compact ? "text-[0.74rem]" : "text-sm",
      )}
    >
      <time dateTime={dateTime}>{value}</time>
    </p>
  );
}
