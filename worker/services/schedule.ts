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
  const existingPending = await db.select().from(pendingSchedules);
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
    pendingItems: NewPendingSchedule[];
    logItems: NewUpdateLog[];
    details: AutoUpdateDetail[];
    checkedCount: number;
    newVodIds: string[];
    newPendingKeys: string[];
  };

  const results = await pMap(
    allMembers,
    async (member): Promise<ProcessResult | null> => {
      const channelId = extractChzzkChannelId(member.url_chzzk);
      if (!channelId) return null;

      const videos = await fetchChzzkVideos(channelId, 0, 15);
      if (!videos?.data || videos.data.length === 0) return null;

      const result: ProcessResult = {
        pendingItems: [],
        logItems: [],
        details: [],
        checkedCount: 0,
        newVodIds: [],
        newPendingKeys: [],
      };

      for (const video of videos.data) {
        // VOD ID로 중복 체크
        // 주의: 병렬 실행 시 pendingVodIds에 대한 동시성 문제가 있을 수 있으나,
        // 각 멤버는 독립적이므로 멤버 간 VOD 중복(collaboration)만 문제될 수 있음.
        // 하지만 여기서는 pendingVodIds를 읽기만 하고, 쓰기는 나중에 모아서 함.
        // 같은 VOD가 여러 멤버에게 동시에 뜰 수 있음(합방).
        // 이 경우 중복으로 들어갈 수 있지만, UNIQUE constraints가 없으면 들어감.
        // pendingVodIds에 넣는 건 나중에 한 번에.

        const vodId = `chzzk:${video.videoId}`;
        if (pendingVodIds.has(vodId)) continue; // 이미 처리된 VOD

        // 실제 스트리밍 시작 시간 계산
        const startTimestamp = video.publishDateAt - video.duration * 1000;
        const videoDate = getKSTDateString(new Date(startTimestamp));

        if (videoDate < startDate || videoDate > today) continue;

        result.checkedCount++;

        const scheduleKey = `${member.uid}:${videoDate}`;
        const memberSchedules = scheduleMap.get(scheduleKey) || [];
        const startTime = extractKSTTime(
          new Date(startTimestamp).toISOString(),
        );

        const pendingKey = `${member.uid}:${videoDate}:${startTime}`;
        if (pendingKeys.has(pendingKey)) continue;

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
          result.pendingItems.push({
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
          });
          result.newVodIds.push(vodId);
          result.newPendingKeys.push(pendingKey);

          result.logItems.push({
            schedule_id: null,
            member_uid: member.uid,
            member_name: member.name,
            schedule_date: videoDate,
            action: "auto_collected",
            title: video.videoTitle,
            previous_status: null,
            actor_name: "system",
          });

          result.details.push({
            memberUid: member.uid,
            memberName: member.name,
            scheduleId: null,
            scheduleDate: videoDate,
            action: "auto_collected",
            title: video.videoTitle,
            previousStatus: null,
          });
        } else if (
          matchingSchedule.status !== "방송" ||
          !matchingSchedule.title?.trim()
        ) {
          result.pendingItems.push({
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
          });
          result.newVodIds.push(vodId);
          result.newPendingKeys.push(pendingKey);

          result.logItems.push({
            schedule_id: matchingSchedule.id,
            member_uid: member.uid,
            member_name: member.name,
            schedule_date: videoDate,
            action: "auto_updated",
            title: video.videoTitle,
            previous_status: matchingSchedule.status,
            actor_name: "system",
          });

          result.details.push({
            memberUid: member.uid,
            memberName: member.name,
            scheduleId: matchingSchedule.id,
            scheduleDate: videoDate,
            action: "auto_updated",
            title: video.videoTitle,
            previousStatus: matchingSchedule.status,
          });
        }
      }
      return result;
    },
    10, // Concurrency limit
  );

  // 5. 결과 집계 및 일괄 삽입
  const allPendingItems: NewPendingSchedule[] = [];
  const allLogItems: NewUpdateLog[] = [];
  const allDetails: AutoUpdateDetail[] = [];
  let totalChecked = 0;

  for (const res of results) {
    if (res) {
      allPendingItems.push(...res.pendingItems);
      allLogItems.push(...res.logItems);
      allDetails.push(...res.details);
      totalChecked += res.checkedCount;
    }
  }

  // Batch insert (SQLite variables limit considerations)
  // Chunking by 50 items.
  const CHUNK_SIZE = 50;

  if (allPendingItems.length > 0) {
    for (let i = 0; i < allPendingItems.length; i += CHUNK_SIZE) {
      await db
        .insert(pendingSchedules)
        .values(allPendingItems.slice(i, i + CHUNK_SIZE));
    }
  }

  if (allLogItems.length > 0) {
    for (let i = 0; i < allLogItems.length; i += CHUNK_SIZE) {
      await db.insert(updateLogs).values(allLogItems.slice(i, i + CHUNK_SIZE));
    }
  }

  return {
    updated: allPendingItems.length,
    checked: totalChecked,
    details: allDetails,
  };
};
