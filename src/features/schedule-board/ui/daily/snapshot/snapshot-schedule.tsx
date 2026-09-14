import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/shared/lib/utils";
import type { ScheduleItem } from "@/features/schedules";
import { useScheduleBoard } from "../../../queries/use-schedule-board";
import { SnapshotCardMember } from "./snapshot-card-member";
import { SnapshotTimeline } from "./snapshot-timeline";
import { ScheduleUpdatedAt } from "../../components/schedule-updated-at";
import { useSnapshotFonts } from "./use-snapshot-fonts";
import { SnapshotFontContext, SNAPSHOT_FONT_FAMILY, SYSTEM_FONT_FAMILY } from "./snapshot-fonts";

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
  const { board, members, schedules, hasLoaded } = useScheduleBoard(date, date);
  const rootRef = useRef<HTMLDivElement>(null);
  const fontMode = useSnapshotFonts(rootRef);
  const renderKey = useMemo(() => ({ date, mode, theme, fontMode, board }), [date, mode, theme, fontMode, board]);
  const [readyKey, setReadyKey] = useState<typeof renderKey | null>(null);
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
    setReadyKey(null);
    if (!hasLoaded || fontMode === "loading") return;
    let cancelled = false;
    let frame1: number | null = null;
    let frame2: number | null = null;

    const markSnapshotReady = () => {
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          if (!cancelled) setReadyKey(renderKey);
        });
      });
    };

    void markSnapshotReady();

    return () => {
      cancelled = true;
      if (frame1 !== null) cancelAnimationFrame(frame1);
      if (frame2 !== null) cancelAnimationFrame(frame2);
    };
  }, [renderKey, hasLoaded, fontMode]);

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

  const isReady = hasLoaded && fontMode !== "loading" && readyKey === renderKey;

  return (
    <SnapshotFontContext value={fontMode}>
      <div
        ref={rootRef}
        data-snapshot-root="true"
        data-snapshot-ready={isReady ? "true" : "false"}
        data-snapshot-font-mode={fontMode}
        style={{ fontFamily: fontMode === "web" ? SNAPSHOT_FONT_FAMILY : SYSTEM_FONT_FAMILY }}
        className={cn(
          "inline-block bg-background text-foreground",
          mode === "timeline" ? "bg-zinc-50 p-3 dark:bg-zinc-950" : "p-5",
        )}
      >
        <div
          className={cn("flex flex-col", mode === "timeline" ? "gap-3" : "gap-5")}
          style={{ width: snapshotWidth }}
        >
          <SnapshotHeader
            dateLabel={format(
              currentDate,
              mode === "timeline" ? "yyyy년 M월 d일 EEEE" : "yyyy년 M월 d일",
              { locale: ko },
            )}
            dateValue={date}
            mode={mode}
            updatedAt={board?.updatedAt}
          />

          {mode === "timeline" ? (
            <>
              <SnapshotTimeline members={members} schedules={schedules} />
              <footer className="flex items-center justify-between gap-3 px-1 pt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                <span>한국시간(KST) 기준 · 일정은 변경될 수 있습니다</span>
                <span className="shrink-0 font-semibold">otw-schedule.info</span>
              </footer>
            </>
          ) : (
            <div className="grid grid-cols-3 items-start gap-4">
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
    </SnapshotFontContext>
  );
};

function SnapshotHeader({
  dateLabel,
  dateValue,
  mode,
  updatedAt,
}: {
  dateLabel: string;
  dateValue: string;
  mode: "grid" | "timeline";
  updatedAt: string | null | undefined;
}) {
  if (mode === "timeline") {
    return (
      <header className="rounded-2xl border border-zinc-200 border-t-4 border-t-teal-600 bg-white px-5 py-4 dark:border-zinc-800 dark:border-t-teal-400 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50">
            오늘의 편성표
          </h1>
          <img
            src="/logo_otw.svg"
            width={76}
            height={25}
            alt="오버더월"
            className="h-auto w-[76px] shrink-0"
          />
        </div>
        <p
          className="mt-3 text-[20px] font-bold leading-snug tracking-tight text-teal-800 dark:text-teal-200"
          aria-label={`편성표 날짜 ${dateLabel}`}
        >
          <time dateTime={dateValue}>{dateLabel}</time>
        </p>
        <ScheduleUpdatedAt
          updatedAt={updatedAt}
          label="최종 편집"
          className="mt-2 justify-start text-[11px] text-zinc-600 dark:text-zinc-400"
        />
      </header>
    );
  }

  return (
    <header
      className={cn(
        "overflow-hidden border border-zinc-200/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-zinc-950 dark:shadow-[0_18px_42px_rgba(0,0,0,0.34)]",
        "rounded-[22px] p-3.5",
      )}
    >
      <div
        className={cn(
          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center",
          "gap-4",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/15",
            "h-12 w-[84px]",
          )}
        >
          <img
            src="/logo_otw.svg"
            width={90}
            height={25}
            alt="오버더월"
            className={cn(
              "h-auto shrink-0",
              "w-[72px]",
            )}
          />
        </div>
        <div className="min-w-0">
          <h1
            className={cn(
              "max-w-full break-keep font-black leading-tight text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-50",
              "text-[1.9rem]",
            )}
          >
            오늘의 편성표
          </h1>
          <div className={cn("mt-1.5")}>
            <SnapshotDateText
              value={dateLabel}
              dateTime={dateValue}
              compact={false}
            />
          </div>
        </div>
        <ScheduleUpdatedAt
          updatedAt={updatedAt}
          label="최종 편집"
          stacked
          className={cn(
            "shrink-0 justify-self-end gap-1 text-zinc-600 dark:text-zinc-300",
            "text-[12px]",
          )}
        />
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
        compact ? "text-[13px]" : "text-[15px]",
      )}
    >
      <time dateTime={dateTime}>{value}</time>
    </p>
  );
}
