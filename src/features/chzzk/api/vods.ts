import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { MemberDto } from "@contracts/members";
import type { ChzzkVideosResponse, ChzzkVideo } from "../model/types";
import { extractChzzkChannelId } from "../model/chzzk-url";

interface ChzzkVideosBatchApiResponse {
  updatedAt: string;
  items: { channelId: string; content: ChzzkVideosResponse | null }[];
}

interface FetchChzzkVideosOptions {
  page?: number;
  size?: number;
}

async function fetchChzzkVideosBatch(
  channelIds: string[],
  options: FetchChzzkVideosOptions = {},
) {
  if (channelIds.length === 0) return {};
  const { page = 0, size = 1 } = options;
  const sortedIds = [...new Set(channelIds)].sort();
  const params = new URLSearchParams({
    channelIds: sortedIds.join(","),
    page: String(page),
    size: String(size),
  });

  const response = await apiFetch<ChzzkVideosBatchApiResponse>(
    withRouteSearch(apiRoutes.chzzk.vods.build(), params),
  );

  const map: Record<string, ChzzkVideosResponse | null> = {};
  response.items?.forEach(({ channelId, content }) => {
    map[channelId] = content ?? null;
  });
  return map;
}

async function fetchVideosByChannelIds(
  channelIds: string[],
  options: FetchChzzkVideosOptions = {},
) {
  const { page = 0, size = 10 } = options;
  const uniqueIds = Array.from(new Set(channelIds));
  const results = await fetchChzzkVideosBatch(uniqueIds, { page, size });

  return uniqueIds.reduce<Record<string, ChzzkVideosResponse | null>>(
    (acc, id) => {
      acc[id] = results[id] ?? null;
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
  members: MemberDto[],
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
  members: MemberDto[],
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
