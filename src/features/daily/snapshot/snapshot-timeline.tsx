import { useMemo } from "react";
import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Calendar, HelpCircle, Moon, Signal, Zap } from "lucide-react";
import { useAutoFitText } from "./use-auto-fit-text";
import {
  buildNoScheduleMemberEntries,
  buildScheduleBoardModel,
  formatScheduleTime,
  getScheduleDisplayTitle,
  hasScheduleBoardItems,
  type NoScheduleMemberEntry,
  type ScheduleBoardEntry,
  type ScheduleSideGroupKey,
} from "../chronological-schedule-utils";

interface SnapshotTimelineProps {
  members: Member[];
  schedules: ScheduleItem[];
  liveStatuses?: ChzzkLiveStatusMap;
}

const sideGroupMeta: Record<
  ScheduleSideGroupKey,
  {
    title: string;
    icon: typeof Zap;
    className: string;
  }
> = {
  guerrilla: {
    title: "게릴라 예정",
    icon: Zap,
    className: "text-amber-700 bg-amber-50 border-amber-200",
  },
  undecided: {
    title: "미정",
    icon: HelpCircle,
    className: "text-slate-700 bg-slate-50 border-slate-200",
  },
  off: {
    title: "휴방",
    icon: Moon,
    className: "text-zinc-700 bg-zinc-50 border-zinc-200",
  },
};

export const SnapshotTimeline = ({
  members,
  schedules,
  liveStatuses = {},
}: SnapshotTimelineProps) => {
  const boardModel = useMemo(
    () => buildScheduleBoardModel(schedules, liveStatuses),
    [schedules, liveStatuses],
  );
  const noScheduleEntries = useMemo(
    () => buildNoScheduleMemberEntries(members, schedules, liveStatuses),
    [members, schedules, liveStatuses],
  );

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  if (!hasScheduleBoardItems(boardModel) && noScheduleEntries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-none mx-0 px-0">
      {boardModel.mainItems.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)] dark:border-zinc-700 dark:bg-zinc-900">
          <div className="grid min-h-10 grid-cols-[86px_1fr] items-center border-b border-zinc-200 bg-zinc-50 text-xs font-extrabold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="flex h-full items-center justify-center text-center">
              시간
            </span>
            <span className="flex h-full items-center px-4 text-left">
              멤버 / 일정
            </span>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {boardModel.mainItems.map((entry) => {
              const member = memberMap.get(entry.schedule.member_uid);
              if (!member) return null;
              return (
                <SnapshotScheduleRow
                  key={entry.schedule.id}
                  entry={entry}
                  member={member}
                />
              );
            })}
          </div>
        </div>
      )}

      {(Object.keys(sideGroupMeta) as ScheduleSideGroupKey[]).map((key) => {
        const items = boardModel.sideGroups[key];
        if (items.length === 0) return null;
        return (
          <SnapshotSideGroup
            key={key}
            groupKey={key}
            items={items}
            memberMap={memberMap}
          />
        );
      })}

      {noScheduleEntries.length > 0 && (
        <SnapshotNoScheduleGroup entries={noScheduleEntries} />
      )}
    </div>
  );
};

const SnapshotScheduleRow = ({
  entry,
  member,
}: {
  entry: ScheduleBoardEntry;
  member: Member;
}) => {
  const title = getScheduleDisplayTitle(entry.schedule);
  const mainColor = member.main_color || "#14b8a6";
  const { textRef, textStyle } = useAutoFitText<HTMLHeadingElement>({
    contentKey: `${entry.schedule.id}:${title}:snapshot-main`,
    maxLines: 2,
    minFontSizePx: 14,
    stepPx: 1,
  });

  return (
    <div className="grid min-h-[68px] grid-cols-[86px_1fr] items-center">
      <div className="flex h-full items-center justify-center border-r border-zinc-200 bg-zinc-50/70 px-3 dark:border-zinc-700 dark:bg-zinc-800/60">
        <span className="font-mono text-lg font-black tabular-nums text-zinc-800 dark:text-zinc-100">
          {formatScheduleTime(entry.schedule.start_time)}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3 px-4 py-3">
        <span
          className="h-9 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: mainColor }}
        />
        <img
          src={`/profile/${member.code}.webp`}
          alt={member.name}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
        />
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p
              className="min-w-0 truncate text-sm font-extrabold"
              style={{ color: mainColor }}
            >
              {member.name}
            </p>
            {member.unit_name && (
              <span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-black leading-none text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {member.unit_name}
              </span>
            )}
          </div>
          <h3
            ref={textRef}
            style={textStyle}
            className="whitespace-normal break-words text-lg font-black leading-tight text-zinc-950 dark:text-zinc-50"
          >
            {title}
          </h3>
        </div>
      </div>
    </div>
  );
};

