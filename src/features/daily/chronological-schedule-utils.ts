import type { ChzzkLiveStatusMap, ScheduleItem, ScheduleStatus } from "@/lib/types";

export type ScheduleBoardFilter =
  | "all"
  | "broadcast"
  | "live"
  | "guerrilla"
  | "off"
  | "undecided";

export type ScheduleSideGroupKey = "guerrilla" | "undecided" | "off";

export type ScheduleBoardEntry = {
  schedule: ScheduleItem;
  isLive: boolean;
  liveStatus: ChzzkLiveStatusMap[number] | undefined;
  sideGroup: ScheduleSideGroupKey | null;
};

export type ScheduleBoardCounters = Record<ScheduleBoardFilter, number>;

export type ScheduleBoardModel = {
  mainItems: ScheduleBoardEntry[];
  sideGroups: Record<ScheduleSideGroupKey, ScheduleBoardEntry[]>;
  counters: ScheduleBoardCounters;
};

export const scheduleBoardFilters: Array<{
  key: ScheduleBoardFilter;
  label: string;
}> = [
  { key: "all", label: "전체" },
  { key: "broadcast", label: "방송" },
  { key: "live", label: "LIVE" },
  { key: "guerrilla", label: "게릴라" },
  { key: "off", label: "휴방" },
  { key: "undecided", label: "미정" },
];

const fallbackTitleByStatus: Record<ScheduleStatus, string> = {
  방송: "방송 예정",
  휴방: "오늘은 휴방입니다",
  게릴라: "게릴라 방송 예정",
  미정: "방송 시간 미정",
};

export const getScheduleDisplayTitle = (schedule: ScheduleItem) => {
  const rawTitle = schedule.title?.trim() ?? "";
  const isDuplicatedStatusTitle =
    schedule.status !== "방송" && rawTitle.length > 0 && rawTitle === schedule.status;

  return rawTitle && !isDuplicatedStatusTitle
    ? rawTitle
    : fallbackTitleByStatus[schedule.status];
};

export const formatScheduleTime = (startTime?: string | null) =>
  startTime ? startTime.slice(0, 5) : null;

const compareSchedules = (a: ScheduleBoardEntry, b: ScheduleBoardEntry) => {
  const timeA = formatScheduleTime(a.schedule.start_time) ?? "99:99";
  const timeB = formatScheduleTime(b.schedule.start_time) ?? "99:99";
  const byTime = timeA.localeCompare(timeB);

  if (byTime !== 0) return byTime;
  if (a.schedule.member_uid !== b.schedule.member_uid) {
    return a.schedule.member_uid - b.schedule.member_uid;
  }
  return a.schedule.id - b.schedule.id;
};

const getSideGroup = (schedule: ScheduleItem): ScheduleSideGroupKey | null => {
  if (schedule.status === "게릴라") return "guerrilla";
  if (schedule.status === "휴방") return "off";
  if (schedule.status === "미정" || !formatScheduleTime(schedule.start_time)) {
    return "undecided";
  }
  return null;
};

export const buildScheduleBoardModel = (
  schedules: ScheduleItem[],
  liveStatuses: ChzzkLiveStatusMap = {},
): ScheduleBoardModel => {
  const entries = schedules.map<ScheduleBoardEntry>((schedule) => {
    const liveStatus = liveStatuses[schedule.member_uid];
    const canShowLive =
      schedule.status === "방송" || schedule.status === "게릴라";
    return {
      schedule,
      liveStatus,
      isLive: canShowLive && liveStatus?.status === "OPEN",
      sideGroup: getSideGroup(schedule),
    };
  });

  const mainItems = entries
    .filter((entry) => entry.sideGroup === null)
    .sort(compareSchedules);

  const sideGroups: ScheduleBoardModel["sideGroups"] = {
    guerrilla: [],
    undecided: [],
    off: [],
  };

  for (const entry of entries) {
    if (entry.sideGroup) {
      sideGroups[entry.sideGroup].push(entry);
    }
  }

  for (const key of Object.keys(sideGroups) as ScheduleSideGroupKey[]) {
    sideGroups[key].sort(compareSchedules);
  }

  return {
    mainItems,
    sideGroups,
    counters: {
      all: entries.length,
      broadcast: entries.filter((entry) => entry.schedule.status === "방송").length,
      live: entries.filter((entry) => entry.isLive).length,
      guerrilla: sideGroups.guerrilla.length,
      off: sideGroups.off.length,
      undecided: sideGroups.undecided.length,
    },
  };
};

const emptySideGroups = (): ScheduleBoardModel["sideGroups"] => ({
  guerrilla: [],
  undecided: [],
  off: [],
});

export const filterScheduleBoardModel = (
  model: ScheduleBoardModel,
  filter: ScheduleBoardFilter,
): ScheduleBoardModel => {
  if (filter === "all") return model;

  if (filter === "broadcast") {
    return {
      counters: model.counters,
      mainItems: model.mainItems.filter(
        (entry) => entry.schedule.status === "방송",
      ),
      sideGroups: {
        ...emptySideGroups(),
        undecided: model.sideGroups.undecided.filter(
          (entry) => entry.schedule.status === "방송",
        ),
      },
    };
  }

  if (filter === "live") {
    return {
      counters: model.counters,
      mainItems: model.mainItems.filter((entry) => entry.isLive),
      sideGroups: {
        guerrilla: model.sideGroups.guerrilla.filter((entry) => entry.isLive),
        undecided: model.sideGroups.undecided.filter((entry) => entry.isLive),
        off: model.sideGroups.off.filter((entry) => entry.isLive),
      },
    };
  }

  if (filter === "guerrilla") {
    return {
      counters: model.counters,
      mainItems: [],
      sideGroups: {
        ...emptySideGroups(),
        guerrilla: model.sideGroups.guerrilla,
      },
    };
  }

  if (filter === "off") {
    return {
      counters: model.counters,
      mainItems: [],
      sideGroups: {
        ...emptySideGroups(),
        off: model.sideGroups.off,
      },
    };
  }

  return {
    counters: model.counters,
    mainItems: [],
    sideGroups: {
      ...emptySideGroups(),
      undecided: model.sideGroups.undecided,
    },
  };
};

export const hasScheduleBoardItems = (model: ScheduleBoardModel) =>
  model.mainItems.length > 0 ||
  model.sideGroups.guerrilla.length > 0 ||
  model.sideGroups.undecided.length > 0 ||
  model.sideGroups.off.length > 0;
