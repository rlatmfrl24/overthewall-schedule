import { apiFetch } from "./client";
import type { ChzzkClipsResponse, ChzzkClip, Member } from "@/lib/types";
import { extractChzzkChannelId } from "@/lib/utils";

interface ChzzkClipsBatchApiResponse {
  updatedAt: string;
  items: { channelId: string; content: ChzzkClipsResponse | null }[];
}

interface FetchChzzkClipsOptions {
  size?: number;
}

const CHZZK_CLIPS_CACHE_TTL_MS = 300_000;
const clipsCache = new Map<
  string,
  { fetchedAt: number; content: ChzzkClipsResponse | null }
>();
const clipsBatchInFlight = new Map<
  string,
  Promise<Record<string, ChzzkClipsResponse | null>>
>();

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < CHZZK_CLIPS_CACHE_TTL_MS;

const makeCacheKey = (channelId: string, size: number) =>
  `${channelId}:${size}`;

/**
 * 여러 채널의 치지직 클립 배치 조회
 */
async function fetchChzzkClipsBatch(
  channelIds: string[],
  options: FetchChzzkClipsOptions = {},
) {
  if (channelIds.length === 0) return {};
  const { size = 10 } = options;
  const sortedIds = [...new Set(channelIds)].sort();
  const batchKey = `${sortedIds.join(",")}:${size}`;
  const inFlight = clipsBatchInFlight.get(batchKey);
  if (inFlight) {
    return inFlight;
  }
  const params = new URLSearchParams({
    channelIds: sortedIds.join(","),
    size: String(size),
  });

  const request = (async () => {
    const response = await apiFetch<ChzzkClipsBatchApiResponse>(
      `/api/clips/chzzk?${params}`,
    );

    const map: Record<string, ChzzkClipsResponse | null> = {};
    response.items?.forEach(({ channelId, content }) => {
      map[channelId] = content ?? null;
    });
    return map;
  })();
  clipsBatchInFlight.set(batchKey, request);
  try {
    return await request;
  } finally {
    clipsBatchInFlight.delete(batchKey);
  }
}

/**
 * 모든 멤버의 클립을 가져와 최신순으로 정렬하여 반환
 * @param members 멤버 목록
 * @param clipsPerMember 멤버당 가져올 클립 수 (기본 10개)
 * @returns 최신순 정렬된 클립 배열 (memberUid 포함)
 */
export async function fetchAllMembersClips(
  members: Member[],
  clipsPerMember = 10,
): Promise<ChzzkClip[]> {
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

  // 채널 ID -> 멤버 UID 매핑
  const channelToMember = channelPairs.reduce<Record<string, number>>(
    (acc, { channelId, memberUid }) => {
      acc[channelId] = memberUid;
      return acc;
    },
    {},
  );

  const uniqueChannelIds = Object.keys(channelToMember);

  // 캐시 확인 후 미싱 채널만 fetch
  const now = Date.now();
  const cachedResults: Record<string, ChzzkClipsResponse | null> = {};
  const missingIds: string[] = [];

  uniqueChannelIds.forEach((channelId) => {
    const cacheKey = makeCacheKey(channelId, clipsPerMember);
    const cached = clipsCache.get(cacheKey);
    if (cached && isCacheFresh(cached.fetchedAt)) {
      cachedResults[channelId] = cached.content;
    } else {
      missingIds.push(channelId);
    }
  });

  // 누락된 채널 fetch
  if (missingIds.length > 0) {
    const batch = await fetchChzzkClipsBatch(missingIds, {
      size: clipsPerMember,
    });
    missingIds.forEach((channelId) => {
      const content = batch[channelId] ?? null;
      clipsCache.set(makeCacheKey(channelId, clipsPerMember), {
        fetchedAt: now,
        content,
      });
      cachedResults[channelId] = content;
    });
  }

  // 모든 클립을 합치고 memberUid 추가
  const allClips: ChzzkClip[] = [];
  uniqueChannelIds.forEach((channelId) => {
    const response = cachedResults[channelId];
    if (response?.data) {
      const memberUid = channelToMember[channelId];
      response.data.forEach((clip) => {
        allClips.push({
          ...clip,
          memberUid,
        });
      });
    }
  });

  // 최신순 정렬 (createdDate 기준)
  allClips.sort((a, b) => {
    const dateA = new Date(a.createdDate).getTime();
    const dateB = new Date(b.createdDate).getTime();
    return dateB - dateA;
  });

  return allClips;
}