const SnapshotSideGroup = ({
  groupKey,
  items,
  memberMap,
}: {
  groupKey: ScheduleSideGroupKey;
  items: ScheduleBoardEntry[];
  memberMap: Map<number, Member>;
}) => {
  const meta = sideGroupMeta[groupKey];
  const Icon = meta.icon;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)] dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex min-h-11 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 dark:border-zinc-700 dark:bg-zinc-800">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg border",
            meta.className,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50">
          {meta.title}
        </h3>
        <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-xs font-black text-zinc-600">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {items.map((entry) => {
          const member = memberMap.get(entry.schedule.member_uid);
          if (!member) return null;
          const time = formatScheduleTime(entry.schedule.start_time);
          return (
            <div
              key={entry.schedule.id}
              className="grid min-h-[58px] grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-3"
            >
              <img
                src={`/profile/${member.code}.webp`}
                alt={member.name}
                className="h-9 w-9 rounded-full object-cover ring-1 ring-zinc-200"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-zinc-950 dark:text-zinc-50">
                  {member.name}
                </p>
                <p className="whitespace-normal break-words text-xs font-semibold text-zinc-500 dark:text-zinc-300">
                  {getScheduleDisplayTitle(entry.schedule)}
                </p>
              </div>
              {time && (
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-300">
                  {time}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const SnapshotNoScheduleGroup = ({
  entries,
}: {
  entries: NoScheduleMemberEntry[];
}) => {
  const liveCount = entries.filter((entry) => entry.isLive).length;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)] dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex min-h-11 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 dark:border-zinc-700 dark:bg-zinc-800">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <Calendar className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50">
          일정 없음
        </h3>
        <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-xs font-black text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
          {entries.length}
        </span>
        {liveCount > 0 && (
          <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            미등록 LIVE {liveCount}
          </span>
        )}
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {entries.map((entry) => (
          <SnapshotNoScheduleItem
            key={`snapshot-no-schedule-${entry.member.uid}`}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
};

const SnapshotNoScheduleItem = ({
  entry,
}: {
  entry: NoScheduleMemberEntry;
}) => {
  const liveTitle = entry.liveStatus?.liveTitle?.trim();

  return (
    <div
      className={cn(
        "grid min-h-[58px] grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-2.5",
        entry.isLive &&
          "border-l-4 border-red-500 bg-red-50/90 dark:bg-red-950/30",
      )}
    >
      <img
        src={`/profile/${entry.member.code}.webp`}
        alt={entry.member.name}
        className={cn(
          "h-9 w-9 rounded-full object-cover ring-1 ring-zinc-200",
          entry.isLive && "ring-2 ring-red-300 dark:ring-red-700",
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-black leading-tight text-zinc-950 dark:text-zinc-50">
            {entry.member.name}
          </p>
          {entry.isLive && (
            <span className="shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
              미등록 LIVE
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-0.5 whitespace-normal break-words text-xs leading-tight",
            entry.isLive
              ? "font-black text-red-800 dark:text-red-100"
              : "font-semibold text-zinc-500 dark:text-zinc-300",
          )}
        >
          {entry.isLive
            ? liveTitle || "편성표에 없는 방송이 진행 중입니다"
            : "오늘 등록된 일정이 없습니다"}
        </p>
      </div>
      {entry.isLive && (
        <Signal className="h-4 w-4 text-red-600 dark:text-red-300" />
      )}
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-20 bg-muted/5 border-2 border-dashed border-muted rounded-3xl">
    <div className="p-4 bg-muted/20 rounded-full mb-4">
      <Calendar className="w-8 h-8 text-muted-foreground/60" />
    </div>
    <p className="text-muted-foreground font-medium text-lg">일정이 없습니다</p>
    <p className="text-sm text-muted-foreground/50">
      새로운 일정이 등록될 때까지 기다려주세요
    </p>
  </div>
);
