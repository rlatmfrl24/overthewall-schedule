import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/shared/lib/utils";
import type { ScheduleItem } from "@/features/schedules";
import { useScheduleBoard } from "../../../queries/use-schedule-board";
import { SnapshotCardMember } from "./snapshot-card-member";
import { SnapshotTimeline } from "./snapshot-timeline";
import { SnapshotLegacy } from "./snapshot-legacy";
import { getSnapshotGeometry, type SnapshotDesign } from "./snapshot-options";
import { ScheduleUpdatedAt } from "../../components/schedule-updated-at";
import { useSnapshotFonts } from "./use-snapshot-fonts";
import { SnapshotFontContext, SNAPSHOT_FONT_FAMILY, SYSTEM_FONT_FAMILY } from "./snapshot-fonts";
import "./snapshot-timeline.css";

interface SnapshotScheduleProps {
  date: string;
  mode: "grid" | "timeline";
  theme?: "light" | "dark";
  design?: SnapshotDesign;
}

export const SnapshotSchedule = ({
  date,
  mode,
  theme,
  design = "poster",
}: SnapshotScheduleProps) => {
  const { board, members, schedules, hasLoaded } = useScheduleBoard(date, date);
  const rootRef = useRef<HTMLDivElement>(null);
  const fontMode = useSnapshotFonts(rootRef);
  const effectiveDesign = mode === "grid" ? "poster" : design;
  const legacy = mode === "timeline" && effectiveDesign === "legacy";
  const renderKey = useMemo(() => ({ date, mode, theme, design: effectiveDesign, fontMode, board }), [date, mode, theme, effectiveDesign, fontMode, board]);
  const [readyKey, setReadyKey] = useState<typeof renderKey | null>(null);
  const geometry = getSnapshotGeometry(mode, effectiveDesign);

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
        data-snapshot-design={effectiveDesign}
        style={{ padding: geometry.padding, fontFamily: fontMode === "web" ? (mode === "timeline" ? '"OTW Snapshot Pretendard", sans-serif' : SNAPSHOT_FONT_FAMILY) : SYSTEM_FONT_FAMILY }}
        className={cn(
          "inline-block bg-background text-foreground",
          mode === "timeline" ? (legacy ? "snapshot-legacy" : "snapshot-timetable") : "p-5",
        )}
      >
        <div
          className={cn("flex flex-col", mode === "timeline" ? (legacy ? "gap-3" : "snapshot-sheet") : "gap-5")}
          style={{ width: geometry.contentWidth }}
        >
          {legacy ? <SnapshotLegacy date={date} members={members} schedules={schedules} updatedAt={board?.updatedAt} /> : <><SnapshotHeader
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
              <footer className="snapshot-footer">
                <div className="snapshot-footer-meta">
                  <ScheduleUpdatedAt updatedAt={board?.updatedAt} label="최종 편집" className="snapshot-updated" />
                  <span className="snapshot-footer-domain">otw-schedule.info</span>
                </div>
                <p>한국시간(KST) 기준 · 일정은 변경될 수 있습니다</p>
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
          )}</>}
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
      <header className="snapshot-heading">
        <div className="snapshot-brand-row">
          <h1>오늘의 편성표</h1>
          <img
            src="/logo_otw.svg"
            width={76}
            height={25}
            alt="오버더월"
            className="snapshot-logo"
          />
        </div>
        <div className="snapshot-date" aria-label={`편성표 날짜 ${dateLabel}`}>
          <div>
            <p className="snapshot-date-year">{format(parseISO(dateValue), "yyyy년")}</p>
            <time dateTime={dateValue} className="snapshot-date-day">{format(parseISO(dateValue), "MM.dd")}</time>
          </div>
          <div className="snapshot-date-aside">
            <span className="snapshot-date-weekday">{format(parseISO(dateValue), "EEEE", { locale: ko })}</span>
          </div>
        </div>
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
