import { apiFetch } from "./client";
import type { ChzzkVideosResponse, ChzzkVideo, Member } from "@/lib/types";
import { extractChzzkChannelId } from "@/lib/utils";

interface ChzzkVideosApiResponse {
  updatedAt: string;
  content: ChzzkVideosResponse | null;
}

interface ChzzkVideosBatchApiResponse {
  updatedAt: string;
  items: { channelId: string; content: ChzzkVideosResponse | null }[];
}

export interface FetchChzzkVideosOptions {
  page?: number;
  size?: number;
}

const CHZZK_VODS_CACHE_TTL_MS = 60_000;
const vodListCache = new Map<
  string,
  { fetchedAt: number; content: ChzzkVideosResponse | null }
>();
const latestVideoCache = new Map<
  string,
  { fetchedAt: number; video: ChzzkVideo | null }
>();

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < CHZZK_VODS_CACHE_TTL_MS;

const makeListCacheKey = (channelId: string, page: number, size: number) =>
  `${channelId}:${page}:${size}`;

/**
 * 단일 멤버의 치지직 다시보기 목록 조회
 */
export async function fetchChzzkVideos(
  channelId: string,
  options: FetchChzzkVideosOptions = {}
): Promise<ChzzkVideosResponse | null> {
  const { page = 0, size = 24 } = options;
  const cacheKey = makeListCacheKey(channelId, page, size);
  const cached = vodListCache.get(cacheKey);
  if (cached && isCacheFresh(cached.fetchedAt)) {
    return cached.content;
  }
  const params = new URLSearchParams({
    channelId,
    page: String(page),
    size: String(size),
  });

  const response = await apiFetch<ChzzkVideosApiResponse>(
    `/api/vods/chzzk?${params}`
  );
  const content = response?.content ?? null;
  vodListCache.set(cacheKey, { fetchedAt: Date.now(), content });
  return content;
}

async function fetchChzzkVideosBatch(
  channelIds: string[],
  options: FetchChzzkVideosOptions = {}
) {
  if (channelIds.length === 0) return {};
  const { page = 0, size = 1 } = options;
  const params = new URLSearchParams({
    channelIds: channelIds.join(","),
    page: String(page),
    size: String(size),
  });

  const response = await apiFetch<ChzzkVideosBatchApiResponse>(
    `/api/vods/chzzk?${params}`
  );

  const map: Record<string, ChzzkVideosResponse | null> = {};
  response.items?.forEach(({ channelId, content }) => {
    map[channelId] = content ?? null;
  });
  return map;
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
 * 멤버의 최신 다시보기 1개 조회
 */
export async function fetchMemberLatestVideo(
  member: Member
): Promise<ChzzkVideo | null> {
  const channelId = extractChzzkChannelId(member.url_chzzk);
  if (!channelId) return null;

  const cached = latestVideoCache.get(channelId);
  if (cached && isCacheFresh(cached.fetchedAt)) {
    return cached.video;
  }

  const response = await fetchChzzkVideos(channelId, { page: 0, size: 1 });
  const latest = response?.data?.[0] ?? null;
  latestVideoCache.set(channelId, { fetchedAt: Date.now(), video: latest });
  return latest;
}

/**
 * 모든 멤버의 최신 다시보기 조회
 * @returns Record<member.uid, ChzzkVideo | null>
 */
export async function fetchAllMembersLatestVideos(
  members: Member[]
): Promise<Record<number, ChzzkVideo | null>> {
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
    {}
  );
}
