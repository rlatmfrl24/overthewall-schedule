import { and, gte, lte, sql } from "drizzle-orm";
import { type DbInstance } from "../db";
import {
  members,
  pendingSchedules,
  schedules,
  updateLogs,
} from "../../src/db/schema";
import type {
  AutoUpdateDetail,
  CachedChzzkVideos,
  NewPendingSchedule,
  NewUpdateLog,
} from "../types";
import {
  extractChzzkChannelId,
  extractKSTTime,
  getKSTDateString,
  pMap,
} from "../utils/helpers";
import { fetchChzzkVideos } from "./chzzk";

const CHZZK_SCAN_PAGE_SIZE = 5;
const CHZZK_SCAN_MAX_PAGES = 3;
const UPDATE_LOG_CHUNK_SIZE = 12;

type ChzzkVideo = NonNullable<NonNullable<CachedChzzkVideos["content"]>["data"]>[number];

type PendingCandidate = {
  pendingItem: NewPendingSchedule;
  logItem: NewUpdateLog;
  detail: AutoUpdateDetail;
  pendingKey: string;
  vodId: string;
};

type ProcessEntry =
  | {
      kind: "candidate";
      candidate: PendingCandidate;
    }
  | {
      kind: "detail";
      detail: AutoUpdateDetail;
    };

const resolveVideoTiming = (video: ChzzkVideo) => {
  const startTimestamp = video.publishDateAt - video.duration * 1000;
  const startedAt = new Date(startTimestamp);
  return {
    startTimestamp,
    startedAt,
    videoDate: getKSTDateString(startedAt),
  };
};

