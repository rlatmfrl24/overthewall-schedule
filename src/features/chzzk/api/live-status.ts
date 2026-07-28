import type {
  ChzzkLiveStatusDebugDto,
  ChzzkLiveStatusMap,
  ChzzkLiveStatusResponseDto,
  LiveScheduleAutoFillRequestDto,
  LiveScheduleAutoFillResponseDto,
} from "@contracts/chzzk";
import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
import { apiFetch } from "@/shared/api/client";
import {
  extractChzzkChannelId,
  extractChzzkChannelIdFromText,
} from "../model/chzzk-url";

type LiveStatusDebugInfo = ChzzkLiveStatusDebugDto;

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

export type LiveStatusesForMembersResult = {
  statuses: ChzzkLiveStatusMap;
  scheduleAutoFill: {
    updated: number;
  };
};

const buildChannelToMembers = (
  members: MemberDto[],
  schedules?: ScheduleDto[]
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
  members: MemberDto[],
  options?: { schedules?: ScheduleDto[] }
) {
  const result = await fetchLiveStatusesForMembersWithMeta(members, options);
  return result.statuses;
}

export async function fetchLiveStatusesForMembersWithMeta(
  members: MemberDto[],
  options?: { schedules?: ScheduleDto[] }
): Promise<LiveStatusesForMembersResult> {
  const { channelToMembers, uniqueChannelIds } = buildChannelToMembers(
    members,
    options?.schedules
  );
  if (uniqueChannelIds.length === 0) {
    return { statuses: {}, scheduleAutoFill: { updated: 0 } };
  }

  const data = await apiFetch<ChzzkLiveStatusResponseDto>(
    withRouteSearch(
      apiRoutes.chzzk.liveStatus.build(),
      `channelIds=${uniqueChannelIds.join(",")}`,
    ),
  );

  const nextMap: ChzzkLiveStatusMap = {};
  data.items?.forEach(({ channelId, content }) => {
    const memberUids = channelToMembers[channelId] || [];
    memberUids.forEach((uid) => {
      nextMap[uid] = content ?? null;
    });
  });

  return {
    statuses: nextMap,
    scheduleAutoFill: {
      updated: data.scheduleAutoFill?.updated ?? 0,
    },
  };
}

export async function fetchLiveStatusDiagnostics(
  members: MemberDto[],
  options?: { schedules?: ScheduleDto[] }
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
  }>(
    withRouteSearch(
      apiRoutes.chzzk.liveStatus.build(),
      `channelIds=${uniqueChannelIds.join(",")}&debug=1`,
    ),
  );

  return {
    updatedAt: data.updatedAt,
    items: data.items ?? [],
    channelToMembers,
  };
}

export async function autoFillLiveSchedulesForMembers(
  members: MemberDto[],
  options?: { schedules?: ScheduleDto[] },
): Promise<LiveScheduleAutoFillResponseDto> {
  const { uniqueChannelIds } = buildChannelToMembers(
    members,
    options?.schedules,
  );
  if (uniqueChannelIds.length === 0) {
    return {
      updatedAt: new Date().toISOString(),
      checkedChannelCount: 0,
      scheduleAutoFill: { updated: 0 },
    };
  }

  const payload: LiveScheduleAutoFillRequestDto = {
    channelIds: uniqueChannelIds,
  };
  return apiFetch<LiveScheduleAutoFillResponseDto>(
    apiRoutes.operations.liveScheduleAutoFill.build(),
    {
      method: "POST",
      json: payload,
    },
  );
}
