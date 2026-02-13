import { apiFetch } from "./client";
import type { ChzzkVideosResponse, ChzzkVideo, Member } from "@/lib/types";
import { extractChzzkChannelId } from "@/lib/utils";

interface ChzzkVideosBatchApiResponse {
  updatedAt: string;
  items: { channelId: string; content: ChzzkVideosResponse | null }[];
}

interface FetchChzzkVideosOptions {
  page?: number;
  size?: number;
}

const CHZZK_VODS_CACHE_TTL_MS = 300_000;
const latestVideoCache = new Map<
  string,
  { fetchedAt: number; video: ChzzkVideo | null }
>();
const vodBatchInFlight = new Map<
  string,
  Promise<Record<string, ChzzkVideosResponse | null>>
>();

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < CHZZK_VODS_CACHE_TTL_MS;

async function fetchChzzkVideosBatch(
  channelIds: string[],
  options: FetchChzzkVideosOptions = {},
) {
  if (channelIds.length === 0) return {};
  const { page = 0, size = 1 } = options;
  const sortedIds = [...new Set(channelIds)].sort();
  const batchKey = `${sortedIds.join(",")}:${page}:${size}`;
  const inFlight = vodBatchInFlight.get(batchKey);
  if (inFlight) {
    return inFlight;
  }
  const params = new URLSearchParams({
    channelIds: sortedIds.join(","),
    page: String(page),
    size: String(size),
  });

  const request = (async () => {
    const response = await apiFetch<ChzzkVideosBatchApiResponse>(
      `/api/vods/chzzk?${params}`,
    );

    const map: Record<string, ChzzkVideosResponse | null> = {};
    response.items?.forEach(({ channelId, content }) => {
      map[channelId] = content ?? null;
    });
    return map;
  })();
  vodBatchInFlight.set(batchKey, request);
  try {
    return await request;
  } finally {
    vodBatchInFlight.delete(batchKey);
  }
}

async function fetchLatestVideosByChannelIds(channelIds: string[]) {
  const uniqueIds = Array.from(new Set(channelIds));
  const missingIds = uniqueIds.filter((id) => {
    const cached = latestVideoCache.get(id);
    return !cached || !isCacheFresh(cached.fetchedAt);
  });

  if (missingIds.length > 0) {
    const batch = await fetchChzzkVideosBatch(missingIds, {
      page: 0,
      size: 1,
    });
    missingIds.forEach((id) => {
      const latest = batch[id]?.data?.[0] ?? null;
      latestVideoCache.set(id, { fetchedAt: Date.now(), video: latest });
    });
  }

  return uniqueIds.reduce<Record<string, ChzzkVideo | null>>((acc, id) => {
    acc[id] = latestVideoCache.get(id)?.video ?? null;
    return acc;
  }, {});
}

/**
 * 모든 멤버의 최신 다시보기 조회
 * @returns Record<member.uid, ChzzkVideo | null>
 */
export async function fetchAllMembersLatestVideos(
  members: Member[],
): Promise<Record<number, ChzzkVideo | null>> {
  const channelPairs = members
    .map((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      return channelId ? { channelId, memberUid: member.uid } : null;
    })
    .filter(
      (value): value is { channelId: string; memberUid: number } =>
        value !== null,
    );

  if (channelPairs.length === 0) return {};

  const channelToMembers = channelPairs.reduce<Record<string, number[]>>(
    (acc, { channelId, memberUid }) => {
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(memberUid);
      return acc;
    },
    {},
  );

  const uniqueChannelIds = Object.keys(channelToMembers);
  const latestByChannel = await fetchLatestVideosByChannelIds(uniqueChannelIds);

  return uniqueChannelIds.reduce<Record<number, ChzzkVideo | null>>(
    (acc, channelId) => {
      const memberUids = channelToMembers[channelId] || [];
      const video = latestByChannel[channelId] ?? null;
      memberUids.forEach((uid) => {
        acc[uid] = video;
      });
      return acc;
    },
    {},
  );
}