export const scanRecentChzzkVideos = async (
  channelId: string,
  startDate: string,
  today: string,
  fetchVideos: typeof fetchChzzkVideos = fetchChzzkVideos,
): Promise<ChzzkVideo[]> => {
  const collected: ChzzkVideo[] = [];

  for (let page = 0; page < CHZZK_SCAN_MAX_PAGES; page += 1) {
    const response = await fetchVideos(channelId, page, CHZZK_SCAN_PAGE_SIZE);
    const pageItems = response?.data ?? [];

    if (pageItems.length === 0) {
      break;
    }

    let reachedOutOfRange = false;

    for (const video of pageItems) {
      const { videoDate } = resolveVideoTiming(video);

      if (videoDate < startDate) {
        reachedOutOfRange = true;
        break;
      }

      if (videoDate > today) {
        continue;
      }

      collected.push(video);
    }

    if (reachedOutOfRange || pageItems.length < CHZZK_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return collected;
};

// 자동 업데이트 핵심 로직 (승인 프로세스 적용)
// - VOD 수집 후 pending_schedules 테이블에 저장 (관리자 승인 대기)
// - 스케줄 없음 + VOD 있음 → pending에 action_type: "create"로 저장
// - 스케줄 있음 + (방송 상태 아니거나 제목 없음) + VOD 있음 → pending에 action_type: "update"로 저장
// - 스케줄 있음 + 방송 상태 + 제목 있음 → 변경 없음
export const autoUpdateSchedules = async (
  db: DbInstance,
  rangeDays: number = 3,
): Promise<{
  updated: number;
  checked: number;
  details: AutoUpdateDetail[];
}> => {
  const today = getKSTDateString();
  const startDate = getKSTDateString(
    new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000),
  );

  // 1. 모든 활성 멤버 조회 (is_deprecated가 아닌 것)
  const allMembers = await db
    .select({
      uid: members.uid,
      name: members.name,
      url_chzzk: members.url_chzzk,
    })
    .from(members)
    .where(
      sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1`,
    );

  if (allMembers.length === 0) {
    return { updated: 0, checked: 0, details: [] };
  }

  // 2. 날짜 범위 내의 모든 스케줄 조회 (한 번에)
  const existingSchedules = await db
    .select()
    .from(schedules)
    .where(and(gte(schedules.date, startDate), lte(schedules.date, today)));

  // 스케줄을 member_uid + date 기준으로 맵핑 (한 날짜에 여러 스케줄 가능)
  const scheduleMap = new Map<string, (typeof existingSchedules)[0][]>();
  for (const schedule of existingSchedules) {
    const key = `${schedule.member_uid}:${schedule.date}`;
    const existing = scheduleMap.get(key) || [];
    existing.push(schedule);
    scheduleMap.set(key, existing);
  }

  // 3. 기존 대기 스케줄 조회 (중복 방지용)
  const existingPending = await db
    .select({
      member_uid: pendingSchedules.member_uid,
      date: pendingSchedules.date,
      start_time: pendingSchedules.start_time,
      vod_id: pendingSchedules.vod_id,
    })
    .from(pendingSchedules);
  const pendingVodIds = new Set(
    existingPending.filter((p) => p.vod_id).map((p) => p.vod_id),
  );
  // member_uid + date + start_time 조합으로도 중복 체크
  const pendingKeys = new Set(
    existingPending.map(
      (p) => `${p.member_uid}:${p.date}:${p.start_time || ""}`,
    ),
  );

  // 4. 각 멤버별로 VOD 확인 (병렬 처리)
  // 결과를 모아서 한 번에 처리
  type ProcessResult = {
    entries: ProcessEntry[];
    checkedCount: number;
  };

  const results = await pMap(
    allMembers,
    async (member): Promise<ProcessResult | null> => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      if (!channelId) return null;

      const videos = await scanRecentChzzkVideos(channelId, startDate, today);
      if (videos.length === 0) return null;

      const result: ProcessResult = {
        entries: [],
        checkedCount: 0,
      };

      for (const video of videos) {
        const vodId = `chzzk:${video.videoId}`;
        const { startedAt, videoDate } = resolveVideoTiming(video);

        result.checkedCount++;

        const scheduleKey = `${member.uid}:${videoDate}`;
        const memberSchedules = scheduleMap.get(scheduleKey) || [];
        const startTime = extractKSTTime(startedAt.toISOString());

        const pendingKey = `${member.uid}:${videoDate}:${startTime}`;

        const videoMinutes =
          parseInt(startTime.split(":")[0]) * 60 +
          parseInt(startTime.split(":")[1]);

        const matchingSchedule = memberSchedules.find((schedule) => {
          if (!schedule.start_time) return false;
          const scheduleMinutes =
            parseInt(schedule.start_time.split(":")[0]) * 60 +
            parseInt(schedule.start_time.split(":")[1]);
          return Math.abs(videoMinutes - scheduleMinutes) <= 30;
        });

        if (!matchingSchedule) {
          result.entries.push({
            kind: "candidate",
            candidate: {
              pendingItem: {
                member_uid: member.uid,
                member_name: member.name,
                date: videoDate,
                start_time: startTime,
                title: video.videoTitle,
                status: "방송",
                action_type: "create",
                existing_schedule_id: null,
                previous_status: null,
                previous_title: null,
                vod_id: vodId,
              },
              logItem: {
                schedule_id: null,
                member_uid: member.uid,
                member_name: member.name,
                schedule_date: videoDate,
                action: "auto_collected",
                title: video.videoTitle,
                previous_status: null,
                actor_name: "system",
              },
              detail: {
                memberUid: member.uid,
                memberName: member.name,
                scheduleId: null,
                scheduleDate: videoDate,
                action: "auto_collected",
                title: video.videoTitle,
                previousStatus: null,
              },
              pendingKey,
              vodId,
            },
          });
        } else if (
          matchingSchedule.status !== "방송" ||
          !matchingSchedule.title?.trim()
        ) {
          result.entries.push({
            kind: "candidate",
            candidate: {
              pendingItem: {
                member_uid: member.uid,
                member_name: member.name,
                date: videoDate,
                start_time: startTime,
                title: video.videoTitle,
                status: "방송",
                action_type: "update",
                existing_schedule_id: matchingSchedule.id,
                previous_status: matchingSchedule.status,
                previous_title: matchingSchedule.title,
                vod_id: vodId,
              },
              logItem: {
                schedule_id: matchingSchedule.id,
                member_uid: member.uid,
                member_name: member.name,
                schedule_date: videoDate,
                action: "auto_updated",
                title: video.videoTitle,
                previous_status: matchingSchedule.status,
                actor_name: "system",
              },
              detail: {
                memberUid: member.uid,
                memberName: member.name,
                scheduleId: matchingSchedule.id,
                scheduleDate: videoDate,
                action: "auto_updated",
                title: video.videoTitle,
                previousStatus: matchingSchedule.status,
              },
              pendingKey,
              vodId,
            },
          });
        } else {
          // 이미 스케줄이 존재하고, 업데이트가 필요 없는 경우
          result.entries.push({
            kind: "detail",
            detail: {
              memberUid: member.uid,
              memberName: member.name,
              scheduleId: matchingSchedule.id,
              scheduleDate: videoDate,
              action: "existing",
              title: matchingSchedule.title,
              previousStatus: matchingSchedule.status,
            },
          });
        }
      }
      return result;
    },
    10, // Concurrency limit
  );

  const allLogItems: NewUpdateLog[] = [];
  const allDetails: AutoUpdateDetail[] = [];
  let totalChecked = 0;
  let insertedPendingCount = 0;
  const newVodIds = new Set<string>();
  const newPendingKeys = new Set<string>();

  for (const res of results) {
    if (!res) {
      continue;
    }

    totalChecked += res.checkedCount;

    for (const entry of res.entries) {
      if (entry.kind === "detail") {
        allDetails.push(entry.detail);
        continue;
      }

      const { candidate } = entry;

      if (
        pendingVodIds.has(candidate.vodId) ||
        newVodIds.has(candidate.vodId) ||
        pendingKeys.has(candidate.pendingKey) ||
        newPendingKeys.has(candidate.pendingKey)
      ) {
        continue;
      }

      const insertResult = await db
        .insert(pendingSchedules)
        .values(candidate.pendingItem)
        .onConflictDoNothing();

      newVodIds.add(candidate.vodId);
      newPendingKeys.add(candidate.pendingKey);

      if (insertResult.meta.changes !== 1) {
        continue;
      }

      insertedPendingCount += 1;
      allLogItems.push(candidate.logItem);
      allDetails.push(candidate.detail);
    }
  }

  if (allLogItems.length > 0) {
    for (let i = 0; i < allLogItems.length; i += UPDATE_LOG_CHUNK_SIZE) {
      await db
        .insert(updateLogs)
        .values(allLogItems.slice(i, i + UPDATE_LOG_CHUNK_SIZE));
    }
  }

  return {
    updated: insertedPendingCount,
    checked: totalChecked,
    details: allDetails,
  };
};
