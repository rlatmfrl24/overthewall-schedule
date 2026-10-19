import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";
import { holidayTargetDate, recordHolidayAssessments, reconcileHolidaySuggestions,executeHolidayCollectorCommand, type ScanCoverage } from "./holiday-suggestions";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { type DbInstance } from "../../../platform/db";
import {
  members,
  pendingSchedules,
  scheduleBroadcastObservations,
  schedules,
} from "@db/schema";
import type {
  AutoUpdateDetail,
  NewPendingSchedule,
  NewUpdateLog,
} from "../../../platform/types";
import {
  extractChzzkChannelId,
  getKSTDateString,
} from "../../../platform/http-helpers";
import {
  chzzkVideoCatalog,
  type ChzzkVideoCatalog,
} from "../../chzzk";
import {
  buildBroadcastSessions,
  matchBroadcastSessions,
  type AutoUpdateSchedule,
  type AutoUpdateSessionDecision,
  type BroadcastObservation,
} from "../domain/auto-update-matcher";
import type {ChzzkScanCommand} from "@contracts/chzzk-scan";
import type {D1ChzzkScanWriter} from "./publication-writers";
import type {ChzzkScanResult} from "@contracts/chzzk-scan";
import type {ChzzkScanProvider,ScanVideo} from "./chzzk-scan-types";
import {CHZZK_SESSION_RESUME_MARGIN_MS} from "../domain/chzzk-scan-command";
import {parseCollectorCommand,type CollectorCommand} from "../domain/collector-command";
import type {CollectorWriter} from "./collector-writer";
import type {ChzzkMatchInput} from "../domain/chzzk-match-input";
import { editableCollectorSql } from "../../content-access";
import { isScheduleMemberActive, SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";
import { readScheduleEndMemberUids } from "./automatic-schedule-policy";

const CHZZK_SCAN_PAGE_SIZE = 5;
const CHZZK_SCAN_MAX_PAGES = 3;

type ChzzkVideo = ScanVideo;

export type AutoUpdateMatchTarget = {
  memberUid: number;
  date: string;
};

type PendingCandidate = {
  pendingItem: NewPendingSchedule;
  logItem: NewUpdateLog;
  detail: AutoUpdateDetail;
  pendingKey: string;
  vodId: string;
  sourceVodIds: string[];
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

// Legacy compound rejections keep global fragment suppression; simple history uses the VOD index.
const rejectedCandidateSql = `SELECT vod_id FROM schedule_candidate_rejections WHERE vod_id IN(SELECT value FROM json_each(?))
  UNION SELECT source.value AS vod_id FROM schedule_candidate_rejections rejection INDEXED BY idx_schedule_rejections_fragments
  CROSS JOIN json_each(CASE WHEN json_valid(rejection.source_vod_ids) THEN CASE WHEN json_type(rejection.source_vod_ids)='array' THEN rejection.source_vod_ids ELSE '[]' END ELSE '[]' END) source
  WHERE rejection.source_vod_ids IS NOT NULL AND rejection.source_vod_ids<>'[]'
    AND source.type='text' AND source.value IN(SELECT value FROM json_each(?))`;
const readRejectedCandidates=async(db:DbInstance,ids:string[])=>ids.length?(await db.$client.prepare(rejectedCandidateSql).bind(JSON.stringify(ids),JSON.stringify(ids)).all<{vod_id:string}>()).results:[];

const insertPendingSchedule = async (
  db: DbInstance,
  item: NewPendingSchedule,
  logItem: NewUpdateLog,
  transitionWriter?:CollectorWriter,
  expectedSchedules:Extract<CollectorCommand,{action:"insert_candidate"}>["schedules"]=[],
) => {
  const insertStatement = db.$client
    .prepare(
      `INSERT INTO pending_schedules (
      member_uid,
      member_name,
      date,
      start_time,
      title,
      status,
      action_type,
      existing_schedule_id,
      previous_status,
      previous_title,
      previous_start_time,
      candidate_kind,
      match_reason,
      match_confidence,
      ranked_schedule_ids,
      source_vod_ids,
      session_started_at,
      session_ended_at,
      vod_segment_count,
      vod_id,
      vod_started_at,
      vod_duration_seconds,
      vod_thumbnail_url
    )
    SELECT
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? IS NULL
       OR NOT EXISTS (
         ${rejectedCandidateSql}
       )
    ON CONFLICT DO NOTHING RETURNING id`,
    )
    .bind(
      item.member_uid,
      item.member_name,
      item.date,
      item.start_time ?? null,
      item.title ?? null,
      item.status ?? "방송",
      item.action_type,
      item.existing_schedule_id ?? null,
      item.previous_status ?? null,
      item.previous_title ?? null,
      item.previous_start_time ?? null,
      item.candidate_kind ?? null,
      item.match_reason ?? null,
      item.match_confidence ?? null,
      item.ranked_schedule_ids ?? null,
      item.source_vod_ids ?? null,
      item.session_started_at ?? null,
      item.session_ended_at ?? null,
      item.vod_segment_count ?? 1,
      item.vod_id ?? null,
      item.vod_started_at ?? null,
      item.vod_duration_seconds ?? null,
      item.vod_thumbnail_url ?? null,
      item.vod_id ?? null,
      JSON.stringify([...(item.vod_id?[item.vod_id]:[]),...parseJsonArray(item.source_vod_ids??null)]),
      JSON.stringify([...(item.vod_id?[item.vod_id]:[]),...parseJsonArray(item.source_vod_ids??null)]),
    );
  const logStatement = db.$client
    .prepare(
      `INSERT INTO update_logs (
         schedule_id,
         member_uid,
         member_name,
         schedule_date,
         action,
         title,
         previous_status,
         vod_id,
         actor_name
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE changes() = 1`,
    )
    .bind(
      logItem.schedule_id ?? null,
      logItem.member_uid ?? null,
      logItem.member_name ?? null,
      logItem.schedule_date ?? null,
      logItem.action,
      logItem.title ?? null,
      logItem.previous_status ?? null,
      logItem.vod_id ?? null,
      logItem.actor_name ?? "system",
    );
  const statements=[insertStatement,logStatement];
  const command=parseCollectorCommand({action:"insert_candidate",item,log:logItem,schedules:expectedSchedules});
  if(!command) throw new Error("Invalid original candidate");
  const [insertResult] = await transitionWriter?.write(command,statements)??await db.$client.batch(statements);
  return insertResult;
};

const deleteObsoletePending = async (
  db: DbInstance,
  pending: {
    id: number;
    member_uid: number;
    date: string;
    existing_schedule_id: number | null;
    vod_id: string | null;
    action_type:string;
    candidate_kind:string|null;
  },
  memberName: string | null,
  transitionWriter?:CollectorWriter,
) => {
  const deleteStatement = db.$client
    .prepare("DELETE FROM pending_schedules WHERE id = ? RETURNING id")
    .bind(pending.id);
  const logStatement = db.$client
    .prepare(
      `INSERT INTO update_logs (
         schedule_id,
         member_uid,
         member_name,
         schedule_date,
         action,
         title,
         previous_status,
         vod_id,
         actor_name
       )
       SELECT ?, ?, ?, ?, 'candidate_obsolete',
              'auto update candidate reconciled', NULL, ?, 'system'
       WHERE changes() = 1`,
    )
    .bind(
      pending.existing_schedule_id,
      pending.member_uid,
      memberName,
      pending.date,
      pending.vod_id,
    );
  const statements=[deleteStatement,logStatement];
  const command=parseCollectorCommand({action:"obsolete_candidate",pending,memberName});if(!command) throw new Error("Invalid original obsolete candidate");
  const [deleteResult] = await transitionWriter?.write(command,statements)??await db.$client.batch(statements);
  return deleteResult.results.length === 1;
};

const D1_MAX_BOUND_PARAMETERS = 100;
export async function executeCollectorCommand(db:DbInstance,command:CollectorCommand,writer:CollectorWriter) {
  if(command.action==="insert_candidate") {
    const item:NewPendingSchedule={...command.item,member_uid:Number(command.item.member_uid),member_name:String(command.item.member_name),date:String(command.item.date),action_type:String(command.item.action_type)};
    const log:NewUpdateLog={...command.log,action:String(command.log.action),schedule_date:String(command.log.schedule_date)};
    return insertPendingSchedule(db,item,log,writer,command.schedules);
  }
  if(command.action==="obsolete_candidate") return deleteObsoletePending(db,command.pending,command.memberName,writer);
  return executeHolidayCollectorCommand(db.$client,command,writer);
}
const OBSERVATION_BOUND_PARAMETERS_PER_ROW = 10;
const OBSERVATION_UPSERT_BOUND_PARAMETERS = 1;

// D1은 쿼리당 bind parameter를 최대 100개만 허용한다. 관측 1건은
// INSERT 값 10개를 사용하고 upsert의 last_seen_at 갱신값 1개가 추가된다.
export const OBSERVATION_CHUNK_SIZE = Math.floor(
  (D1_MAX_BOUND_PARAMETERS - OBSERVATION_UPSERT_BOUND_PARAMETERS) /
    OBSERVATION_BOUND_PARAMETERS_PER_ROW,
);
const SESSION_RESUME_MARGIN_MS = CHZZK_SESSION_RESUME_MARGIN_MS;

const toObservation = (
  member: { uid: number; name: string },
  channelId: string,
  video: ChzzkVideo,
): BroadcastObservation & { channelId: string } => {
  const { startTimestamp } = resolveVideoTiming(video);
  const durationSeconds = Number.isFinite(video.duration)
    ? Math.max(0, Math.floor(video.duration))
    : 0;
  return {
    vodId: `chzzk:${video.videoId}`,
    memberUid: member.uid,
    memberName: member.name,
    channelId,
    title: video.videoTitle,
    startedAt: startTimestamp,
    endedAt: video.publishDateAt,
    durationSeconds,
    thumbnailUrl: video.thumbnailImageUrl || null,
  };
};

const persistObservations = async (
  db: DbInstance,
  observations: Array<BroadcastObservation & { channelId: string }>,
  statements?: D1PreparedStatement[],
  observedAt = Date.now(),
) => {
  for (
    let index = 0;
    index < observations.length;
    index += OBSERVATION_CHUNK_SIZE
  ) {
    const chunk = observations.slice(index, index + OBSERVATION_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const query = db
      .insert(scheduleBroadcastObservations)
      .values(
        chunk.map((item) => ({
          vod_id: item.vodId,
          member_uid: item.memberUid,
          channel_id: item.channelId,
          title: item.title,
          started_at: item.startedAt,
          ended_at: item.endedAt,
          duration_seconds: item.durationSeconds,
          thumbnail_url: item.thumbnailUrl,
          first_seen_at: observedAt,
          last_seen_at: observedAt,
        })),
      )
      .onConflictDoUpdate({
        target: scheduleBroadcastObservations.vod_id,
        set: {
          member_uid: sql`excluded.member_uid`,
          channel_id: sql`excluded.channel_id`,
          title: sql`excluded.title`,
          started_at: sql`excluded.started_at`,
          ended_at: sql`excluded.ended_at`,
          duration_seconds: sql`excluded.duration_seconds`,
          thumbnail_url: sql`excluded.thumbnail_url`,
          last_seen_at: observedAt,
        },
      });
    if(statements) { const native=query.toSQL();statements.push(db.$client.prepare(native.sql).bind(...native.params)); }
    else await query;
  }
};

const parseJsonArray = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const toCandidate = (
  decision: Extract<AutoUpdateSessionDecision, { kind: "candidate" }>,
  scheduleMap: Map<number, AutoUpdateSchedule>,
): PendingCandidate => {
  const target = decision.scheduleId
    ? scheduleMap.get(decision.scheduleId) ?? null
    : null;
  const session = decision.session;
  const action = decision.candidateKind === "missing_schedule"
    ? "auto_collected"
    : "auto_updated";
  const actionType = decision.candidateKind === "missing_schedule"
    ? "create"
    : "update";
  const rankedScheduleIds = decision.rankedSchedules.map((item) => item.scheduleId);
  const sourceVodIds = session.sourceVodIds;
  const pendingItem: NewPendingSchedule = {
    member_uid: session.memberUid,
    member_name: session.memberName,
    date: session.date,
    start_time: session.startTime,
    title: session.title,
    status: actionType === "create" ? "방송" : (target?.status ?? "방송"),
    action_type: actionType,
    existing_schedule_id: decision.scheduleId,
    previous_status: target?.status ?? null,
    previous_start_time: target?.startTime ?? null,
    previous_title: target?.title ?? null,
    candidate_kind: decision.candidateKind,
    match_reason: decision.reason,
    match_confidence: decision.confidence,
    ranked_schedule_ids: JSON.stringify(rankedScheduleIds),
    source_vod_ids: JSON.stringify(sourceVodIds),
    session_started_at: new Date(session.startedAt).toISOString(),
    session_ended_at: new Date(session.endedAt).toISOString(),
    vod_segment_count: session.segmentCount,
    vod_id: session.vodId,
    vod_started_at: new Date(session.startedAt).toISOString(),
    vod_duration_seconds: session.durationSeconds,
    vod_thumbnail_url: session.thumbnailUrl,
  };
  return {
    pendingItem,
    logItem: {
      schedule_id: decision.scheduleId,
      member_uid: session.memberUid,
      member_name: session.memberName,
      schedule_date: session.date,
      action,
      title: session.title,
      previous_status: target?.status ?? null,
      vod_id: session.vodId,
      actor_name: "system",
    },
    detail: {
      memberUid: session.memberUid,
      memberName: session.memberName,
      scheduleId: decision.scheduleId,
      scheduleDate: session.date,
      action,
      title: session.title,
      previousStatus: target?.status ?? null,
      vodId: session.vodId,
      candidateKind: decision.candidateKind,
      matchReason: decision.reason,
      matchConfidence: decision.confidence,
      sessionStartedAt: new Date(session.startedAt).toISOString(),
      sessionEndedAt: new Date(session.endedAt).toISOString(),
      segmentCount: session.segmentCount,
    },
    pendingKey: `${session.memberUid}:${session.date}:${session.startTime}`,
    vodId: session.vodId,
    sourceVodIds,
  };
};

export const scanRecentChzzkVideos = async (
  channelId: string,
  startDate: string,
  today: string,
  fetchVideos: ChzzkVideoCatalog["fetchVideos"] =
    chzzkVideoCatalog.fetchVideos,
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

export const scanRecentChzzkVideosForChannels = async (
  channelIds: string[],
  startDate: string,
  today: string,
  cacheDb?: Pick<D1Database, "prepare">,
  fetchVideosBatch: ChzzkScanProvider["fetchVideosBatch"] =
    chzzkVideoCatalog.fetchVideosBatch,
  coverage = new Map<string, ScanCoverage>(),
  siteId: SiteId = "otw",
) => {
  const collectedByChannel = new Map<string, ChzzkVideo[]>();
  let activeChannelIds = Array.from(new Set(channelIds));
  for (const channelId of activeChannelIds) {
    collectedByChannel.set(channelId, []);
    coverage.set(channelId, "incomplete");
  }

  for (
    let page = 0;
    page < CHZZK_SCAN_MAX_PAGES && activeChannelIds.length > 0;
    page += 1
  ) {
    for (const id of activeChannelIds) coverage.set(id, "failed");
    const items = await fetchVideosBatch(
      activeChannelIds.map((channelId) => ({
        channelId,
        page,
        size: CHZZK_SCAN_PAGE_SIZE,
        cacheable: true,
      })),
      cacheDb,
      { forceRefresh: true, requireFresh: true, siteId },
    ).catch(() => []);
    const nextChannelIds: string[] = [];
    for (const id of activeChannelIds) coverage.set(id, "failed");

    for (const item of items) {
      if (!item.content || !Array.isArray(item.content.data)) continue;
      const pageItems = item.content.data;
      coverage.set(item.channelId, pageItems.length < CHZZK_SCAN_PAGE_SIZE ? "complete" : "incomplete");
      if (pageItems.length === 0) continue;

      const collected = collectedByChannel.get(item.channelId) ?? [];
      let reachedOutOfRange = false;
      let invalidTiming = false;
      for (const video of pageItems) {
        if (!Number.isFinite(video.publishDateAt) || !Number.isFinite(video.duration) || video.duration < 0) {
          coverage.set(item.channelId, "incomplete");
          invalidTiming = true;
          break;
        }
        const { videoDate } = resolveVideoTiming(video);
        // A replay published after midnight may have started the preceding day.
        if (video.publishDateAt < Date.parse(`${startDate}T00:00:00+09:00`)) {
          reachedOutOfRange = true;
          break;
        }
        if (videoDate <= today) {
          collected.push(video);
        }
      }
      collectedByChannel.set(item.channelId, collected);
      if (reachedOutOfRange) coverage.set(item.channelId, "complete");

      if (!invalidTiming && !reachedOutOfRange && pageItems.length === CHZZK_SCAN_PAGE_SIZE) {
        nextChannelIds.push(item.channelId);
      }
    }

    activeChannelIds = nextChannelIds;
  }

  return collectedByChannel;
};

export const scanAndPersistRecentChzzkObservations = async (
  db: DbInstance,
  rangeDays: number,
  requestedChannelIds: string[],
  cacheDb?: Pick<D1Database, "prepare">,
  videoCatalog: ChzzkVideoCatalog = chzzkVideoCatalog,
  transitionWriter?: D1ChzzkScanWriter,
  parent?:ChzzkScanCommand["parent"],
) => {
  const scanStartedAt = Date.now();
  const today = getKSTDateString(new Date(scanStartedAt));
  const daysBack = Math.max(holidayTargetDate(scanStartedAt) ? 1 : 0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(scanStartedAt - daysBack * 24 * 60 * 60 * 1000),
  );
  const requested = new Set(requestedChannelIds.map((id) => id.toLowerCase()));
  const activeMembers = await db
    .select({
      uid: members.uid,
      code: members.code,
      name: members.name,
      url_chzzk: members.url_chzzk,
    })
    .from(members)
    .where(
      sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1`,
    );
  const targets = activeMembers.flatMap((member) => {
    const channelId = extractChzzkChannelId(member.url_chzzk)?.toLowerCase();
    return channelId && requested.has(channelId)
      ? [{ member, channelId }]
      : [];
  });
  const channelIds = Array.from(new Set(targets.map((target) => target.channelId)));
  if (channelIds.length === 0) return { channels: 0, observations: 0, channelResults: [] };
  const command:ChzzkScanCommand={members:targets.map(({member,channelId})=>({uid:member.uid,code:member.code,name:member.name,channelId})),rangeDays:Math.max(1,Math.floor(rangeDays)),startedAt:scanStartedAt,startDate,today,...(parent?{parent}:{})};
  const execute=(original:ChzzkScanCommand,catalog:ChzzkScanProvider,commit?:(statements:D1PreparedStatement[],result:ChzzkScanResult)=>Promise<void>)=>executeChzzkObservationScan(db,original,cacheDb,catalog,commit,transitionWriter?.siteId??"otw");
  return transitionWriter?transitionWriter.run(command,videoCatalog,execute):execute(command,videoCatalog);
};

export const executeChzzkObservationScan = async (
  db:DbInstance,command:ChzzkScanCommand,cacheDb:Pick<D1Database,"prepare">|undefined,
  videoCatalog:ChzzkScanProvider,commit?:(statements:D1PreparedStatement[],result:ChzzkScanResult)=>Promise<void>,
  siteId: SiteId = "otw",
):Promise<ChzzkScanResult>=>{
  const {startDate,today,startedAt}=command;
  const eligibleMembers = command.members.filter(member => isScheduleMemberActive(siteId, member.code, startDate));
  const channelIds = eligibleMembers.map(member => member.channelId);
  if (!channelIds.length) return { channels: 0, observations: 0, channelResults: [] };
  const coverage = new Map<string, ScanCoverage>();
  const videosByChannel = await scanRecentChzzkVideosForChannels(
    channelIds,
    startDate,
    today,
    cacheDb,
    videoCatalog.fetchVideosBatch,
    coverage,
    siteId,
  );
  const observations = eligibleMembers.flatMap(member =>
    (videosByChannel.get(member.channelId) ?? []).filter(video => isScheduleMemberActive(siteId, member.code, resolveVideoTiming(video).videoDate)).map((video) =>
      toObservation(member, member.channelId, video)
    )
  );
  const statements=commit?[] as D1PreparedStatement[]:undefined;
  await persistObservations(db, observations,statements,startedAt);
  await recordHolidayAssessments(db.$client, eligibleMembers.filter(member => isScheduleMemberActive(siteId, member.code, holidayTargetDate(startedAt) ?? today)).map(member=>({...member,url_chzzk:`https://chzzk.naver.com/${member.channelId}`})), coverage, videoCatalog.fetchLiveStatus, startedAt,statements);
  const result={
    channels: channelIds.length,
    observations: observations.length,
    channelResults: channelIds.map(channelId => ({
      channelId, status: coverage.get(channelId) ?? ("incomplete" as ScanCoverage),
    })),
  };
  if(commit) await commit(statements!,result);
  return result;
};

export const readAutoUpdateMatchTargets = async (
  db: DbInstance,
  rangeDays: number,
  admittedChannels?:readonly string[],
  siteId:SiteId="otw",
): Promise<AutoUpdateMatchTarget[]> => {
  const today = getKSTDateString();
  const daysBack = Math.max(holidayTargetDate() ? 1 : 0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
  );
  const rangeStartMs =
    Date.parse(`${startDate}T00:00:00+09:00`) - SESSION_RESUME_MARGIN_MS;
  const rangeEndMs = Date.parse(`${today}T23:59:59.999+09:00`);
  const [membersInScope, rows] = await Promise.all([
    db
      .select({ uid: members.uid, url_chzzk: members.url_chzzk })
      .from(members)
      .where(
        and(sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1)`,sql.raw(editableCollectorSql("members","members",siteId))),
      ),
    db
      .select({
        memberUid: scheduleBroadcastObservations.member_uid,
        startedAt: scheduleBroadcastObservations.started_at,
      })
      .from(scheduleBroadcastObservations)
      .where(
        and(
          gte(scheduleBroadcastObservations.ended_at, rangeStartMs),
          lte(scheduleBroadcastObservations.started_at, rangeEndMs),
        ),
      ),
  ]);
  const activeMembers=admittedChannels?membersInScope.filter(member=>admittedChannels.includes(extractChzzkChannelId(member.url_chzzk)?.toLowerCase()??"")):membersInScope;
  const activeMemberUids = new Set(activeMembers.map((member) => member.uid));
  const targets = new Map<string, AutoUpdateMatchTarget>();
  const endedMemberUids = await readScheduleEndMemberUids(db.$client, siteId);
  for (const row of rows) {
    if (!activeMemberUids.has(row.memberUid)) continue;
    const date = getKSTDateString(new Date(row.startedAt));
    if (endedMemberUids.has(row.memberUid) && date > SCHEDULE_MEMBER_END.lastDate) continue;
    if (date < startDate || date > today) continue;
    const target = { memberUid: row.memberUid, date };
    targets.set(`${target.memberUid}:${target.date}`, target);
  }
  const holidayDate = holidayTargetDate();
  if (holidayDate) for (const member of activeMembers) {
    if (endedMemberUids.has(member.uid) && holidayDate > SCHEDULE_MEMBER_END.lastDate) continue;
    if (!extractChzzkChannelId(member.url_chzzk)) continue;
    targets.set(`${member.uid}:${holidayDate}`, { memberUid: member.uid, date: holidayDate });
  }
  return Array.from(targets.values()).sort((left, right) =>
    left.date.localeCompare(right.date) || left.memberUid - right.memberUid
  );
};

// VOD 관측을 세션으로 합친 뒤 일정의 빈 필드만 승인 후보로 제안한다.
export const autoUpdateSchedules = async (
  db: DbInstance,
  rangeDays: number = 3,
  options: {
    cacheDb?: Pick<D1Database, "prepare">;
    videoCatalog?: ChzzkVideoCatalog;
    skipScan?: boolean;
    matchTarget?: AutoUpdateMatchTarget;
    collectorWriter?:CollectorWriter;
    originalInput?:ChzzkMatchInput;
  } = {},
): Promise<{
  updated: number;
  checked: number;
  segmentCount: number;
  sessionCount: number;
  resumeMergedCount: number;
  rejectedSuppressed: number;
  duplicatePending: number;
  shortSuppressed: number;
  holidaySuppressed: number;
  ambiguous: number;
  obsoletePending: number;
  details: AutoUpdateDetail[];
}> => {
  if(options.originalInput && (!options.skipScan || !options.matchTarget || !Number.isSafeInteger(options.originalInput.startedAt) || options.originalInput.members.some(member=>member.uid!==options.matchTarget!.memberUid))) throw new Error("Invalid original match input scope");
  const scanStartedAt = options.originalInput?.startedAt??Date.now();
  const endedMemberUids = await readScheduleEndMemberUids(db.$client, options.collectorWriter?.siteId ?? "otw");
  const activeOnDate = (uid: number, date: string) => !endedMemberUids.has(uid) || date <= SCHEDULE_MEMBER_END.lastDate;
  const today = getKSTDateString(new Date(scanStartedAt));
  const daysBack = Math.max(holidayTargetDate(scanStartedAt) ? 1 : 0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(scanStartedAt - daysBack * 24 * 60 * 60 * 1000),
  );

  // 1. 모든 활성 멤버 조회 (is_deprecated가 아닌 것)
  const activeMemberCondition =
    sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1) AND NOT (${sql.raw(publicationHiddenSql("members","members",options.collectorWriter?.siteId??"otw"))})`;
  const sourceMembers = options.originalInput?.members??await db
    .select({
      uid: members.uid,
      name: members.name,
      url_chzzk: members.url_chzzk,
    })
    .from(members)
    .where(
      options.matchTarget
        ? and(
            activeMemberCondition,
            eq(members.uid, options.matchTarget.memberUid),
          )
        : activeMemberCondition,
    );

  const allMembers = sourceMembers.filter(member => activeOnDate(member.uid, options.matchTarget?.date ?? startDate));
  if (allMembers.length === 0) {
    return {
      updated: 0,
      checked: 0,
      segmentCount: 0,
      sessionCount: 0,
      resumeMergedCount: 0,
      rejectedSuppressed: 0,
      duplicatePending: 0,
      shortSuppressed: 0,
      holidaySuppressed: 0,
      ambiguous: 0,
      obsoletePending: 0,
      details: [],
    };
  }

  // 2. 날짜 범위 내의 기존 일정 조회
  const scheduleRangeCondition = and(
    gte(schedules.date, startDate),
    lte(schedules.date, today),
  );
  const existingSchedules = options.originalInput?.schedules??await db
    .select()
    .from(schedules)
    .where(
      options.matchTarget
        ? and(
            scheduleRangeCondition,
            eq(schedules.member_uid, options.matchTarget.memberUid),
            eq(schedules.date, options.matchTarget.date),
          )
        : scheduleRangeCondition,
    );

  // 3. 채널별 최신 VOD를 가져와 영구 관측 기록을 갱신한다.
  const channelIds = Array.from(
    new Set(
      allMembers
        .map((member) =>
          extractChzzkChannelId(member.url_chzzk)?.toLowerCase(),
        )
        .filter((channelId): channelId is string => Boolean(channelId)),
    ),
  );
  let checkedObservationCount = 0;
  if (!options.skipScan) {
    const coverage = new Map<string, ScanCoverage>();
    const videosByChannel = await scanRecentChzzkVideosForChannels(
      channelIds,
      startDate,
      today,
      options.cacheDb,
      options.videoCatalog?.fetchVideosBatch,
      coverage,
      options.collectorWriter?.siteId??"otw",
    );
    const fetchedObservations = allMembers.flatMap((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk)?.toLowerCase();
      if (!channelId) return [];
      return (videosByChannel.get(channelId) ?? []).filter(video => activeOnDate(member.uid, resolveVideoTiming(video).videoDate)).map((video) =>
        toObservation(member, channelId, video),
      );
    });
    checkedObservationCount = fetchedObservations.length;
    await persistObservations(db, fetchedObservations);
    await recordHolidayAssessments(db.$client, allMembers.filter(member => activeOnDate(member.uid, holidayTargetDate(scanStartedAt) ?? today)), coverage, (options.videoCatalog ?? chzzkVideoCatalog).fetchLiveStatus, scanStartedAt);
    if ([...coverage.values()].some(status => status !== "complete")) {
      throw new Error("자동 일정 수집 조회가 실패했거나 확인 범위를 완료하지 못했습니다.");
    }
  }

  const rangeStartMs =
    Date.parse(`${startDate}T00:00:00+09:00`) - SESSION_RESUME_MARGIN_MS;
  const rangeEndMs = Date.parse(`${today}T23:59:59.999+09:00`);
  const observationRangeCondition = and(
    gte(scheduleBroadcastObservations.ended_at, rangeStartMs),
    lte(scheduleBroadcastObservations.started_at, rangeEndMs),
  );
  const persistedRows = options.originalInput?.observations??await db
    .select()
    .from(scheduleBroadcastObservations)
    .where(
      options.matchTarget
        ? and(
            observationRangeCondition,
            eq(
              scheduleBroadcastObservations.member_uid,
              options.matchTarget.memberUid,
            ),
          )
        : observationRangeCondition,
    );
  if (options.skipScan) {
    checkedObservationCount = options.matchTarget
      ? persistedRows.filter(
          (row) =>
            getKSTDateString(new Date(row.started_at)) ===
              options.matchTarget?.date,
        ).length
      : persistedRows.length;
  }
  const memberNameMap = new Map(
    allMembers.map((member) => [member.uid, member.name]),
  );
  const activeMemberUids = new Set(memberNameMap.keys());
  const observations: BroadcastObservation[] = persistedRows
    .filter((row) => activeMemberUids.has(row.member_uid))
    .map((row) => ({
      vodId: row.vod_id,
      memberUid: row.member_uid,
      memberName: memberNameMap.get(row.member_uid)!,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds,
      thumbnailUrl: row.thumbnail_url,
    }));
  const sessionsInRange = buildBroadcastSessions(observations).filter(
    (session) =>
      activeOnDate(session.memberUid, session.date) &&
      session.date >= startDate &&
      session.date <= today &&
      (!options.matchTarget ||
        (session.memberUid === options.matchTarget.memberUid &&
          session.date === options.matchTarget.date)),
  );
  const matcherSchedules: AutoUpdateSchedule[] = existingSchedules.map(
    (schedule) => ({
      id: schedule.id,
      memberUid: schedule.member_uid,
      date: schedule.date,
      startTime: schedule.start_time,
      title: schedule.title,
      status: schedule.status,
    }),
  );
  const scheduleById = new Map(
    matcherSchedules.map((schedule) => [schedule.id, schedule]),
  );
  const decisions = matchBroadcastSessions(sessionsInRange, matcherSchedules);

  // 4. 기존 거부와 pending을 세션 대표 ID 및 모든 조각 ID로 비교한다.
  const candidateDecisions = decisions.filter((decision):decision is Extract<AutoUpdateSessionDecision,{kind:"candidate"}>=>decision.kind==='candidate');
  const rejectedRows = options.originalInput?.rejections??await readRejectedCandidates(db,[...new Set(candidateDecisions.flatMap(decision=>decision.session.sourceVodIds))]);
  const rejectedVodIds = new Set(
    rejectedRows.flatMap((row) => [
      row.vod_id,
      ...parseJsonArray("source_vod_ids" in row?row.source_vod_ids as string|null:null),
    ]),
  );
  const pendingQuery = db
    .select({
      id: pendingSchedules.id,
      member_uid: pendingSchedules.member_uid,
      date: pendingSchedules.date,
      start_time: pendingSchedules.start_time,
      action_type: pendingSchedules.action_type,
      existing_schedule_id: pendingSchedules.existing_schedule_id,
      candidate_kind: pendingSchedules.candidate_kind,
      vod_id: pendingSchedules.vod_id,
    })
    .from(pendingSchedules);
  const pendingRows = options.originalInput?.pending??(options.matchTarget
    ? await pendingQuery.where(
        and(
          eq(pendingSchedules.member_uid, options.matchTarget.memberUid),
          eq(pendingSchedules.date, options.matchTarget.date),
        ),
      )
    : await pendingQuery);
  const candidateByVodId = new Map(
    candidateDecisions.map((decision) => [decision.session.vodId, decision]),
  );
  const sessionSourceVodIds = new Set(
    sessionsInRange.flatMap((session) => session.sourceVodIds),
  );
  let obsoletePendingCount = 0;
  const activePendingRows: typeof pendingRows = [];
  for (const pending of pendingRows) {
    if (!activeOnDate(pending.member_uid, pending.date)) {
      activePendingRows.push(pending);
      continue;
    }
    const currentDecision = pending.vod_id
      ? candidateByVodId.get(pending.vod_id)
      : null;
    const expectedAction = currentDecision?.candidateKind === "missing_schedule"
      ? "create"
      : "update";
    const isV2Candidate = pending.candidate_kind !== null;
    const isObserved = Boolean(
      pending.vod_id && sessionSourceVodIds.has(pending.vod_id),
    );
    const isObsolete =
      isV2Candidate &&
      isObserved &&
      (!currentDecision ||
        pending.action_type !== expectedAction ||
        pending.existing_schedule_id !== currentDecision.scheduleId ||
        pending.candidate_kind !== currentDecision.candidateKind);
    if (!isObsolete) {
      activePendingRows.push(pending);
      continue;
    }
    const deleted = await deleteObsoletePending(
      db,
      pending,
      memberNameMap.get(pending.member_uid) ?? null,
      options.collectorWriter,
    );
    if (deleted) obsoletePendingCount += 1;
  }
  const pendingVodIds = new Set(
    activePendingRows.filter((item) => item.vod_id).map((item) => item.vod_id!),
  );
  const pendingKeys = new Set(
    activePendingRows.map(
      (item) =>
        `${item.member_uid}:${item.date}:${item.start_time ?? ""}`,
    ),
  );

  const allDetails: AutoUpdateDetail[] = [];
  let insertedPendingCount = 0;
  let rejectedSuppressedCount = 0;
  let duplicatePendingCount = 0;
  const newVodIds = new Set<string>();
  const newPendingKeys = new Set<string>();
  for (const decision of decisions) {
    const session = decision.session;
    if (decision.kind === "existing") {
      const existing = scheduleById.get(decision.scheduleId);
      allDetails.push({
        memberUid: session.memberUid,
        memberName: session.memberName,
        scheduleId: decision.scheduleId,
        scheduleDate: session.date,
        action: "existing",
        title: existing?.title ?? session.title,
        previousStatus: existing?.status ?? null,
        vodId: session.vodId,
        matchReason: decision.reason,
        matchConfidence: decision.confidence,
        sessionStartedAt: new Date(session.startedAt).toISOString(),
        sessionEndedAt: new Date(session.endedAt).toISOString(),
        segmentCount: session.segmentCount,
      });
      continue;
    }
    if (decision.kind === "suppressed") {
      allDetails.push({
        memberUid: session.memberUid,
        memberName: session.memberName,
        scheduleId: null,
        scheduleDate: session.date,
        action: decision.reason,
        title: session.title,
        previousStatus: null,
        vodId: session.vodId,
        matchReason: decision.reason,
        sessionStartedAt: new Date(session.startedAt).toISOString(),
        sessionEndedAt: new Date(session.endedAt).toISOString(),
        segmentCount: session.segmentCount,
      });
      continue;
    }

    const candidate = toCandidate(decision, scheduleById);
    if (
      candidate.sourceVodIds.some((vodId) => rejectedVodIds.has(vodId))
    ) {
      rejectedSuppressedCount += 1;
      continue;
    }
    if (
      pendingVodIds.has(candidate.vodId) ||
      newVodIds.has(candidate.vodId) ||
      pendingKeys.has(candidate.pendingKey) ||
      newPendingKeys.has(candidate.pendingKey)
    ) {
      duplicatePendingCount += 1;
      continue;
    }

    const insertResult = await insertPendingSchedule(
      db,
      candidate.pendingItem,
      candidate.logItem,
      options.collectorWriter,
      existingSchedules.filter(row=>row.member_uid===candidate.pendingItem.member_uid && row.date===candidate.pendingItem.date).map(row=>({id:row.id,member_uid:row.member_uid,date:row.date,start_time:row.start_time,title:row.title,status:row.status})),
    );
    newVodIds.add(candidate.vodId);
    newPendingKeys.add(candidate.pendingKey);
    if("conflicted" in insertResult && insertResult.conflicted) continue;
    if (insertResult.results.length !== 1) {
      const currentRejections = await readRejectedCandidates(db,candidate.sourceVodIds);
      const currentRejectedVodIds = new Set(
        currentRejections.flatMap((row) => [
          row.vod_id,
          ...parseJsonArray("source_vod_ids" in row?row.source_vod_ids as string|null:null),
        ]),
      );
      if (
        candidate.sourceVodIds.some((vodId) =>
          currentRejectedVodIds.has(vodId),
        )
      ) {
        rejectedSuppressedCount += 1;
      } else {
        duplicatePendingCount += 1;
      }
      continue;
    }
    insertedPendingCount += 1;
    allDetails.push(candidate.detail);
  }

  const holidays = await reconcileHolidaySuggestions(db.$client, options.matchTarget,options.originalInput?.startedAt??Date.now(),options.collectorWriter);
  allDetails.push(...holidays.createdItems.map(item => ({
    memberUid: item.member_uid, memberName: item.member_name, scheduleDate: item.date,
    scheduleId: null, action: "auto_collected", title: "휴방 추정", previousStatus: null,
    candidateKind: "holiday_suggestion" as const, matchReason: "no_broadcast_observed",
  })));
  return {
    updated: insertedPendingCount + holidays.created,
    checked: checkedObservationCount,
    segmentCount: sessionsInRange.reduce(
      (total, session) => total + session.segmentCount,
      0,
    ),
    sessionCount: sessionsInRange.length,
    resumeMergedCount: sessionsInRange.reduce(
      (total, session) => total + Math.max(0, session.segmentCount - 1),
      0,
    ),
    rejectedSuppressed: rejectedSuppressedCount,
    duplicatePending: duplicatePendingCount,
    shortSuppressed: decisions.filter(
      (decision) =>
        decision.kind === "suppressed" &&
        decision.reason === "short_suppressed",
    ).length,
    holidaySuppressed: decisions.filter(
      (decision) =>
        decision.kind === "suppressed" &&
        decision.reason === "holiday_suppressed",
    ).length,
    ambiguous: candidateDecisions.filter(
      (decision) => decision.candidateKind === "ambiguous",
    ).length,
    obsoletePending: obsoletePendingCount + holidays.withdrawn,
    details: allDetails,
  };
};
