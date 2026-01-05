import type { ChzzkLiveStatusMap, Member } from "../types";
import { extractChzzkChannelId } from "../utils";
import { apiFetch } from "./client";

export async function fetchLiveStatusesForMembers(members: Member[]) {
  const channelPairs = members
    .map((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      return channelId ? { channelId, memberUid: member.uid } : null;
    })
    .filter(
      (value): value is { channelId: string; memberUid: number } =>
        value !== null
    );

  if (channelPairs.length === 0) return {};

  const channelToMembers = channelPairs.reduce<Record<string, number[]>>(
    (acc, { channelId, memberUid }) => {
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(memberUid);
      return acc;
    },
    {}
  );

  const uniqueChannelIds = Object.keys(channelToMembers);

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
