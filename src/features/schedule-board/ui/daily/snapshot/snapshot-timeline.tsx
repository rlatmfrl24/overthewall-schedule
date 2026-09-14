import { useMemo } from "react";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { cn, hexToRgba } from "@/shared/lib/utils";
import { Calendar, HelpCircle, Moon, Zap } from "lucide-react";
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
    className:
      "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/50 dark:border-amber-700",
  },
  undecided: {
    title: "미정",
    icon: HelpCircle,
    className:
      "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-100 dark:bg-slate-900 dark:border-slate-600",
  },
  off: {
    title: "휴방",
    icon: Moon,
    className:
      "text-zinc-700 bg-zinc-50 border-zinc-200 dark:text-zinc-100 dark:bg-zinc-900 dark:border-zinc-600",
  },
};

export const SnapshotTimeline = ({
  members,
  schedules,
}: SnapshotTimelineProps) => {
  const boardModel = useMemo(
    () => buildScheduleBoardModel(schedules),
    [schedules],
  );
  const noScheduleEntries = useMemo(
    () => buildNoScheduleMemberEntries(members, schedules),
    [members, schedules],
  );

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  if (!hasScheduleBoardItems(boardModel) && noScheduleEntries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {boardModel.mainItems.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid min-h-10 grid-cols-[80px_minmax(0,1fr)] items-center border-b border-zinc-200 bg-zinc-50 text-[13px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="flex h-full items-center justify-center text-center">
              시간
            </span>
            <span className="flex h-full items-center px-4 text-left">
              멤버 / 일정
            </span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
    minFontSizePx: 16,
    stepPx: 1,
  });

  return (
    <div className="grid min-h-[88px] grid-cols-[80px_minmax(0,1fr)] items-center">
      <div className="flex h-full items-center justify-center border-r border-zinc-100 bg-zinc-50/70 px-2 dark:border-zinc-800 dark:bg-zinc-950/40">
        <span className="text-[20px] font-bold tabular-nums tracking-tight text-teal-800 dark:text-teal-200">
          {formatScheduleTime(entry.schedule.start_time)}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3 px-4 py-4">
        <img
          src={`/profile/${member.code}.webp`}
          alt={member.name}
          className="h-10 w-10 shrink-0 rounded-full border-2 object-cover"
          style={{ borderColor: hexToRgba(mainColor, 0.55) }}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="min-w-0 max-w-full whitespace-normal break-words text-sm font-semibold leading-snug text-zinc-600 dark:text-zinc-300">
              {member.name}
            </p>
            {member.unit_name && (
              <span className="inline-flex max-w-full items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium leading-snug text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {member.unit_name}
              </span>
            )}
          </div>
          <h3
            ref={textRef}
            style={textStyle}
            className="whitespace-normal break-words text-lg font-bold leading-snug text-zinc-950 dark:text-zinc-50"
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
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-h-11 items-center gap-2 border-b border-zinc-100 px-4 dark:border-zinc-800">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg border",
            meta.className,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
          {meta.title}
        </h2>
        <span className="ml-auto text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
          {items.length}개
        </span>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.map((entry) => {
          const member = memberMap.get(entry.schedule.member_uid);
          if (!member) return null;
          const time = formatScheduleTime(entry.schedule.start_time);
          return (
            <div
              key={entry.schedule.id}
              className="grid min-h-[58px] grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-4"
            >
              <img
                src={`/profile/${member.code}.webp`}
                alt={member.name}
                className="h-9 w-9 rounded-full object-cover ring-1 ring-zinc-200"
              />
              <div className="min-w-0">
                <p className="whitespace-normal break-words text-sm font-black leading-snug text-zinc-950 dark:text-zinc-50">
                  {member.name}
                </p>
                <p className="whitespace-normal break-words text-[13px] font-semibold leading-snug text-zinc-600 dark:text-zinc-300">
                  {getScheduleDisplayTitle(entry.schedule)}
                </p>
              </div>
              {time && (
                <span className="text-[13px] font-bold tabular-nums text-zinc-600 dark:text-zinc-300">
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
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
          일정 없음
        </h2>
        <span className="ml-auto text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
          {entries.length}명
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        오늘 등록된 일정이 없습니다
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
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

const SnapshotNoScheduleItem = ({ entry }: { entry: NoScheduleMemberEntry }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <img
      src={`/profile/${entry.member.code}.webp`}
      alt={entry.member.name}
      className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
    />
    <p className="min-w-0 whitespace-normal break-words text-[13px] font-semibold leading-snug text-zinc-700 dark:text-zinc-300">
      {entry.member.name}
    </p>
  </div>
);

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
