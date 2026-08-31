import { and, eq, gte, lte, sql } from "drizzle-orm";
import { type DbInstance } from "../../../platform/db";
import {
  members,
  pendingSchedules,
  scheduleBroadcastObservations,
  scheduleCandidateRejections,
  schedules,
} from "@db/schema";
import type {
  AutoUpdateDetail,
  CachedChzzkVideos,
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

const CHZZK_SCAN_PAGE_SIZE = 5;
const CHZZK_SCAN_MAX_PAGES = 3;

type ChzzkVideo = NonNullable<NonNullable<CachedChzzkVideos["content"]>["data"]>[number];

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

const insertPendingSchedule = async (
  db: DbInstance,
  item: NewPendingSchedule,
  logItem: NewUpdateLog,
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
         SELECT 1
         FROM schedule_candidate_rejections AS rejection
         WHERE rejection.vod_id = ?
            OR EXISTS (
              SELECT 1
              FROM json_each(?) AS source
              WHERE source.value = rejection.vod_id
            )
       )
    ON CONFLICT DO NOTHING`,
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
      item.vod_id ?? null,
      item.source_vod_ids ?? "[]",
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
  const [insertResult] = await db.$client.batch([
    insertStatement,
    logStatement,
  ]);
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
  },
  memberName: string | null,
) => {
  const deleteStatement = db.$client
    .prepare("DELETE FROM pending_schedules WHERE id = ?")
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
  const [deleteResult] = await db.$client.batch([
    deleteStatement,
    logStatement,
  ]);
  return deleteResult.meta.changes === 1;
};

const D1_MAX_BOUND_PARAMETERS = 100;
const OBSERVATION_BOUND_PARAMETERS_PER_ROW = 10;
const OBSERVATION_UPSERT_BOUND_PARAMETERS = 1;

// D1은 쿼리당 bind parameter를 최대 100개만 허용한다. 관측 1건은
// INSERT 값 10개를 사용하고 upsert의 last_seen_at 갱신값 1개가 추가된다.
export const OBSERVATION_CHUNK_SIZE = Math.floor(
  (D1_MAX_BOUND_PARAMETERS - OBSERVATION_UPSERT_BOUND_PARAMETERS) /
    OBSERVATION_BOUND_PARAMETERS_PER_ROW,
);
const SESSION_RESUME_MARGIN_MS = 60 * 60 * 1000;

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
) => {
  const observedAt = Date.now();
  for (
    let index = 0;
    index < observations.length;
    index += OBSERVATION_CHUNK_SIZE
  ) {
    const chunk = observations.slice(index, index + OBSERVATION_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await db
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
  fetchVideosBatch: ChzzkVideoCatalog["fetchVideosBatch"] =
    chzzkVideoCatalog.fetchVideosBatch,
) => {
  const collectedByChannel = new Map<string, ChzzkVideo[]>();
  let activeChannelIds = Array.from(new Set(channelIds));
  for (const channelId of activeChannelIds) {
    collectedByChannel.set(channelId, []);
  }

  for (
    let page = 0;
    page < CHZZK_SCAN_MAX_PAGES && activeChannelIds.length > 0;
    page += 1
  ) {
    const items = await fetchVideosBatch(
      activeChannelIds.map((channelId) => ({
        channelId,
        page,
        size: CHZZK_SCAN_PAGE_SIZE,
        cacheable: true,
      })),
      cacheDb,
      { forceRefresh: true },
    );
    const nextChannelIds: string[] = [];

    for (const item of items) {
      const pageItems = item.content?.data ?? [];
      if (pageItems.length === 0) continue;

      const collected = collectedByChannel.get(item.channelId) ?? [];
      let reachedOutOfRange = false;
      for (const video of pageItems) {
        const { videoDate } = resolveVideoTiming(video);
        if (videoDate < startDate) {
          reachedOutOfRange = true;
          break;
        }
        if (videoDate <= today) {
          collected.push(video);
        }
      }
      collectedByChannel.set(item.channelId, collected);

      if (!reachedOutOfRange && pageItems.length === CHZZK_SCAN_PAGE_SIZE) {
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
) => {
  const today = getKSTDateString();
  const daysBack = Math.max(0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
  );
  const requested = new Set(requestedChannelIds.map((id) => id.toLowerCase()));
  const activeMembers = await db
    .select({
      uid: members.uid,
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
  if (channelIds.length === 0) return { channels: 0, observations: 0 };
  const videosByChannel = await scanRecentChzzkVideosForChannels(
    channelIds,
    startDate,
    today,
    cacheDb,
    videoCatalog.fetchVideosBatch,
  );
  const observations = targets.flatMap(({ member, channelId }) =>
    (videosByChannel.get(channelId) ?? []).map((video) =>
      toObservation(member, channelId, video)
    )
  );
  await persistObservations(db, observations);
  return { channels: channelIds.length, observations: observations.length };
};

export const readAutoUpdateMatchTargets = async (
  db: DbInstance,
  rangeDays: number,
): Promise<AutoUpdateMatchTarget[]> => {
  const today = getKSTDateString();
  const daysBack = Math.max(0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
  );
  const rangeStartMs =
    Date.parse(`${startDate}T00:00:00+09:00`) - SESSION_RESUME_MARGIN_MS;
  const rangeEndMs = Date.parse(`${today}T23:59:59.999+09:00`);
  const [activeMembers, rows] = await Promise.all([
    db
      .select({ uid: members.uid })
      .from(members)
      .where(
        sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1`,
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
  const activeMemberUids = new Set(activeMembers.map((member) => member.uid));
  const targets = new Map<string, AutoUpdateMatchTarget>();
  for (const row of rows) {
    if (!activeMemberUids.has(row.memberUid)) continue;
    const date = getKSTDateString(new Date(row.startedAt));
    if (date < startDate || date > today) continue;
    const target = { memberUid: row.memberUid, date };
    targets.set(`${target.memberUid}:${target.date}`, target);
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
  const today = getKSTDateString();
  const daysBack = Math.max(0, Math.floor(rangeDays) - 1);
  const startDate = getKSTDateString(
    new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
  );

  // 1. 모든 활성 멤버 조회 (is_deprecated가 아닌 것)
  const activeMemberCondition =
    sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1`;
  const allMembers = await db
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
  const existingSchedules = await db
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
    const videosByChannel = await scanRecentChzzkVideosForChannels(
      channelIds,
      startDate,
      today,
      options.cacheDb,
      options.videoCatalog?.fetchVideosBatch,
    );
    const fetchedObservations = allMembers.flatMap((member) => {
      const channelId = extractChzzkChannelId(member.url_chzzk)?.toLowerCase();
      if (!channelId) return [];
      return (videosByChannel.get(channelId) ?? []).map((video) =>
        toObservation(member, channelId, video),
      );
    });
    checkedObservationCount = fetchedObservations.length;
    await persistObservations(db, fetchedObservations);
  }

  const rangeStartMs =
    Date.parse(`${startDate}T00:00:00+09:00`) - SESSION_RESUME_MARGIN_MS;
  const rangeEndMs = Date.parse(`${today}T23:59:59.999+09:00`);
  const observationRangeCondition = and(
    gte(scheduleBroadcastObservations.ended_at, rangeStartMs),
    lte(scheduleBroadcastObservations.started_at, rangeEndMs),
  );
  const persistedRows = await db
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
  const rejectedRows = await db
    .select({
      vod_id: scheduleCandidateRejections.vod_id,
      source_vod_ids: scheduleCandidateRejections.source_vod_ids,
    })
    .from(scheduleCandidateRejections);
  const rejectedVodIds = new Set(
    rejectedRows.flatMap((row) => [
      row.vod_id,
      ...parseJsonArray(row.source_vod_ids),
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
  const pendingRows = options.matchTarget
    ? await pendingQuery.where(
        and(
          eq(pendingSchedules.member_uid, options.matchTarget.memberUid),
          eq(pendingSchedules.date, options.matchTarget.date),
        ),
      )
    : await pendingQuery;
  const candidateDecisions = decisions.filter(
    (
      decision,
    ): decision is Extract<AutoUpdateSessionDecision, { kind: "candidate" }> =>
      decision.kind === "candidate",
  );
  const candidateByVodId = new Map(
    candidateDecisions.map((decision) => [decision.session.vodId, decision]),
  );
  const sessionSourceVodIds = new Set(
    sessionsInRange.flatMap((session) => session.sourceVodIds),
  );
  let obsoletePendingCount = 0;
  const activePendingRows: typeof pendingRows = [];
  for (const pending of pendingRows) {
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
    );
    newVodIds.add(candidate.vodId);
    newPendingKeys.add(candidate.pendingKey);
    if (insertResult.meta.changes !== 1) {
      const currentRejections = await db
        .select({
          vod_id: scheduleCandidateRejections.vod_id,
          source_vod_ids: scheduleCandidateRejections.source_vod_ids,
        })
        .from(scheduleCandidateRejections);
      const currentRejectedVodIds = new Set(
        currentRejections.flatMap((row) => [
          row.vod_id,
          ...parseJsonArray(row.source_vod_ids),
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

  return {
    updated: insertedPendingCount,
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
    obsoletePending: obsoletePendingCount,
    details: allDetails,
  };
};
