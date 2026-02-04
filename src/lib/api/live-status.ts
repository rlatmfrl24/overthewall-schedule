import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "../types";
import { extractChzzkChannelId, extractChzzkChannelIdFromText } from "../utils";
import { apiFetch } from "./client";

type LiveStatusDebugInfo = {
  cacheHit?: boolean;
  cacheAgeMs?: number | null;
  fetchedAt?: number | null;
  httpStatus?: number | null;
  error?: string | null;
  staleCacheUsed?: boolean;
};

type LiveStatusDebugItem = {
  channelId: string;
  content: ChzzkLiveStatusMap[number];
  debug?: LiveStatusDebugInfo;
};

type LiveStatusDiagnostics = {
  updatedAt?: string;
  items: LiveStatusDebugItem[];
  channelToMembers: Record<string, number[]>;
};

const buildChannelToMembers = (
  members: Member[],
  schedules?: ScheduleItem[]
) => {
  const channelPairs = members
    .map((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      return channelId ? { channelId, memberUid: member.uid } : null;
    })
    .filter(
      (value): value is { channelId: string; memberUid: number } =>
        value !== null
    );

  const channelToMembers = channelPairs.reduce<Record<string, number[]>>(
    (acc, { channelId, memberUid }) => {
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(memberUid);
      return acc;
    },
    {}
  );

  if (schedules && schedules.length > 0) {
    schedules.forEach((schedule) => {
      if (schedule.status !== "방송" && schedule.status !== "게릴라") return;
      const channelId = extractChzzkChannelIdFromText(schedule.title);
      if (!channelId) return;
      if (!channelToMembers[channelId]) channelToMembers[channelId] = [];
      if (!channelToMembers[channelId].includes(schedule.member_uid)) {
        channelToMembers[channelId].push(schedule.member_uid);
      }
    });
  }

  const uniqueChannelIds = Object.keys(channelToMembers);

  return { channelToMembers, uniqueChannelIds };
};

export async function fetchLiveStatusesForMembers(
  members: Member[],
  options?: { schedules?: ScheduleItem[] }
) {
  const { channelToMembers, uniqueChannelIds } = buildChannelToMembers(
    members,
    options?.schedules
  );
  if (uniqueChannelIds.length === 0) return {};

  const data = await apiFetch<{
    items?: { channelId: string; content: ChzzkLiveStatusMap[number] }[];
  }>(`/api/live-status?channelIds=${uniqueChannelIds.join(",")}`);

  const nextMap: ChzzkLiveStatusMap = {};
  data.items?.forEach(({ channelId, content }) => {
    const memberUids = channelToMembers[channelId] || [];
    memberUids.forEach((uid) => {
      nextMap[uid] = content ?? null;
    });
  });

  return nextMap;
}

export async function fetchLiveStatusDiagnostics(
  members: Member[],
  options?: { schedules?: ScheduleItem[] }
): Promise<LiveStatusDiagnostics> {
  const { channelToMembers, uniqueChannelIds } = buildChannelToMembers(
    members,
    options?.schedules
  );
  if (uniqueChannelIds.length === 0) {
    return { items: [], channelToMembers };
  }

  const data = await apiFetch<{
    updatedAt?: string;
    items?: LiveStatusDebugItem[];
  }>(`/api/live-status?channelIds=${uniqueChannelIds.join(",")}&debug=1`);

  return {
    updatedAt: data.updatedAt,
    items: data.items ?? [],
    channelToMembers,
  };
}
