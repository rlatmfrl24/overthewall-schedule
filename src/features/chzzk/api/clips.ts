import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { MemberDto } from "@contracts/members";
import type { ChzzkClipsResponse, ChzzkClip } from "../model/types";
import { extractChzzkChannelId } from "../model/chzzk-url";

interface ChzzkClipsBatchApiResponse {
  updatedAt: string;
  items: { channelId: string; content: ChzzkClipsResponse | null }[];
}

interface FetchChzzkClipsOptions {
  size?: number;
}

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
  const params = new URLSearchParams({
    channelIds: sortedIds.join(","),
    size: String(size),
  });

  const response = await apiFetch<ChzzkClipsBatchApiResponse>(
    withRouteSearch(apiRoutes.chzzk.clips.build(), params),
  );

  const map: Record<string, ChzzkClipsResponse | null> = {};
  response.items?.forEach(({ channelId, content }) => {
    map[channelId] = content ?? null;
  });
  return map;
}

/**
 * 모든 멤버의 클립을 가져와 createdDate 기준 기본 순서로 반환
 * @param members 멤버 목록
 * @param clipsPerMember 멤버당 가져올 클립 수 (기본 10개)
 * @returns createdDate 기준 클립 배열 (memberUid 포함)
 */
export async function fetchAllMembersClips(
  members: MemberDto[],
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
  const results = await fetchChzzkClipsBatch(uniqueChannelIds, {
    size: clipsPerMember,
  });

  // 모든 클립을 합치고 memberUid 추가
  const allClips: ChzzkClip[] = [];
  uniqueChannelIds.forEach((channelId) => {
    const response = results[channelId];
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

  // createdDate 기준 기본 정렬
  allClips.sort((a, b) => {
    const dateA = new Date(a.createdDate).getTime();
    const dateB = new Date(b.createdDate).getTime();
    return dateB - dateA;
  });

  return allClips;
}
