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
const videosCache = new Map<
  string,
  { fetchedAt: number; content: ChzzkVideosResponse | null }
>();
const vodBatchInFlight = new Map<
  string,
  Promise<Record<string, ChzzkVideosResponse | null>>
>();

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < CHZZK_VODS_CACHE_TTL_MS;

const makeCacheKey = (channelId: string, page: number, size: number) =>
  `${channelId}:${page}:${size}`;

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

async function fetchVideosByChannelIds(
  channelIds: string[],
  options: FetchChzzkVideosOptions = {},
) {
  const { page = 0, size = 10 } = options;
  const uniqueIds = Array.from(new Set(channelIds));
  const now = Date.now();
  const cachedResults: Record<string, ChzzkVideosResponse | null> = {};
  const missingIds = uniqueIds.filter((id) => {
    const cached = videosCache.get(makeCacheKey(id, page, size));
    if (cached && isCacheFresh(cached.fetchedAt)) {
      cachedResults[id] = cached.content;
      return false;
    }
    return true;
  });

  if (missingIds.length > 0) {
    const batch = await fetchChzzkVideosBatch(missingIds, {
      page,
      size,
    });
    missingIds.forEach((id) => {
      const content = batch[id] ?? null;
      videosCache.set(makeCacheKey(id, page, size), {
        fetchedAt: now,
        content,
      });
      cachedResults[id] = content;
    });
  }

  return uniqueIds.reduce<Record<string, ChzzkVideosResponse | null>>(
    (acc, id) => {
      acc[id] =
        cachedResults[id] ??
        videosCache.get(makeCacheKey(id, page, size))?.content ??
        null;
      return acc;
    },
    {},
  );
}

async function fetchLatestVideosByChannelIds(channelIds: string[]) {
  const responses = await fetchVideosByChannelIds(channelIds, {
    page: 0,
    size: 1,
  });

  return Object.entries(responses).reduce<Record<string, ChzzkVideo | null>>(
    (acc, [id, response]) => {
      acc[id] = response?.data?.[0] ?? null;
      return acc;
    },
    {},
  );
}

/**
 * 모든 멤버의 다시보기를 가져와 publishDate 기준 기본 순서로 반환
 * @param members 멤버 목록
 * @param videosPerMember 멤버당 가져올 다시보기 수 (기본 10개)
 * @returns publishDate 기준 다시보기 배열 (memberUid 포함)
 */
export async function fetchAllMembersVodVideos(
  members: Member[],
  videosPerMember = 10,
): Promise<ChzzkVideo[]> {
  const channelPairs = members
    .map((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      return channelId ? { channelId, memberUid: member.uid } : null;
    })
    .filter(
      (value): value is { channelId: string; memberUid: number } =>
        value !== null,
    );

  if (channelPairs.length === 0) return [];

  const channelToMembers = channelPairs.reduce<Record<string, number[]>>(
    (acc, { channelId, memberUid }) => {
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(memberUid);
      return acc;
    },
    {},
  );

  const uniqueChannelIds = Object.keys(channelToMembers);
  const videosByChannel = await fetchVideosByChannelIds(uniqueChannelIds, {
    page: 0,
    size: videosPerMember,
  });

  const allVideos: ChzzkVideo[] = [];
  uniqueChannelIds.forEach((channelId) => {
    const response = videosByChannel[channelId];
    const memberUids = channelToMembers[channelId] || [];
    response?.data?.forEach((video) => {
      memberUids.forEach((memberUid) => {
        allVideos.push({
          ...video,
          memberUid,
        });
      });
    });
  });

  allVideos.sort((a, b) => {
    const dateA = new Date(a.publishDate.replace(" ", "T")).getTime();
    const dateB = new Date(b.publishDate.replace(" ", "T")).getTime();
    return dateB - dateA;
  });

  return allVideos;
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
        acc[uid] = video ? { ...video, memberUid: uid } : null;
      });
      return acc;
    },
    {},
  );
}
