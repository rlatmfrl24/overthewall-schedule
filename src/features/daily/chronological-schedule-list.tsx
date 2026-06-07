import {
  useMemo,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import {
  buildChzzkLiveUrl,
  cn,
  convertChzzkToLiveUrl,
} from "@/lib/utils";
import {
  Ban,
  Calendar,
  ExternalLink,
  Flame,
  HelpCircle,
  Moon,
  Radio,
  Signal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildScheduleBoardModel,
  buildNoScheduleMemberEntries,
  formatScheduleTime,
  getScheduleDisplayTitle,
  hasScheduleBoardItems,
  type NoScheduleMemberEntry,
  type ScheduleBoardEntry,
  type ScheduleBoardModel,
  type ScheduleSideGroupKey,
} from "./chronological-schedule-utils";

interface ChronologicalScheduleListProps {
  members: Member[];
  schedules: ScheduleItem[];
  loading?: boolean;
  onScheduleClick: (schedule: ScheduleItem) => void;
  liveStatuses?: ChzzkLiveStatusMap;
}

type IconComponent = ComponentType<{ className?: string }>;

const sideGroupMeta: Record<
  ScheduleSideGroupKey,
  {
    title: string;
    icon: IconComponent;
    className: string;
    emptyText: string;
  }
> = {
  guerrilla: {
    title: "게릴라 예정",
    icon: Zap,
    className: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60",
    emptyText: "게릴라 일정 없음",
  },
  undecided: {
    title: "미정",
    icon: HelpCircle,
    className: "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-200 dark:bg-slate-900/40 dark:border-slate-800",
    emptyText: "미정 일정 없음",
  },
  off: {
    title: "휴방",
    icon: Moon,
    className: "text-zinc-700 bg-zinc-50 border-zinc-200 dark:text-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800",
    emptyText: "휴방 멤버 없음",
  },
};

export const ChronologicalScheduleList = ({
  members,
  schedules,
  loading = false,
  onScheduleClick,
  liveStatuses = {},
}: ChronologicalScheduleListProps) => {
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  const boardModel = useMemo(
    () => buildScheduleBoardModel(schedules, liveStatuses),
    [schedules, liveStatuses],
  );
  const noScheduleEntries = useMemo(
    () => buildNoScheduleMemberEntries(members, schedules, liveStatuses),
    [members, schedules, liveStatuses],
  );
  const hasBoardItems = hasScheduleBoardItems(boardModel);
  const hasVisibleItems = hasBoardItems || noScheduleEntries.length > 0;

  if (loading) {
    return <ScheduleBoardSkeleton />;
  }

  return (
    <section
      aria-label="오늘의 편성표"
      className="flex w-full flex-col gap-4"
    >
      {hasVisibleItems ? (
        <>
          <div className="grid w-full items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ScheduleBoard
              items={boardModel.mainItems}
              memberMap={memberMap}
              onScheduleClick={onScheduleClick}
            />
            <SideStatusRail
              model={boardModel}
              memberMap={memberMap}
              noScheduleEntries={noScheduleEntries}
              onScheduleClick={onScheduleClick}
            />
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </section>
  );
};

const ScheduleBoard = ({
  items,
  memberMap,
  onScheduleClick,
}: {
  items: ScheduleBoardEntry[];
  memberMap: Map<number, Member>;
  onScheduleClick: (schedule: ScheduleItem) => void;
}) => (
  <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
    <div className="hidden min-h-11 grid-cols-[92px_minmax(220px,0.95fr)_minmax(320px,2.5fr)_88px_48px] items-center border-b border-border bg-muted/35 px-0 text-xs font-bold text-muted-foreground lg:grid">
      <div className="px-4 text-center">시간</div>
      <div className="px-4">멤버</div>
      <div className="px-4">제목</div>
      <div className="px-2 text-center">상태</div>
      <div className="px-2 text-center">관리</div>
    </div>

    {items.length > 0 ? (
      <div className="relative divide-y divide-border">
        <span
          className="pointer-events-none absolute inset-y-0 left-[74px] z-10 hidden border-r border-dashed border-slate-300 dark:border-slate-700 lg:block"
          aria-hidden="true"
        />
        {items.map((entry) => {
          const member = memberMap.get(entry.schedule.member_uid);
          if (!member) return null;
          return (
            <ScheduleBoardRow
              key={entry.schedule.id}
              entry={entry}
              member={member}
              onScheduleClick={onScheduleClick}
            />
          );
        })}
      </div>
    ) : (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
        <Calendar className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-bold text-foreground">
          시간표에 표시할 방송이 없습니다
        </p>
        <p className="text-xs text-muted-foreground">
          게릴라, 미정, 휴방 일정은 오른쪽 보조 영역에서 확인하세요.
        </p>
      </div>
    )}
  </div>
);

const ScheduleBoardRow = ({
  entry,
  member,
  onScheduleClick,
}: {
  entry: ScheduleBoardEntry;
  member: Member;
  onScheduleClick: (schedule: ScheduleItem) => void;
}) => {
  const { schedule, isLive, liveStatus } = entry;
  const mainColor = member.main_color || "#14b8a6";
  const title = getScheduleDisplayTitle(schedule);
  const liveUrl =
    buildChzzkLiveUrl(liveStatus?.channelId) ||
    convertChzzkToLiveUrl(member.url_chzzk);
  const time = formatScheduleTime(schedule.start_time) ?? "--:--";

  const handleOpenLive = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (liveUrl) {
      window.open(liveUrl, "_blank", "noreferrer");
    }
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onScheduleClick(schedule);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onScheduleClick(schedule)}
      onKeyDown={handleRowKeyDown}
      className="group grid min-h-[74px] w-full grid-cols-1 items-stretch bg-card text-left transition-colors hover:bg-muted/30 lg:grid-cols-[92px_minmax(220px,0.95fr)_minmax(320px,2.5fr)_88px_48px]"
      aria-label={`${time} ${member.name} ${title}`}
    >
      <div className="flex items-center gap-3 border-b border-border/70 bg-muted/25 px-4 py-3 lg:justify-center lg:border-b-0 lg:border-r">
        <div className="relative flex w-[58px] shrink-0 items-center justify-end pr-4">
          <span className="absolute right-[-4px] top-1/2 z-20 h-2 w-2 -translate-y-1/2 rounded-full bg-slate-500 ring-2 ring-background" />
          <span className="font-mono text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {time}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 lg:contents">
        <div className="flex min-w-0 items-center gap-3 lg:px-4 lg:py-3">
          <span
            className="h-10 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: mainColor }}
          />
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="whitespace-normal break-words text-base font-black leading-tight text-foreground">
                {member.name}
              </span>
              {isLive && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
              )}
            </div>
            {member.unit_name && (
              <p className="truncate text-xs font-bold text-muted-foreground">
                {member.unit_name}
              </p>
            )}
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col justify-center lg:col-span-1 lg:px-4 lg:py-3">
          <p className="whitespace-normal break-words text-[15px] font-bold leading-snug text-foreground">
            {title}
          </p>
          {isLive && liveStatus?.liveTitle && liveStatus.liveTitle !== title && (
            <p
              className="mt-1 whitespace-normal break-words text-xs font-medium text-muted-foreground"
              data-snapshot-exclude="true"
            >
              {liveStatus.liveTitle}
            </p>
          )}
        </div>

        <div className="flex items-center justify-start lg:justify-center lg:px-2 lg:py-3">
          <StatusPill schedule={schedule} isLive={isLive} />
        </div>

        <div
          className="flex items-center justify-end gap-1 lg:justify-center lg:px-2 lg:py-3"
          data-snapshot-exclude="true"
        >
          {liveUrl ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
              onClick={handleOpenLive}
              aria-label={isLive ? "방송 보러가기" : "치지직 열기"}
              title={isLive ? "방송 보러가기" : "치지직 열기"}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const StatusPill = ({
  schedule,
  isLive,
}: {
  schedule: ScheduleItem;
  isLive: boolean;
}) => {
  const statusMeta =
    isLive
      ? {
          label: "LIVE",
          icon: Signal,
          className:
            "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200",
        }
      : schedule.status === "게릴라"
        ? {
            label: "게릴라",
            icon: Flame,
            className:
              "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200",
          }
        : schedule.status === "휴방"
          ? {
              label: "휴방",
              icon: Ban,
              className:
                "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200",
            }
          : schedule.status === "미정" || !formatScheduleTime(schedule.start_time)
            ? {
                label: "미정",
                icon: HelpCircle,
                className:
                  "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200",
              }
            : {
                label: "방송",
                icon: Radio,
                className:
                  "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-200",
              };

  const Icon = statusMeta.icon;

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-black",
        statusMeta.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {statusMeta.label}
    </span>
  );
};

const SideStatusRail = ({
  model,
  memberMap,
  noScheduleEntries,
  onScheduleClick,
}: {
  model: ScheduleBoardModel;
  memberMap: Map<number, Member>;
  noScheduleEntries: NoScheduleMemberEntry[];
  onScheduleClick: (schedule: ScheduleItem) => void;
}) => {
  const visibleGroups = (Object.keys(sideGroupMeta) as ScheduleSideGroupKey[])
    .map((key) => ({
      key,
      items: model.sideGroups[key],
    }))
    .filter(({ items }) => items.length > 0);

  if (visibleGroups.length === 0 && noScheduleEntries.length === 0) {
    return (
      <aside className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        보조 일정이 없습니다.
      </aside>
    );
  }

  return (
    <aside className="grid content-start gap-3">
      {visibleGroups.map(({ key, items }) => (
        <SideGroup
          key={key}
          groupKey={key}
          items={items}
          memberMap={memberMap}
          onScheduleClick={onScheduleClick}
        />
      ))}
      {noScheduleEntries.length > 0 && (
        <NoScheduleGroup entries={noScheduleEntries} />
      )}
    </aside>
  );
};

const SideGroup = ({
  groupKey,
  items,
  memberMap,
  onScheduleClick,
}: {
  groupKey: ScheduleSideGroupKey;
  items: ScheduleBoardEntry[];
  memberMap: Map<number, Member>;
  onScheduleClick: (schedule: ScheduleItem) => void;
}) => {
  const meta = sideGroupMeta[groupKey];
  const Icon = meta.icon;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b border-border bg-muted/25 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md border",
              meta.className,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-black text-foreground">
            {meta.title}
          </h3>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-black text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="divide-y divide-border">
          {items.map((entry) => {
            const member = memberMap.get(entry.schedule.member_uid);
            if (!member) return null;
            return (
              <SideScheduleItem
                key={entry.schedule.id}
                entry={entry}
                member={member}
                onScheduleClick={onScheduleClick}
              />
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-5 text-sm font-medium text-muted-foreground">
          {meta.emptyText}
        </p>
      )}
    </section>
  );
};

const SideScheduleItem = ({
  entry,
  member,
  onScheduleClick,
}: {
  entry: ScheduleBoardEntry;
  member: Member;
  onScheduleClick: (schedule: ScheduleItem) => void;
}) => {
  const title = getScheduleDisplayTitle(entry.schedule);
  const mainColor = member.main_color || "#14b8a6";
  const time = formatScheduleTime(entry.schedule.start_time);

  return (
    <button
      type="button"
      onClick={() => onScheduleClick(entry.schedule)}
      className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      aria-label={`${member.name} ${title}`}
    >
      <img
        src={`/profile/${member.code}.webp`}
        alt={member.name}
        className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-foreground">
            {member.name}
          </span>
          {entry.isLive && (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-950/40 dark:text-red-200">
              LIVE
            </span>
          )}
        </div>
        <p className="mt-0.5 whitespace-normal break-words text-xs font-medium text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ backgroundColor: mainColor }}
        />
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          {time ?? entry.schedule.status}
        </span>
      </div>
    </button>
  );
};

const getNoScheduleLiveUrl = (entry: NoScheduleMemberEntry) =>
  buildChzzkLiveUrl(entry.liveStatus?.channelId) ||
  convertChzzkToLiveUrl(entry.member.url_chzzk);

const NoScheduleGroup = ({
  entries,
}: {
  entries: NoScheduleMemberEntry[];
}) => {
  const liveCount = entries.filter((entry) => entry.isLive).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b border-border bg-muted/35 px-4 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
              <Calendar className="h-4 w-4" />
            </span>
            <h3 className="truncate text-sm font-black text-foreground">
              일정 없음
            </h3>
            <span className="rounded-md bg-background px-1.5 py-0.5 text-xs font-black text-muted-foreground tabular-nums">
              {entries.length}
            </span>
            {liveCount > 0 && (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-950/35 dark:text-red-200">
                방송 중 {liveCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
        {entries.map((entry) => (
          <NoScheduleMemberItem
            key={`no-schedule-${entry.member.uid}`}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
};

const NoScheduleMemberItem = ({
  entry,
}: {
  entry: NoScheduleMemberEntry;
}) => {
  const liveUrl = getNoScheduleLiveUrl(entry);
  const content = (
    <>
      <img
        src={`/profile/${entry.member.code}.webp`}
        alt=""
        className={cn(
          "h-10 w-10 rounded-full object-cover ring-1 ring-border",
          entry.isLive && "ring-2 ring-red-200 dark:ring-red-900/70",
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-black text-foreground">
            {entry.member.name}
          </span>
          {entry.isLive && (
            <span className="shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-950/35 dark:text-red-200">
              방송 중
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground">
          {entry.isLive ? "현재 방송 중입니다" : "오늘 등록된 일정이 없습니다"}
        </p>
      </div>
      {entry.isLive && liveUrl && (
        <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  if (entry.isLive && liveUrl) {
    return (
      <button
        type="button"
        className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 bg-red-50/35 px-4 py-3 text-left transition-colors hover:bg-red-50/70 dark:bg-red-950/10 dark:hover:bg-red-950/20"
        onClick={() => window.open(liveUrl, "_blank", "noreferrer")}
        aria-label={`${entry.member.name} 방송 중`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
        entry.isLive && "bg-red-50/35 dark:bg-red-950/10",
      )}
    >
      {content}
    </div>
  );
};

const EmptyState = () => (
  <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
    <Calendar className="h-9 w-9 text-muted-foreground/50" />
    <div>
      <p className="text-base font-black text-foreground">
        표시할 편성표가 없습니다
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        오늘 표시할 일정이 없습니다.
      </p>
    </div>
  </div>
);

const ScheduleBoardSkeleton = () => (
  <div className="flex w-full flex-col gap-4" aria-label="편성표 로딩 중">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Skeleton className="h-11 w-full rounded-none" />
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={`row-skeleton-${index}`}
            className="grid min-h-[74px] grid-cols-[92px_1fr] border-t border-border"
          >
            <div className="border-r bg-muted/25 p-4">
              <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex items-center gap-3 p-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid content-start gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`side-skeleton-${index}`}
            className="rounded-lg border border-border bg-card p-4"
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-4 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
