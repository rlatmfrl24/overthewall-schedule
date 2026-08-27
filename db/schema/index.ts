import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  sqliteTable,
  text,
  index,
  check,
  foreignKey,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type {
  OtwPlayCatalogEventActorKind,
  OtwPlayChannelRole,
  OtwPlayChannelVerificationStatus,
  OtwPlayDatePrecision,
  OtwPlayEntityKind,
  OtwPlayIngestionCandidateStatus,
  OtwPlayIngestionClassification,
  OtwPlayIngestionConversionOutcome,
  OtwPlayIngestionJobStatus,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayProvider,
  OtwPlayProposalStatus,
  OtwPlayPublicationStatus,
  OtwPlayQualityStatus,
  OtwPlayRelationType,
  OtwPlayReleaseType,
  OtwPlaySearchTermKind,
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceRelationType,
  OtwPlaySourceRole,
} from "../../contracts/otw-play";

export const members = sqliteTable(
  "members",
  {
    uid: integer().primaryKey({ autoIncrement: true }),
    code: text().notNull(),
    name: text().notNull(),
    main_color: text("main_color"),
    sub_color: text("sub_color"),
    oshi_mark: text("oshi_mark"),
    url_twitter: text("url_twitter"),
    url_youtube: text("url_youtube"),
    url_chzzk: text("url_chzzk"),
    youtube_channel_id: text("youtube_channel_id"), // UCxxxxxxxx 형태의 YouTube 채널 ID
    birth_date: text("birth_date"),
    debut_date: text("debut_date"),
    unit_name: text("unit_name"),
    fan_name: text("fan_name"),
    introduction: text("introduction"),
    is_deprecated: integer("is_deprecated", { mode: "boolean" }),
  },
  (table) => [index("idx_members_code").on(table.code)],
);

export const memberProfileImages = sqliteTable(
  "member_profile_images",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    image_url: text("image_url").notNull(),
    alt: text(),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_member_profile_images_member_uid").on(table.member_uid),
    index("idx_member_profile_images_member_sort").on(
      table.member_uid,
      table.sort_order,
    ),
  ],
);

export const memberLinks = sqliteTable(
  "member_links",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    type: text("type").notNull(),
    label: text().notNull(),
    url: text().notNull(),
    youtube_channel_id: text("youtube_channel_id"),
    sort_order: integer("sort_order").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_member_links_member_uid").on(table.member_uid),
    index("idx_member_links_member_sort").on(table.member_uid, table.sort_order),
    check(
      "member_links_type_check",
      sql`type IN ('youtube_vod', 'youtube_sub', 'twitcasting')`,
    ),
  ],
);

export const schedules = sqliteTable(
  "schedules",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull(),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_schedules_date").on(table.date),
    index("idx_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
    index("idx_schedules_date_member_time").on(
      table.date,
      table.member_uid,
      table.start_time,
    ),
    check(
      "schedules_status_check",
      sql`status IN ('방송', '휴방', '게릴라', '미정')`,
    ),
  ],
);

export const notices = sqliteTable(
  "notices",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    content: text().notNull(),
    links: text("links", { mode: "json" })
      .$type<Array<{ label: string; url: string }>>()
      .notNull()
      .default(sql`'[]'`),
    image_urls: text("image_urls", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    related_member_uids: text("related_member_uids", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    url: text(),
    thumbnail_url: text("thumbnail_url"),
    type: text("type").notNull().default("notice"),
    publisher_type: text("publisher_type").notNull().default("otw"),
    publisher_member_uid: integer("publisher_member_uid"),
    is_active: integer("is_active", { mode: "boolean" }).default(true),
    is_featured: integer("is_home_visible", { mode: "boolean" }).default(
      true,
    ),
    started_at: text("started_at"),
    ended_at: text("ended_at"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  () => [
    check("notices_type_check", sql`type IN ('notice', 'event')`),
  ],
);

export const ddays = sqliteTable(
  "ddays",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    date: text().notNull(),
    description: text(),
    color: text(),
    type: text("type").notNull().default("event"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_ddays_date").on(table.date),
    check("ddays_type_check", sql`type IN ('debut', 'birthday', 'event')`),
  ],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type MemberProfileImage = typeof memberProfileImages.$inferSelect;
export type NewMemberProfileImage = typeof memberProfileImages.$inferInsert;
export type MemberLink = typeof memberLinks.$inferSelect;
export type NewMemberLink = typeof memberLinks.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;
export type DDay = typeof ddays.$inferSelect;
export type NewDDay = typeof ddays.$inferInsert;

// 자동 업데이트 설정 테이블
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text(),
  updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// X API 응답 캐시 테이블
export const xApiCache = sqliteTable(
  "x_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
  },
  (table) => [
    index("idx_x_api_cache_type").on(table.type),
    index("idx_x_api_cache_expires_at").on(table.expires_at),
  ],
);

export type XApiCache = typeof xApiCache.$inferSelect;
export type NewXApiCache = typeof xApiCache.$inferInsert;

// X 게시글 영구 저장 테이블
export const xPosts = sqliteTable(
  "x_posts",
  {
    id: text().primaryKey(),
    handle: text().notNull(),
    user_id: text("user_id"),
    username: text().notNull(),
    value: text().notNull(),
    created_at: text("created_at").notNull(),
    fetched_at: integer("fetched_at").notNull(),
    hidden_at: integer("hidden_at"),
  },
  (table) => [
    index("idx_x_posts_handle_created_at").on(table.handle, table.created_at),
    index("idx_x_posts_handle_hidden_created").on(
      table.handle,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_x_posts_user_id").on(table.user_id),
    index("idx_x_posts_hidden_at").on(table.hidden_at),
  ],
);

export type XStoredPost = typeof xPosts.$inferSelect;
export type NewXStoredPost = typeof xPosts.$inferInsert;

// X 게시글 소스별 증분 수집 상태
export const xPostSources = sqliteTable("x_post_sources", {
  handle: text().primaryKey(),
  user_id: text("user_id"),
  username: text(),
  last_seen_post_id: text("last_seen_post_id"),
  last_checked_at: integer("last_checked_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  last_error: text("last_error"),
});

export type XPostSource = typeof xPostSources.$inferSelect;
export type NewXPostSource = typeof xPostSources.$inferInsert;

// X API 과금 추정 이벤트 로그
export const xApiUsageEvents = sqliteTable(
  "x_api_usage_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    operation: text().notNull(),
    endpoint: text().notNull(),
    resource_type: text("resource_type").notNull(),
    resource_count: integer("resource_count").notNull(),
    estimated_cost_micros: integer("estimated_cost_micros").notNull(),
    status: integer().notNull(),
    created_at: integer("created_at").notNull(),
    detail: text(),
  },
  (table) => [
    index("idx_x_api_usage_events_created_at").on(table.created_at),
    index("idx_x_api_usage_events_operation").on(table.operation),
  ],
);

export type XApiUsageEvent = typeof xApiUsageEvents.$inferSelect;
export type NewXApiUsageEvent = typeof xApiUsageEvents.$inferInsert;

// X 백그라운드 수집 실행 로그
export const xCollectionRuns = sqliteTable(
  "x_collection_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at"),
    checked_handles: integer("checked_handles").notNull().default(0),
    refreshed_handles: integer("refreshed_handles").notNull().default(0),
    posts_returned: integer("posts_returned").notNull().default(0),
    posts_stored: integer("posts_stored").notNull().default(0),
    api_calls: integer("api_calls").notNull().default(0),
    estimated_cost_micros: integer("estimated_cost_micros")
      .notNull()
      .default(0),
    status: text().notNull(),
    error: text(),
  },
  (table) => [
    index("idx_x_collection_runs_started_at").on(table.started_at),
    index("idx_x_collection_runs_status").on(table.status),
  ],
);

export type XCollectionRun = typeof xCollectionRuns.$inferSelect;
export type NewXCollectionRun = typeof xCollectionRuns.$inferInsert;

// YouTube API 응답 캐시 테이블
export const youtubeApiCache = sqliteTable(
  "youtube_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
    stale_until: integer("stale_until").notNull(),
    last_status: integer("last_status"),
    last_error: text("last_error"),
  },
  (table) => [
    index("idx_youtube_api_cache_type").on(table.type),
    index("idx_youtube_api_cache_expires_at").on(table.expires_at),
    index("idx_youtube_api_cache_stale_until").on(table.stale_until),
    check(
      "youtube_api_cache_type_check",
      sql`type IN ('uploads_playlist', 'channel_videos')`,
    ),
  ],
);

export type YouTubeApiCache = typeof youtubeApiCache.$inferSelect;
export type NewYouTubeApiCache = typeof youtubeApiCache.$inferInsert;

// CHZZK VOD/클립 API 응답 캐시 테이블
export const chzzkApiCache = sqliteTable(
  "chzzk_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
    stale_until: integer("stale_until").notNull(),
    last_status: integer("last_status"),
    last_error: text("last_error"),
  },
  () => [
    check(
      "chzzk_api_cache_type_check",
      sql`type IN ('vods', 'clips')`,
    ),
  ],
);

export type ChzzkApiCache = typeof chzzkApiCache.$inferSelect;
export type NewChzzkApiCache = typeof chzzkApiCache.$inferInsert;

// 자동 일정 보완에 사용하는 CHZZK VOD 영구 관측 기록
export const scheduleBroadcastObservations = sqliteTable(
  "schedule_broadcast_observations",
  {
    vod_id: text("vod_id").primaryKey(),
    member_uid: integer("member_uid").notNull(),
    channel_id: text("channel_id").notNull(),
    title: text().notNull(),
    started_at: integer("started_at").notNull(),
    ended_at: integer("ended_at").notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    thumbnail_url: text("thumbnail_url"),
    first_seen_at: integer("first_seen_at").notNull(),
    last_seen_at: integer("last_seen_at").notNull(),
  },
  (table) => [
    index("idx_schedule_broadcast_observations_member_started").on(
      table.member_uid,
      table.started_at,
    ),
    index("idx_schedule_broadcast_observations_last_seen").on(
      table.last_seen_at,
    ),
    check(
      "schedule_broadcast_observations_timing_check",
      sql`${table.ended_at} >= ${table.started_at}`,
    ),
    check(
      "schedule_broadcast_observations_duration_check",
      sql`${table.duration_seconds} >= 0`,
    ),
  ],
);

export type ScheduleBroadcastObservation =
  typeof scheduleBroadcastObservations.$inferSelect;
export type NewScheduleBroadcastObservation =
  typeof scheduleBroadcastObservations.$inferInsert;

// YouTube API 호출 사용량 이벤트 로그
export const youtubeApiUsageEvents = sqliteTable(
  "youtube_api_usage_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    operation: text().notNull(),
    channel_id: text("channel_id"),
    cache_key: text("cache_key"),
    quota_units: integer("quota_units").notNull(),
    status: integer().notNull(),
    duration_ms: integer("duration_ms").notNull(),
    created_at: integer("created_at").notNull(),
    error: text(),
  },
  (table) => [
    index("idx_youtube_api_usage_events_created_at").on(table.created_at),
    index("idx_youtube_api_usage_events_operation").on(table.operation),
    index("idx_youtube_api_usage_events_status").on(table.status),
    index("idx_youtube_api_usage_events_cache_key").on(table.cache_key),
    check(
      "youtube_api_usage_events_operation_check",
      sql`operation IN ('channels.list', 'playlistItems.list', 'videos.list')`,
    ),
  ],
);

export type YouTubeApiUsageEvent = typeof youtubeApiUsageEvents.$inferSelect;
export type NewYouTubeApiUsageEvent =
  typeof youtubeApiUsageEvents.$inferInsert;

// YouTube 캐시 백그라운드 예열 실행 이력
export const youtubeWarmupRuns = sqliteTable(
  "youtube_warmup_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    status: text().notNull(),
    target_count: integer("target_count").notNull(),
    skipped_fresh_count: integer("skipped_fresh_count").notNull(),
    refreshed_count: integer("refreshed_count").notNull(),
    failed_count: integer("failed_count").notNull(),
    stale_fallback_count: integer("stale_fallback_count").notNull(),
    api_calls: integer("api_calls").notNull(),
    quota_units: integer("quota_units").notNull(),
    duration_ms: integer("duration_ms").notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at").notNull(),
    error: text(),
  },
  (table) => [
    index("idx_youtube_warmup_runs_started_at").on(table.started_at),
    index("idx_youtube_warmup_runs_status").on(table.status),
    index("idx_youtube_warmup_runs_source").on(table.source),
    check(
      "youtube_warmup_runs_source_check",
      sql`source IN ('scheduled', 'manual')`,
    ),
    check(
      "youtube_warmup_runs_status_check",
      sql`status IN ('success', 'skipped', 'partial', 'failed')`,
    ),
  ],
);

export type YouTubeWarmupRun = typeof youtubeWarmupRuns.$inferSelect;
export type NewYouTubeWarmupRun = typeof youtubeWarmupRuns.$inferInsert;

// 네이버 카페 게시판 소스 테이블
export const naverCafeSources = sqliteTable(
  "naver_cafe_sources",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    cafe_url: text("cafe_url").notNull(),
    member_uid: integer("member_uid"),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_naver_cafe_sources_enabled").on(table.enabled),
    index("idx_naver_cafe_sources_member_uid").on(table.member_uid),
    index("idx_naver_cafe_sources_sort_order").on(table.sort_order),
    uniqueIndex("uidx_naver_cafe_sources_cafe_menu").on(
      table.cafe_id,
      table.menu_id,
    ),
  ],
);

export type NaverCafeSource = typeof naverCafeSources.$inferSelect;
export type NewNaverCafeSource = typeof naverCafeSources.$inferInsert;

// 네이버 카페 소스별 상태 점검 이력
export const naverCafeSourceChecks = sqliteTable(
  "naver_cafe_source_checks",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source_id: integer("source_id").notNull(),
    source_name: text("source_name").notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    trigger: text().notNull(),
    status: text().notNull(),
    checked_at: integer("checked_at").notNull(),
    duration_ms: integer("duration_ms").notNull().default(0),
    post_count: integer("post_count").notNull().default(0),
    error: text(),
  },
  (table) => [
    index("idx_naver_cafe_source_checks_source_checked").on(
      table.source_id,
      table.checked_at,
    ),
    index("idx_naver_cafe_source_checks_checked_at").on(table.checked_at),
    index("idx_naver_cafe_source_checks_status").on(table.status),
    check(
      "naver_cafe_source_checks_trigger_check",
      sql`${table.trigger} IN ('manual', 'scheduled')`,
    ),
    check(
      "naver_cafe_source_checks_status_check",
      sql`${table.status} IN ('ok', 'stale', 'error', 'private', 'invalid_response', 'disabled')`,
    ),
  ],
);

export type NaverCafeSourceCheck =
  typeof naverCafeSourceChecks.$inferSelect;
export type NewNaverCafeSourceCheck =
  typeof naverCafeSourceChecks.$inferInsert;

// 네이버 카페 게시글 저장 테이블
export const naverCafePosts = sqliteTable(
  "naver_cafe_posts",
  {
    id: text().primaryKey(),
    article_id: integer("article_id").notNull(),
    source_id: integer("source_id").notNull(),
    source_name: text("source_name").notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    member_uid: integer("member_uid"),
    title: text().notNull(),
    summary: text().notNull(),
    created_at: text("created_at").notNull(),
    url: text().notNull(),
    thumbnail_url: text("thumbnail_url"),
    comment_count: integer("comment_count").notNull().default(0),
    read_count: integer("read_count").notNull().default(0),
    like_count: integer("like_count").notNull().default(0),
    is_new: integer("is_new", { mode: "boolean" }).notNull().default(false),
    fetched_at: integer("fetched_at").notNull(),
    hidden_at: integer("hidden_at"),
  },
  (table) => [
    index("idx_naver_cafe_posts_source_hidden_created").on(
      table.source_id,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_naver_cafe_posts_member_hidden_created").on(
      table.member_uid,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_naver_cafe_posts_hidden_created").on(
      table.hidden_at,
      table.created_at,
    ),
  ],
);

export type NaverCafePost = typeof naverCafePosts.$inferSelect;
export type NewNaverCafePost = typeof naverCafePosts.$inferInsert;

// 스케쥴 통합 업데이트 로그 테이블
export const updateLogs = sqliteTable(
  "update_logs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    schedule_id: integer("schedule_id"),
    member_uid: integer("member_uid"),
    member_name: text("member_name"),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    schedule_date: text("schedule_date").notNull(),
    action: text().notNull(),
    title: text(),
    previous_status: text("previous_status"),
    vod_id: text("vod_id"),
    reason_code: text("reason_code"),
    reason_note: text("reason_note"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_update_logs_created_at").on(table.created_at),
    index("idx_update_logs_action_created_at").on(
      table.action,
      table.created_at,
    ),
    index("idx_update_logs_schedule_date_created_at").on(
      table.schedule_date,
      table.created_at,
    ),
    index("idx_update_logs_member_created_at").on(
      table.member_uid,
      table.created_at,
    ),
  ],
);

export type UpdateLog = typeof updateLogs.$inferSelect;
export type NewUpdateLog = typeof updateLogs.$inferInsert;

// 관리자 감사 로그 테이블
export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    event_type: text("event_type").notNull(),
    resource_type: text("resource_type").notNull(),
    resource_id: text("resource_id"),
    action: text().notNull(),
    status: text().notNull(),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    target_count: integer("target_count"),
    success_count: integer("success_count"),
    failure_count: integer("failure_count"),
    detail: text(),
    error: text(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_admin_audit_logs_created_at").on(table.created_at),
    index("idx_admin_audit_logs_event_created_at").on(
      table.event_type,
      table.created_at,
    ),
    index("idx_admin_audit_logs_actor_created_at").on(
      table.actor_id,
      table.created_at,
    ),
    index("idx_admin_audit_logs_resource_created_at").on(
      table.resource_type,
      table.created_at,
    ),
    index("idx_admin_audit_logs_status_created_at").on(
      table.status,
      table.created_at,
    ),
    check(
      "admin_audit_logs_status_check",
      sql`${table.status} IN ('success', 'partial', 'failed', 'skipped')`,
    ),
  ],
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;

// 자동 업데이트 실행 단위 이력
export const autoUpdateRuns = sqliteTable(
  "auto_update_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    status: text().notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at").notNull(),
    range_days: integer("range_days").notNull(),
    checked_count: integer("checked_count").notNull().default(0),
    segment_count: integer("segment_count").notNull().default(0),
    session_count: integer("session_count").notNull().default(0),
    resume_merged_count: integer("resume_merged_count").notNull().default(0),
    updated_count: integer("updated_count").notNull().default(0),
    created_count: integer("created_count").notNull().default(0),
    existing_count: integer("existing_count").notNull().default(0),
    pending_created_count: integer("pending_created_count").notNull().default(0),
    rejected_suppressed_count: integer("rejected_suppressed_count")
      .notNull()
      .default(0),
    duplicate_pending_count: integer("duplicate_pending_count")
      .notNull()
      .default(0),
    short_suppressed_count: integer("short_suppressed_count")
      .notNull()
      .default(0),
    holiday_suppressed_count: integer("holiday_suppressed_count")
      .notNull()
      .default(0),
    ambiguous_count: integer("ambiguous_count").notNull().default(0),
    obsolete_pending_count: integer("obsolete_pending_count")
      .notNull()
      .default(0),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    error: text(),
    detail: text(),
  },
  (table) => [
    index("idx_auto_update_runs_started_at").on(table.started_at),
    index("idx_auto_update_runs_status").on(table.status),
    index("idx_auto_update_runs_source_started").on(
      table.source,
      table.started_at,
    ),
    check(
      "auto_update_runs_source_check",
      sql`${table.source} IN ('scheduled', 'manual')`,
    ),
    check(
      "auto_update_runs_status_check",
      sql`${table.status} IN ('success', 'failed')`,
    ),
  ],
);

export type AutoUpdateRun = typeof autoUpdateRuns.$inferSelect;
export type NewAutoUpdateRun = typeof autoUpdateRuns.$inferInsert;

// 승인 대기 스케줄 테이블
export const pendingSchedules = sqliteTable(
  "pending_schedules",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    member_name: text("member_name").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull().default("방송"),
    action_type: text("action_type").notNull(), // "create" | "update"
    existing_schedule_id: integer("existing_schedule_id"), // 수정 대상 스케줄 ID
    previous_status: text("previous_status"), // 수정 전 상태
    previous_start_time: text("previous_start_time"), // 수정 전 시작 시각
    previous_title: text("previous_title"), // 수정 전 제목
    candidate_kind: text("candidate_kind"),
    match_reason: text("match_reason"),
    match_confidence: text("match_confidence"),
    ranked_schedule_ids: text("ranked_schedule_ids"),
    source_vod_ids: text("source_vod_ids"),
    session_started_at: text("session_started_at"),
    session_ended_at: text("session_ended_at"),
    vod_segment_count: integer("vod_segment_count").notNull().default(1),
    vod_id: text("vod_id"), // 중복 방지용 VOD 식별자
    vod_started_at: text("vod_started_at"), // VOD 기준 방송 시작 시각
    vod_duration_seconds: integer("vod_duration_seconds"), // 총 방송 길이(초)
    vod_thumbnail_url: text("vod_thumbnail_url"), // 방송 썸네일 URL
    processed_reset_at: text("processed_reset_at"), // 처리 완료 판정 리셋 시각
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_pending_schedules_vod_id").on(table.vod_id),
    index("idx_pending_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
    index("idx_pending_schedules_created_at").on(table.created_at),
    index("idx_pending_schedules_date_created_at").on(
      table.date,
      table.created_at,
    ),
    uniqueIndex("uidx_pending_schedules_vod_id")
      .on(table.vod_id)
      .where(sql`${table.vod_id} IS NOT NULL`),
    uniqueIndex("uidx_pending_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
  ],
);

export type PendingSchedule = typeof pendingSchedules.$inferSelect;
export type NewPendingSchedule = typeof pendingSchedules.$inferInsert;

// 관리자가 재검토를 허용할 때까지 수집에서 제외되는 VOD 후보
export const scheduleCandidateRejections = sqliteTable(
  "schedule_candidate_rejections",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    vod_id: text("vod_id").notNull(),
    member_uid: integer("member_uid").notNull(),
    member_name: text("member_name").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull(),
    action_type: text("action_type").notNull(),
    existing_schedule_id: integer("existing_schedule_id"),
    previous_status: text("previous_status"),
    previous_start_time: text("previous_start_time"),
    previous_title: text("previous_title"),
    candidate_kind: text("candidate_kind"),
    match_reason: text("match_reason"),
    match_confidence: text("match_confidence"),
    ranked_schedule_ids: text("ranked_schedule_ids"),
    source_vod_ids: text("source_vod_ids"),
    session_started_at: text("session_started_at"),
    session_ended_at: text("session_ended_at"),
    vod_segment_count: integer("vod_segment_count").notNull().default(1),
    vod_started_at: text("vod_started_at"),
    vod_duration_seconds: integer("vod_duration_seconds"),
    vod_thumbnail_url: text("vod_thumbnail_url"),
    reason_code: text("reason_code"),
    reason_note: text("reason_note"),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    rejected_at: numeric("rejected_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uidx_schedule_candidate_rejections_vod_id").on(
      table.vod_id,
    ),
    index("idx_schedule_candidate_rejections_rejected_at").on(
      table.rejected_at,
    ),
    index("idx_schedule_candidate_rejections_member_date").on(
      table.member_uid,
      table.date,
    ),
    index("idx_schedule_candidate_rejections_reason_rejected").on(
      table.reason_code,
      table.rejected_at,
    ),
    check(
      "schedule_candidate_rejections_reason_check",
      sql`${table.reason_code} IS NULL OR ${table.reason_code} IN ('not_needed', 'already_reflected', 'wrong_match', 'duplicate', 'other')`,
    ),
  ],
);

export type ScheduleCandidateRejection =
  typeof scheduleCandidateRejections.$inferSelect;
export type NewScheduleCandidateRejection =
  typeof scheduleCandidateRejections.$inferInsert;

// 키리누키 채널 테이블 (유튜브 채널 영상 모음)
export const kirinukiChannels = sqliteTable("kirinuki_channels", {
  id: integer().primaryKey({ autoIncrement: true }),
  channel_name: text("channel_name").notNull(),
  channel_url: text("channel_url").notNull(),
  youtube_channel_id: text("youtube_channel_id").notNull(),
  created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type KirinukiChannel = typeof kirinukiChannels.$inferSelect;
export type NewKirinukiChannel = typeof kirinukiChannels.$inferInsert;

export const musicEntities = sqliteTable(
  "music_entities",
  {
    id: text().primaryKey(),
    member_uid: integer("member_uid").references(() => members.uid, {
      onDelete: "set null",
    }),
    entity_kind: text("entity_kind").$type<OtwPlayEntityKind>().notNull(),
    display_name: text("display_name").notNull(),
    normalized_name: text("normalized_name").notNull(),
    slug: text().notNull(),
    archived_at: integer("archived_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_entities_slug").on(table.slug),
    uniqueIndex("uidx_music_entities_member_uid")
      .on(table.member_uid)
      .where(sql`${table.member_uid} IS NOT NULL`),
    index("idx_music_entities_normalized_name_id").on(
      table.normalized_name,
      table.id,
    ),
    check(
      "music_entities_kind_check",
      sql`${table.entity_kind} IN ('person', 'group', 'organization')`,
    ),
    check(
      "music_entities_member_kind_check",
      sql`${table.member_uid} IS NULL OR ${table.entity_kind} = 'person'`,
    ),
    check(
      "music_entities_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.display_name})) > 0 AND length(trim(${table.normalized_name})) > 0 AND length(trim(${table.slug})) > 0`,
    ),
    check(
      "music_entities_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_entities_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.archived_at} IS NULL OR (typeof(${table.archived_at}) = 'integer' AND ${table.archived_at} >= 0))`,
    ),
  ],
);

export type MusicEntity = typeof musicEntities.$inferSelect;
export type NewMusicEntity = typeof musicEntities.$inferInsert;

export const musicEntityAliases = sqliteTable(
  "music_entity_aliases",
  {
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "cascade" }),
    alias: text().notNull(),
    normalized_alias: text("normalized_alias").notNull(),
    locale: text(),
    alias_kind: text("alias_kind"),
  },
  (table) => [
    primaryKey({
      columns: [table.entity_id, table.normalized_alias],
      name: "pk_music_entity_aliases",
    }),
    index("idx_music_entity_aliases_normalized_alias_entity").on(
      table.normalized_alias,
      table.entity_id,
    ),
    check(
      "music_entity_aliases_required_text_check",
      sql`length(trim(${table.alias})) > 0 AND length(trim(${table.normalized_alias})) > 0`,
    ),
  ],
);

export type MusicEntityAlias = typeof musicEntityAliases.$inferSelect;
export type NewMusicEntityAlias = typeof musicEntityAliases.$inferInsert;

export const musicSongs = sqliteTable(
  "music_songs",
  {
    id: text().primaryKey(),
    slug: text().notNull(),
    title: text().notNull(),
    normalized_title: text("normalized_title").notNull(),
    // Immutable canonical identity; mutable display metadata must not rewrite it.
    dedupe_key: text("dedupe_key").notNull(),
    is_otw_original: integer("is_otw_original", { mode: "boolean" })
      .notNull(),
    original_release_date: text("original_release_date"),
    original_release_precision: text("original_release_precision")
      .$type<OtwPlayDatePrecision>()
      .notNull()
      .default("unknown"),
    merged_into_song_id: text("merged_into_song_id"),
    archived_at: integer("archived_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.merged_into_song_id],
      foreignColumns: [table.id],
      name: "fk_music_songs_merged_into_song",
    }).onDelete("restrict"),
    uniqueIndex("uidx_music_songs_slug").on(table.slug),
    uniqueIndex("uidx_music_songs_dedupe_key").on(table.dedupe_key),
    index("idx_music_songs_merged_into_song_id").on(
      table.merged_into_song_id,
    ),
    index("idx_music_songs_normalized_title_id").on(
      table.normalized_title,
      table.id,
    ),
    check(
      "music_songs_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.slug})) > 0 AND length(trim(${table.title})) > 0 AND length(trim(${table.normalized_title})) > 0 AND length(trim(${table.dedupe_key})) > 0`,
    ),
    check(
      "music_songs_otw_original_check",
      sql`${table.is_otw_original} IN (0, 1)`,
    ),
    check(
      "music_songs_release_precision_check",
      sql`${table.original_release_precision} IN ('year', 'month', 'day', 'unknown')`,
    ),
    check(
      "music_songs_release_date_check",
      sql`(${table.original_release_precision} = 'unknown' AND ${table.original_release_date} IS NULL)
        OR (${table.original_release_precision} = 'year'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]')
        OR (${table.original_release_precision} = 'month'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr(${table.original_release_date}, 6, 2) BETWEEN '01' AND '12')
        OR (${table.original_release_precision} = 'day'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date(${table.original_release_date}, '+0 days') IS NOT NULL
          AND date(${table.original_release_date}, '+0 days') = ${table.original_release_date})`,
    ),
    check(
      "music_songs_merge_target_check",
      sql`${table.merged_into_song_id} IS NULL OR ${table.merged_into_song_id} <> ${table.id}`,
    ),
    check(
      "music_songs_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_songs_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.archived_at} IS NULL OR (typeof(${table.archived_at}) = 'integer' AND ${table.archived_at} >= 0))`,
    ),
  ],
);

export type MusicSong = typeof musicSongs.$inferSelect;
export type NewMusicSong = typeof musicSongs.$inferInsert;

export const musicSongTags = sqliteTable(
  "music_song_tags",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    tag_key: text("tag_key").notNull(),
    display_name: text("display_name").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.tag_key],
      name: "pk_music_song_tags",
    }),
    index("idx_music_song_tags_key_song").on(table.tag_key, table.song_id),
    check(
      "music_song_tags_required_text_check",
      sql`length(trim(${table.tag_key})) BETWEEN 1 AND 80 AND length(trim(${table.display_name})) BETWEEN 1 AND 40`,
    ),
  ],
);

export type MusicSongTag = typeof musicSongTags.$inferSelect;
export type NewMusicSongTag = typeof musicSongTags.$inferInsert;

export const musicSongAliases = sqliteTable(
  "music_song_aliases",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    alias: text().notNull(),
    normalized_alias: text("normalized_alias").notNull(),
    locale: text(),
    alias_kind: text("alias_kind"),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.normalized_alias],
      name: "pk_music_song_aliases",
    }),
    index("idx_music_song_aliases_normalized_alias_song").on(
      table.normalized_alias,
      table.song_id,
    ),
    check(
      "music_song_aliases_required_text_check",
      sql`length(trim(${table.alias})) > 0 AND length(trim(${table.normalized_alias})) > 0`,
    ),
  ],
);

export type MusicSongAlias = typeof musicSongAliases.$inferSelect;
export type NewMusicSongAlias = typeof musicSongAliases.$inferInsert;

export const musicSongOriginalArtists = sqliteTable(
  "music_song_original_artists",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
    credit_order: integer("credit_order").notNull().default(0),
    is_primary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.entity_id],
      name: "pk_music_song_original_artists",
    }),
    uniqueIndex("uidx_music_song_original_artists_credit_order").on(
      table.song_id,
      table.credit_order,
    ),
    index("idx_music_song_original_artists_entity_song").on(
      table.entity_id,
      table.song_id,
    ),
    check(
      "music_song_original_artists_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_song_original_artists_primary_check",
      sql`${table.is_primary} IN (0, 1)`,
    ),
  ],
);

export type MusicSongOriginalArtist =
  typeof musicSongOriginalArtists.$inferSelect;
export type NewMusicSongOriginalArtist =
  typeof musicSongOriginalArtists.$inferInsert;

export const musicChannels = sqliteTable(
  "music_channels",
  {
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull(),
    external_channel_id: text("external_channel_id").notNull(),
    display_name: text("display_name").notNull(),
    channel_role: text("channel_role").$type<OtwPlayChannelRole>().notNull(),
    verification_status: text("verification_status")
      .$type<OtwPlayChannelVerificationStatus>()
      .notNull()
      .default("pending"),
    active: integer({ mode: "boolean" }).notNull().default(false),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channels_provider_external").on(
      table.provider,
      table.external_channel_id,
    ),
    index("idx_music_channels_verification_active_role").on(
      table.verification_status,
      table.active,
      table.channel_role,
    ),
    check("music_channels_provider_check", sql`${table.provider} = 'youtube'`),
    check(
      "music_channels_external_id_check",
      sql`length(${table.external_channel_id}) = 24 AND substr(${table.external_channel_id}, 1, 2) = 'UC' AND substr(${table.external_channel_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_channels_role_check",
      sql`${table.channel_role} IN ('otw_official', 'unit_official', 'member_music', 'member_main', 'project_official', 'approved_kirinuki', 'other')`,
    ),
    check(
      "music_channels_verification_check",
      sql`${table.verification_status} IN ('pending', 'approved', 'revoked')`,
    ),
    check("music_channels_active_check", sql`${table.active} IN (0, 1)`),
    check(
      "music_channels_active_approval_check",
      sql`${table.active} = 0 OR ${table.verification_status} = 'approved'`,
    ),
    check(
      "music_channels_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.display_name})) > 0`,
    ),
    check(
      "music_channels_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_channels_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannel = typeof musicChannels.$inferSelect;
export type NewMusicChannel = typeof musicChannels.$inferInsert;

export const musicChannelEntities = sqliteTable(
  "music_channel_entities",
  {
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.channel_id, table.entity_id],
      name: "pk_music_channel_entities",
    }),
    index("idx_music_channel_entities_entity_channel").on(
      table.entity_id,
      table.channel_id,
    ),
  ],
);

export type MusicChannelEntity = typeof musicChannelEntities.$inferSelect;
export type NewMusicChannelEntity = typeof musicChannelEntities.$inferInsert;

export const musicMediaSources = sqliteTable(
  "music_media_sources",
  {
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull(),
    external_id: text("external_id").notNull(),
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    title: text(),
    thumbnail_url: text("thumbnail_url"),
    duration_seconds: integer("duration_seconds"),
    provider_published_at: integer("provider_published_at"),
    availability_status: text("availability_status")
      .$type<OtwPlaySourceAvailabilityStatus>()
      .notNull()
      .default("unknown"),
    last_checked_at: integer("last_checked_at"),
    next_check_at: integer("next_check_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_media_sources_provider_external").on(
      table.provider,
      table.external_id,
    ),
    index("idx_music_media_sources_channel_published_id").on(
      table.channel_id,
      sql`${table.provider_published_at} DESC`,
      table.id,
    ),
    index("idx_music_media_sources_availability_checked").on(
      table.availability_status,
      table.last_checked_at,
    ),
    index("idx_music_media_sources_next_check_id").on(
      table.next_check_at,
      table.id,
    ),
    check(
      "music_media_sources_provider_check",
      sql`${table.provider} = 'youtube'`,
    ),
    check(
      "music_media_sources_external_id_check",
      sql`length(${table.external_id}) = 11 AND ${table.external_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_media_sources_availability_check",
      sql`${table.availability_status} IN ('unknown', 'playable', 'private', 'embed_disabled', 'deleted', 'region_blocked', 'unavailable')`,
    ),
    check(
      "music_media_sources_duration_check",
      sql`${table.duration_seconds} IS NULL OR (typeof(${table.duration_seconds}) = 'integer' AND ${table.duration_seconds} >= 0)`,
    ),
    check(
      "music_media_sources_check_times_check",
      sql`(${table.last_checked_at} IS NULL OR (typeof(${table.last_checked_at}) = 'integer' AND ${table.last_checked_at} >= 0))
        AND (${table.next_check_at} IS NULL OR (typeof(${table.next_check_at}) = 'integer' AND ${table.next_check_at} >= 0))
        AND (${table.provider_published_at} IS NULL OR (typeof(${table.provider_published_at}) = 'integer' AND ${table.provider_published_at} >= 0))`,
    ),
    check(
      "music_media_sources_required_text_check",
      sql`length(trim(${table.id})) > 0`,
    ),
    check(
      "music_media_sources_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_media_sources_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicMediaSource = typeof musicMediaSources.$inferSelect;
export type NewMusicMediaSource = typeof musicMediaSources.$inferInsert;

export const musicMediaSourceRelations = sqliteTable(
  "music_media_source_relations",
  {
    // source_id is the dependent excerpt/alternate; related_source_id is its reference.
    source_id: text("source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    related_source_id: text("related_source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    relation_type: text("relation_type")
      .$type<OtwPlaySourceRelationType>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.source_id,
        table.related_source_id,
        table.relation_type,
      ],
      name: "pk_music_media_source_relations",
    }),
    index("idx_music_media_source_relations_related_type").on(
      table.related_source_id,
      table.relation_type,
    ),
    check(
      "music_media_source_relations_type_check",
      sql`${table.relation_type} IN ('excerpt_of', 'alternate_of')`,
    ),
    check(
      "music_media_source_relations_self_check",
      sql`${table.source_id} <> ${table.related_source_id}`,
    ),
  ],
);

export type MusicMediaSourceRelation =
  typeof musicMediaSourceRelations.$inferSelect;
export type NewMusicMediaSourceRelation =
  typeof musicMediaSourceRelations.$inferInsert;

export const musicPerformances = sqliteTable(
  "music_performances",
  {
    id: text().primaryKey(),
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "restrict" }),
    // Immutable canonical identity; participant metadata is deliberately excluded.
    dedupe_key: text("dedupe_key").notNull(),
    relation_type: text("relation_type").$type<OtwPlayRelationType>().notNull(),
    release_type: text("release_type").$type<OtwPlayReleaseType>().notNull(),
    participation_type: text("participation_type")
      .$type<OtwPlayParticipationType>()
      .notNull(),
    publication_status: text("publication_status")
      .$type<OtwPlayPublicationStatus>()
      .notNull()
      .default("draft"),
    quality_status: text("quality_status")
      .$type<OtwPlayQualityStatus>()
      .notNull()
      .default("ok"),
    released_at: integer("released_at"),
    internal_note: text("internal_note"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_performances_dedupe_key").on(table.dedupe_key),
    uniqueIndex("uidx_music_performances_id_song_id").on(
      table.id,
      table.song_id,
    ),
    index("idx_music_performances_song_id").on(table.song_id),
    index("idx_music_performances_published_released_id")
      .on(sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_song_released_id")
      .on(table.song_id, sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_relation_released_id")
      .on(table.relation_type, sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_released_song_id")
      .on(sql`${table.released_at} DESC`, table.song_id, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_participation_released_song_id")
      .on(
        table.participation_type,
        sql`${table.released_at} DESC`,
        table.song_id,
        table.id,
      )
      .where(sql`${table.publication_status} = 'published'`),
    check(
      "music_performances_relation_type_check",
      sql`${table.relation_type} IN ('original', 'cover')`,
    ),
    check(
      "music_performances_release_type_check",
      sql`${table.release_type} IN ('official_mv', 'official_video', 'broadcast', 'live', 'shorts')`,
    ),
    check(
      "music_performances_participation_type_check",
      sql`${table.participation_type} IN ('solo', 'duet', 'unit', 'group', 'external_collab')`,
    ),
    check(
      "music_performances_publication_status_check",
      sql`${table.publication_status} IN ('draft', 'published', 'withdrawn')`,
    ),
    check(
      "music_performances_quality_status_check",
      sql`${table.quality_status} IN ('ok', 'needs_update')`,
    ),
    check(
      "music_performances_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.dedupe_key})) > 0`,
    ),
    check(
      "music_performances_release_time_check",
      sql`${table.released_at} IS NULL OR (typeof(${table.released_at}) = 'integer' AND ${table.released_at} >= 0)`,
    ),
    check(
      "music_performances_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_performances_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicPerformance = typeof musicPerformances.$inferSelect;
export type NewMusicPerformance = typeof musicPerformances.$inferInsert;

export const musicPerformanceParticipants = sqliteTable(
  "music_performance_participants",
  {
    performance_id: text("performance_id")
      .notNull()
      .references(() => musicPerformances.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
    participant_role: text("participant_role")
      .$type<OtwPlayParticipantRole>()
      .notNull(),
    credit_order: integer("credit_order").notNull().default(0),
    credit_name_snapshot: text("credit_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.performance_id, table.entity_id],
      name: "pk_music_performance_participants",
    }),
    uniqueIndex("uidx_music_performance_participants_credit_order").on(
      table.performance_id,
      table.credit_order,
    ),
    index("idx_music_performance_participants_entity_performance").on(
      table.entity_id,
      table.performance_id,
    ),
    check(
      "music_performance_participants_role_check",
      sql`${table.participant_role} IN ('vocal', 'featured_vocal', 'chorus', 'other')`,
    ),
    check(
      "music_performance_participants_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_performance_participants_snapshot_check",
      sql`length(trim(${table.credit_name_snapshot})) > 0`,
    ),
  ],
);

export type MusicPerformanceParticipant =
  typeof musicPerformanceParticipants.$inferSelect;
export type NewMusicPerformanceParticipant =
  typeof musicPerformanceParticipants.$inferInsert;

export const musicPublicPerformanceSortKeys = sqliteTable(
  "music_public_performance_sort_keys",
  {
    performance_id: text("performance_id").primaryKey(),
    song_id: text("song_id").notNull(),
    representative_participant_entity_id: text(
      "representative_participant_entity_id",
    ).references(() => musicEntities.id, { onDelete: "restrict" }),
    normalized_participant: text("normalized_participant"),
  },
  (table) => [
    foreignKey({
      columns: [table.performance_id, table.song_id],
      foreignColumns: [musicPerformances.id, musicPerformances.song_id],
      name: "fk_music_public_performance_sort_keys_performance_song",
    }).onDelete("cascade"),
    index(
      "idx_music_public_performance_sort_keys_participant_song_performance",
    )
      .on(
        table.normalized_participant,
        table.song_id,
        table.performance_id,
      )
      .where(sql`${table.normalized_participant} IS NOT NULL`),
    index("idx_music_public_performance_sort_keys_missing_song_performance")
      .on(table.song_id, table.performance_id)
      .where(sql`${table.normalized_participant} IS NULL`),
    index("idx_music_public_performance_sort_keys_entity_performance").on(
      table.representative_participant_entity_id,
      table.performance_id,
    ),
    check(
      "music_public_performance_sort_keys_participant_pair_check",
      sql`(${table.representative_participant_entity_id} IS NULL AND ${table.normalized_participant} IS NULL)
        OR (${table.representative_participant_entity_id} IS NOT NULL
          AND ${table.normalized_participant} IS NOT NULL
          AND length(trim(${table.normalized_participant})) > 0)`,
    ),
  ],
);

export type MusicPublicPerformanceSortKey =
  typeof musicPublicPerformanceSortKeys.$inferSelect;
export type NewMusicPublicPerformanceSortKey =
  typeof musicPublicPerformanceSortKeys.$inferInsert;

export const musicPerformanceSources = sqliteTable(
  "music_performance_sources",
  {
    performance_id: text("performance_id")
      .notNull()
      .references(() => musicPerformances.id, { onDelete: "cascade" }),
    source_id: text("source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    start_seconds: integer("start_seconds").notNull().default(0),
    end_seconds: integer("end_seconds"),
    source_role: text("source_role").$type<OtwPlaySourceRole>().notNull(),
    priority: integer().notNull().default(0),
    is_primary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.performance_id, table.source_id, table.start_seconds],
      name: "pk_music_performance_sources",
    }),
    uniqueIndex("uidx_music_performance_sources_source_start").on(
      table.source_id,
      table.start_seconds,
    ),
    uniqueIndex("uidx_music_performance_sources_primary")
      .on(table.performance_id)
      .where(sql`${table.is_primary} = 1`),
    index("idx_music_performance_sources_performance_priority_source").on(
      table.performance_id,
      table.priority,
      table.source_id,
    ),
    check(
      "music_performance_sources_range_check",
      sql`typeof(${table.start_seconds}) = 'integer' AND ${table.start_seconds} >= 0
        AND (${table.end_seconds} IS NULL OR (typeof(${table.end_seconds}) = 'integer' AND ${table.end_seconds} > ${table.start_seconds}))`,
    ),
    check(
      "music_performance_sources_role_check",
      sql`${table.source_role} IN ('official', 'kirinuki', 'broadcast_original', 'alternate')`,
    ),
    check(
      "music_performance_sources_priority_check",
      sql`typeof(${table.priority}) = 'integer' AND ${table.priority} >= 0`,
    ),
    check(
      "music_performance_sources_primary_check",
      sql`${table.is_primary} IN (0, 1)`,
    ),
  ],
);

export type MusicPerformanceSource =
  typeof musicPerformanceSources.$inferSelect;
export type NewMusicPerformanceSource =
  typeof musicPerformanceSources.$inferInsert;

export const musicCoverProposals = sqliteTable(
  "music_cover_proposals",
  {
    id: text().primaryKey(),
    submitted_by_user_id: text("submitted_by_user_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    submitted_url: text("submitted_url").notNull(),
    youtube_video_id: text("youtube_video_id").notNull(),
    segment_start_seconds: integer("segment_start_seconds")
      .notNull()
      .default(0),
    submitted_title: text("submitted_title").notNull(),
    submitted_tags_json: text("submitted_tags_json").notNull().default("[]"),
    suggested_song_id: text("suggested_song_id").references(
      () => musicSongs.id,
      { onDelete: "set null" },
    ),
    submitted_note: text("submitted_note"),
    status: text().$type<OtwPlayProposalStatus>().notNull().default("pending_review"),
    version: integer().notNull().default(0),
    review_lock_token: text("review_lock_token"),
    review_lock_expires_at: integer("review_lock_expires_at"),
    reviewed_by_user_id: text("reviewed_by_user_id"),
    reviewed_at: integer("reviewed_at"),
    review_result_code: text("review_result_code"),
    review_note: text("review_note"),
    approved_performance_id: text("approved_performance_id").references(
      () => musicPerformances.id,
      { onDelete: "restrict" },
    ),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_cover_proposals_submitter_idempotency").on(
      table.submitted_by_user_id,
      table.idempotency_key,
    ),
    uniqueIndex("uidx_music_cover_proposals_pending_video_segment")
      .on(table.youtube_video_id, table.segment_start_seconds)
      .where(sql`${table.status} = 'pending_review'`),
    uniqueIndex("uidx_music_cover_proposals_approved_performance").on(
      table.approved_performance_id,
    ),
    index("idx_music_cover_proposals_status_created_id").on(
      table.status,
      table.created_at,
      table.id,
    ),
    index("idx_music_cover_proposals_submitter_created_id").on(
      table.submitted_by_user_id,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    index("idx_music_cover_proposals_reviewer_reviewed_id")
      .on(
        table.reviewed_by_user_id,
        sql`${table.reviewed_at} DESC`,
        table.id,
      )
      .where(sql`${table.reviewed_by_user_id} IS NOT NULL`),
    index("idx_music_cover_proposals_suggested_song_id").on(
      table.suggested_song_id,
    ),
    check(
      "music_cover_proposals_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND length(trim(${table.submitted_by_user_id})) > 0
        AND length(trim(${table.idempotency_key})) > 0
        AND length(trim(${table.submitted_url})) > 0
        AND length(trim(${table.submitted_title})) > 0`,
    ),
    check(
      "music_cover_proposals_video_id_check",
      sql`length(${table.youtube_video_id}) = 11 AND ${table.youtube_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_cover_proposals_segment_check",
      sql`typeof(${table.segment_start_seconds}) = 'integer' AND ${table.segment_start_seconds} >= 0`,
    ),
    check(
      "music_cover_proposals_status_check",
      sql`${table.status} IN ('pending_review', 'approved', 'rejected', 'withdrawn')`,
    ),
    check(
      "music_cover_proposals_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_cover_proposals_lock_pair_check",
      sql`(${table.review_lock_token} IS NULL AND ${table.review_lock_expires_at} IS NULL)
        OR (${table.review_lock_token} IS NOT NULL
          AND length(trim(${table.review_lock_token})) > 0
          AND typeof(${table.review_lock_expires_at}) = 'integer'
          AND ${table.review_lock_expires_at} >= 0)`,
    ),
    check(
      "music_cover_proposals_review_pair_check",
      sql`(${table.reviewed_by_user_id} IS NULL AND ${table.reviewed_at} IS NULL)
        OR (${table.reviewed_by_user_id} IS NOT NULL
          AND length(trim(${table.reviewed_by_user_id})) > 0
          AND typeof(${table.reviewed_at}) = 'integer'
          AND ${table.reviewed_at} >= ${table.created_at})`,
    ),
    check(
      "music_cover_proposals_status_outcome_check",
      sql`(${table.status} = 'pending_review'
          AND ${table.reviewed_by_user_id} IS NULL
          AND ${table.reviewed_at} IS NULL
          AND ${table.review_result_code} IS NULL
          AND ${table.review_note} IS NULL
          AND ${table.approved_performance_id} IS NULL)
        OR (${table.status} = 'approved'
          AND ${table.reviewed_by_user_id} IS NOT NULL
          AND ${table.reviewed_at} IS NOT NULL
          AND ${table.approved_performance_id} IS NOT NULL)
        OR (${table.status} = 'rejected'
          AND ${table.reviewed_by_user_id} IS NOT NULL
          AND ${table.reviewed_at} IS NOT NULL
          AND ${table.approved_performance_id} IS NULL)
        OR (${table.status} = 'withdrawn'
          AND ${table.reviewed_by_user_id} IS NULL
          AND ${table.reviewed_at} IS NULL
          AND ${table.review_result_code} IS NULL
          AND ${table.review_note} IS NULL
          AND ${table.approved_performance_id} IS NULL)`,
    ),
    check(
      "music_cover_proposals_terminal_lock_check",
      sql`${table.status} = 'pending_review'
        OR (${table.review_lock_token} IS NULL AND ${table.review_lock_expires_at} IS NULL)`,
    ),
    check(
      "music_cover_proposals_optional_text_check",
      sql`(${table.submitted_note} IS NULL OR length(trim(${table.submitted_note})) > 0)
        AND (${table.review_result_code} IS NULL OR length(trim(${table.review_result_code})) > 0)
        AND (${table.review_note} IS NULL OR length(trim(${table.review_note})) > 0)`,
    ),
    check(
      "music_cover_proposals_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicCoverProposal = typeof musicCoverProposals.$inferSelect;
export type NewMusicCoverProposal = typeof musicCoverProposals.$inferInsert;

export const musicCoverProposalParticipants = sqliteTable(
  "music_cover_proposal_participants",
  {
    proposal_id: text("proposal_id")
      .notNull()
      .references(() => musicCoverProposals.id, { onDelete: "cascade" }),
    credit_order: integer("credit_order").notNull().default(0),
    resolved_entity_id: text("resolved_entity_id").references(
      () => musicEntities.id,
      { onDelete: "restrict" },
    ),
    submitted_member_uid: integer("submitted_member_uid").references(
      () => members.uid,
      { onDelete: "set null" },
    ),
    submitted_name_snapshot: text("submitted_name_snapshot").notNull(),
    participant_role: text("participant_role")
      .$type<OtwPlayParticipantRole>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.proposal_id, table.credit_order],
      name: "pk_music_cover_proposal_participants",
    }),
    index("idx_music_cover_proposal_participants_entity_proposal").on(
      table.resolved_entity_id,
      table.proposal_id,
    ),
    index("idx_music_cover_proposal_participants_member_proposal").on(
      table.submitted_member_uid,
      table.proposal_id,
    ),
    check(
      "music_cover_proposal_participants_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_cover_proposal_participants_snapshot_check",
      sql`length(trim(${table.submitted_name_snapshot})) > 0`,
    ),
    check(
      "music_cover_proposal_participants_role_check",
      sql`${table.participant_role} IN ('vocal', 'featured_vocal', 'chorus', 'other')`,
    ),
  ],
);

export type MusicCoverProposalParticipant =
  typeof musicCoverProposalParticipants.$inferSelect;
export type NewMusicCoverProposalParticipant =
  typeof musicCoverProposalParticipants.$inferInsert;

export const musicCoverProposalOriginalArtists = sqliteTable(
  "music_cover_proposal_original_artists",
  {
    proposal_id: text("proposal_id")
      .notNull()
      .references(() => musicCoverProposals.id, { onDelete: "cascade" }),
    credit_order: integer("credit_order").notNull().default(0),
    resolved_entity_id: text("resolved_entity_id").references(
      () => musicEntities.id,
      { onDelete: "restrict" },
    ),
    submitted_member_uid: integer("submitted_member_uid").references(
      () => members.uid,
      { onDelete: "set null" },
    ),
    submitted_name_snapshot: text("submitted_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.proposal_id, table.credit_order],
      name: "pk_music_cover_proposal_original_artists",
    }),
    index("idx_music_cover_proposal_original_artists_entity_proposal").on(
      table.resolved_entity_id,
      table.proposal_id,
    ),
    index("idx_music_cover_proposal_original_artists_member_proposal").on(
      table.submitted_member_uid,
      table.proposal_id,
    ),
    check(
      "music_cover_proposal_original_artists_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_cover_proposal_original_artists_snapshot_check",
      sql`length(trim(${table.submitted_name_snapshot})) > 0`,
    ),
  ],
);

export type MusicCoverProposalOriginalArtist =
  typeof musicCoverProposalOriginalArtists.$inferSelect;
export type NewMusicCoverProposalOriginalArtist =
  typeof musicCoverProposalOriginalArtists.$inferInsert;

export const musicCatalogEvents = sqliteTable(
  "music_catalog_events",
  {
    id: text().primaryKey(),
    aggregate_type: text("aggregate_type").notNull(),
    aggregate_id: text("aggregate_id").notNull(),
    event_type: text("event_type").notNull(),
    actor_kind: text("actor_kind")
      .$type<OtwPlayCatalogEventActorKind>()
      .notNull(),
    actor_user_id: text("actor_user_id"),
    before_json: text("before_json"),
    after_json: text("after_json"),
    detail_json: text("detail_json"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_music_catalog_events_aggregate_created_id").on(
      table.aggregate_type,
      table.aggregate_id,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    index("idx_music_catalog_events_type_created_id").on(
      table.event_type,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    check(
      "music_catalog_events_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND length(trim(${table.aggregate_type})) > 0
        AND length(trim(${table.aggregate_id})) > 0
        AND length(trim(${table.event_type})) > 0`,
    ),
    check(
      "music_catalog_events_actor_kind_check",
      sql`${table.actor_kind} IN ('member', 'admin', 'system')`,
    ),
    check(
      "music_catalog_events_actor_check",
      sql`(${table.actor_kind} = 'system' AND ${table.actor_user_id} IS NULL)
        OR (${table.actor_kind} IN ('member', 'admin')
          AND ${table.actor_user_id} IS NOT NULL
          AND length(trim(${table.actor_user_id})) > 0)`,
    ),
    check(
      "music_catalog_events_json_check",
        sql`CASE
          WHEN ${table.before_json} IS NULL THEN 1
          WHEN typeof(${table.before_json}) <> 'text' THEN 0
          WHEN json_valid(${table.before_json}) = 0 THEN 0
          ELSE json_type(${table.before_json}) = 'object'
        END
        AND CASE
          WHEN ${table.after_json} IS NULL THEN 1
          WHEN typeof(${table.after_json}) <> 'text' THEN 0
          WHEN json_valid(${table.after_json}) = 0 THEN 0
          ELSE json_type(${table.after_json}) = 'object'
        END
        AND CASE
          WHEN ${table.detail_json} IS NULL THEN 1
          WHEN typeof(${table.detail_json}) <> 'text' THEN 0
          WHEN json_valid(${table.detail_json}) = 0 THEN 0
          ELSE json_type(${table.detail_json}) = 'object'
        END`,
    ),
    check(
      "music_catalog_events_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0`,
    ),
  ],
);

export type MusicCatalogEvent = typeof musicCatalogEvents.$inferSelect;
export type NewMusicCatalogEvent = typeof musicCatalogEvents.$inferInsert;

export const musicIngestionJobs = sqliteTable(
  "music_ingestion_jobs",
  {
    id: text().primaryKey(),
    source_kind: text("source_kind").notNull().default("playlist_import"),
    source_external_id: text("source_external_id").notNull(),
    source_url: text("source_url").notNull(),
    source_title: text("source_title"),
    owner_channel_id: text("owner_channel_id").notNull(),
    owner_channel_title: text("owner_channel_title"),
    source_metadata_checked_at: integer("source_metadata_checked_at"),
    import_mode: text("import_mode").notNull(),
    range_start_position: integer("range_start_position").notNull().default(0),
    requested_item_count: integer("requested_item_count").notNull(),
    status: text().$type<OtwPlayIngestionJobStatus>().notNull().default("queued"),
    actor_user_id: text("actor_user_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    last_error_code: text("last_error_code"),
    next_retry_at: integer("next_retry_at"),
    created_at: integer("created_at").notNull(),
    started_at: integer("started_at"),
    completed_at: integer("completed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_jobs_actor_idempotency").on(
      table.actor_user_id,
      table.idempotency_key,
    ),
    index("idx_music_ingestion_jobs_source_updated_id").on(
      table.source_kind,
      table.source_external_id,
      sql`${table.updated_at} DESC`,
      table.id,
    ),
    index("idx_music_ingestion_jobs_status_retry_id").on(
      table.status,
      table.next_retry_at,
      table.id,
    ),
    check(
      "music_ingestion_jobs_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND ${table.source_kind} = 'playlist_import'
        AND length(trim(${table.source_external_id})) > 0
        AND length(trim(${table.source_url})) > 0
        AND (${table.source_title} IS NULL OR length(trim(${table.source_title})) > 0)
        AND length(trim(${table.owner_channel_id})) > 0
        AND (${table.owner_channel_title} IS NULL OR length(trim(${table.owner_channel_title})) > 0)
        AND length(trim(${table.actor_user_id})) > 0
        AND length(trim(${table.idempotency_key})) > 0`,
    ),
    check(
      "music_ingestion_jobs_mode_count_check",
      sql`${table.import_mode} IN ('all_new', 'recent')
        AND typeof(${table.requested_item_count}) = 'integer'
        AND ${table.requested_item_count} >= 0
        AND ${table.requested_item_count} <= 5000`,
    ),
    check(
      "music_ingestion_jobs_status_check",
      sql`${table.status} IN ('queued', 'collecting', 'completed', 'partial', 'failed')`,
    ),
    check(
      "music_ingestion_jobs_error_check",
      sql`(${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))`,
    ),
    check(
      "music_ingestion_jobs_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.started_at} IS NULL
          OR (typeof(${table.started_at}) = 'integer' AND ${table.started_at} >= ${table.created_at}))
        AND (${table.completed_at} IS NULL
          OR (typeof(${table.completed_at}) = 'integer' AND ${table.completed_at} >= ${table.created_at}))
        AND (${table.source_metadata_checked_at} IS NULL
          OR (typeof(${table.source_metadata_checked_at}) = 'integer'
            AND ${table.source_metadata_checked_at} >= ${table.created_at}))`,
    ),
  ],
);

export type MusicIngestionJob = typeof musicIngestionJobs.$inferSelect;
export type NewMusicIngestionJob = typeof musicIngestionJobs.$inferInsert;

export const musicIngestionCandidates = sqliteTable(
  "music_ingestion_candidates",
  {
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull().default("youtube"),
    external_video_id: text("external_video_id").notNull(),
    candidate_kind: text("candidate_kind").notNull().default("official_video"),
    status: text().$type<OtwPlayIngestionCandidateStatus>().notNull().default("discovered"),
    classification: text().$type<OtwPlayIngestionClassification>().notNull().default("pending_metadata"),
    exclusion_reason: text("exclusion_reason"),
    title: text(),
    channel_id: text("channel_id"),
    channel_title: text("channel_title"),
    thumbnail_url: text("thumbnail_url"),
    duration_seconds: integer("duration_seconds"),
    provider_published_at: integer("provider_published_at"),
    availability_status: text("availability_status")
      .$type<OtwPlaySourceAvailabilityStatus>()
      .notNull()
      .default("unknown"),
    made_for_kids: integer("made_for_kids", { mode: "boolean" }),
    metadata_checked_at: integer("metadata_checked_at"),
    review_input_json: text("review_input_json"),
    reviewed_by_user_id: text("reviewed_by_user_id"),
    last_conversion_outcome: text("last_conversion_outcome")
      .$type<OtwPlayIngestionConversionOutcome>(),
    last_conversion_error_code: text("last_conversion_error_code"),
    last_conversion_attempt_at: integer("last_conversion_attempt_at"),
    first_discovered_at: integer("first_discovered_at").notNull(),
    last_discovered_at: integer("last_discovered_at").notNull(),
    retention_expires_at: integer("retention_expires_at").notNull(),
    next_retry_at: integer("next_retry_at"),
    linked_performance_id: text("linked_performance_id").references(
      () => musicPerformances.id,
      { onDelete: "restrict" },
    ),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_candidates_provider_video").on(
      table.provider,
      table.external_video_id,
    ),
    index("idx_music_ingestion_candidates_status_updated_id").on(
      table.status,
      sql`${table.updated_at} DESC`,
      table.id,
    ),
    index("idx_music_ingestion_candidates_channel_status_id").on(
      table.channel_id,
      table.status,
      table.id,
    ),
    index("idx_music_ingestion_candidates_refresh_id").on(
      table.metadata_checked_at,
      table.id,
    ),
    index("idx_music_ingestion_candidates_retention_id").on(
      table.retention_expires_at,
      table.id,
    ),
    check(
      "music_ingestion_candidates_identity_check",
      sql`${table.provider} = 'youtube'
        AND length(${table.external_video_id}) = 11
        AND ${table.external_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'
        AND ${table.candidate_kind} IN ('official_video', 'singing_clip')`,
    ),
    check(
      "music_ingestion_candidates_status_check",
      sql`${table.status} IN ('discovered', 'needs_input', 'ready', 'converted', 'ignored', 'blocked')`,
    ),
    check(
      "music_ingestion_candidates_classification_check",
      sql`${table.classification} IN ('pending_metadata', 'eligible', 'existing_catalog',
        'existing_proposal', 'existing_candidate', 'channel_review', 'policy_blocked',
        'unavailable', 'scope_review', 'playlist_duplicate')`,
    ),
    check(
      "music_ingestion_candidates_metadata_check",
      sql`(${table.exclusion_reason} IS NULL OR length(trim(${table.exclusion_reason})) > 0)
        AND (${table.title} IS NULL OR length(trim(${table.title})) > 0)
        AND (${table.channel_id} IS NULL OR length(trim(${table.channel_id})) > 0)
        AND (${table.channel_title} IS NULL OR length(trim(${table.channel_title})) > 0)
        AND (${table.duration_seconds} IS NULL
          OR (typeof(${table.duration_seconds}) = 'integer' AND ${table.duration_seconds} >= 0))`,
    ),
    check(
      "music_ingestion_candidates_availability_check",
      sql`${table.availability_status} IN ('unknown', 'playable', 'private',
        'embed_disabled', 'deleted', 'region_blocked', 'unavailable')`,
    ),
    check(
      "music_ingestion_candidates_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.first_discovered_at}) = 'integer' AND ${table.first_discovered_at} >= 0
        AND typeof(${table.last_discovered_at}) = 'integer'
        AND ${table.last_discovered_at} >= ${table.first_discovered_at}
        AND typeof(${table.retention_expires_at}) = 'integer'
        AND ${table.retention_expires_at} >= ${table.last_discovered_at}
        AND (${table.metadata_checked_at} IS NULL
          OR (typeof(${table.metadata_checked_at}) = 'integer' AND ${table.metadata_checked_at} >= 0))
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicIngestionCandidate = typeof musicIngestionCandidates.$inferSelect;
export type NewMusicIngestionCandidate = typeof musicIngestionCandidates.$inferInsert;

export const musicChannelAutomationApprovals = sqliteTable(
  "music_channel_automation_approvals",
  {
    channel_id: text("channel_id")
      .primaryKey()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    scope: text().$type<"candidate_collection">().notNull(),
    status: text().$type<"approved" | "revoked">().notNull(),
    operator_reference: text("operator_reference").notNull(),
    approval_reference: text("approval_reference").notNull(),
    revocation_procedure: text("revocation_procedure").notNull(),
    approved_by_user_id: text("approved_by_user_id").notNull(),
    approved_at: integer("approved_at").notNull(),
    revoked_by_user_id: text("revoked_by_user_id"),
    revoked_at: integer("revoked_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_music_channel_automation_approvals_status_channel").on(
      table.status,
      table.channel_id,
    ),
    check(
      "music_channel_automation_approvals_required_check",
      sql`${table.scope} = 'candidate_collection'
        AND ${table.status} IN ('approved', 'revoked')
        AND length(trim(${table.operator_reference})) > 0
        AND length(trim(${table.approval_reference})) > 0
        AND length(trim(${table.revocation_procedure})) > 0
        AND length(trim(${table.approved_by_user_id})) > 0`,
    ),
    check(
      "music_channel_automation_approvals_revocation_check",
      sql`(${table.status} = 'approved'
          AND ${table.revoked_by_user_id} IS NULL
          AND ${table.revoked_at} IS NULL)
        OR (${table.status} = 'revoked'
          AND length(trim(${table.revoked_by_user_id})) > 0
          AND typeof(${table.revoked_at}) = 'integer'
          AND ${table.revoked_at} >= ${table.approved_at})`,
    ),
    check(
      "music_channel_automation_approvals_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.approved_at}) = 'integer' AND ${table.approved_at} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannelAutomationApproval =
  typeof musicChannelAutomationApprovals.$inferSelect;
export type NewMusicChannelAutomationApproval =
  typeof musicChannelAutomationApprovals.$inferInsert;

export const musicChannelUploadMonitors = sqliteTable(
  "music_channel_upload_monitors",
  {
    id: text().primaryKey(),
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    uploads_playlist_id: text("uploads_playlist_id").notNull(),
    status: text().$type<"active" | "paused">().notNull().default("active"),
    check_interval_minutes: integer("check_interval_minutes").notNull().default(360),
    last_checked_at: integer("last_checked_at"),
    next_check_at: integer("next_check_at").notNull(),
    last_seen_video_id: text("last_seen_video_id"),
    last_seen_published_at: integer("last_seen_published_at"),
    last_recent_reconciled_at: integer("last_recent_reconciled_at"),
    last_error_code: text("last_error_code"),
    lease_until: integer("lease_until"),
    generation: integer().notNull().default(0),
    deleted_at: integer("deleted_at"),
    created_by_user_id: text("created_by_user_id").notNull(),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_upload_monitors_channel")
      .on(table.channel_id)
      .where(sql`${table.deleted_at} IS NULL`),
    index("idx_music_channel_upload_monitors_due").on(
      table.status,
      table.next_check_at,
      table.lease_until,
      table.id,
    ),
    check(
      "music_channel_upload_monitors_identity_check",
      sql`length(trim(${table.id})) > 0
        AND length(${table.uploads_playlist_id}) = 24
        AND substr(${table.uploads_playlist_id}, 1, 2) = 'UU'
        AND substr(${table.uploads_playlist_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(trim(${table.created_by_user_id})) > 0`,
    ),
    check(
      "music_channel_upload_monitors_status_interval_check",
      sql`${table.status} IN ('active', 'paused')
        AND typeof(${table.check_interval_minutes}) = 'integer'
        AND ${table.check_interval_minutes} >= 60
        AND ${table.check_interval_minutes} <= 1440`,
    ),
    check(
      "music_channel_upload_monitors_watermark_check",
      sql`(${table.last_seen_video_id} IS NULL
          OR (length(${table.last_seen_video_id}) = 11
            AND ${table.last_seen_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'))
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)`,
    ),
    check(
      "music_channel_upload_monitors_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND typeof(${table.next_check_at}) = 'integer' AND ${table.next_check_at} >= 0`,
    ),
  ],
);

export const musicChannelWebsubSubscriptions = sqliteTable(
  "music_channel_websub_subscriptions",
  {
    id: text().primaryKey(),
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "restrict" }),
    monitor_generation: integer("monitor_generation").notNull(),
    topic_url: text("topic_url").notNull(),
    callback_token_hash: text("callback_token_hash").notNull(),
    secret_version: integer("secret_version").notNull(),
    status: text()
      .$type<
        | "pending"
        | "active"
        | "renewing"
        | "unsubscribing"
        | "unsubscribed"
        | "denied"
        | "failed"
      >()
      .notNull(),
    pending_mode: text("pending_mode").$type<"subscribe" | "unsubscribe">(),
    requested_at: integer("requested_at").notNull(),
    verified_at: integer("verified_at"),
    lease_expires_at: integer("lease_expires_at"),
    last_notification_at: integer("last_notification_at"),
    last_error_code: text("last_error_code"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_websub_subscriptions_monitor_generation").on(
      table.monitor_id,
      table.monitor_generation,
    ),
    uniqueIndex("uidx_music_channel_websub_subscriptions_callback_hash").on(
      table.callback_token_hash,
    ),
    index("idx_music_channel_websub_subscriptions_lease").on(
      table.status,
      table.lease_expires_at,
      table.id,
    ),
    check(
      "music_channel_websub_subscriptions_identity_check",
      sql`length(trim(${table.id})) > 0
        AND ${table.monitor_generation} >= 0
        AND length(${table.topic_url}) = 80
        AND substr(${table.topic_url}, 1, 56) = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id='
        AND length(${table.callback_token_hash}) = 64
        AND ${table.callback_token_hash} NOT GLOB '*[^a-f0-9]*'
        AND typeof(${table.secret_version}) = 'integer'
        AND ${table.secret_version} >= 1`,
    ),
    check(
      "music_channel_websub_subscriptions_status_check",
      sql`${table.status} IN ('pending', 'active', 'renewing', 'unsubscribing',
        'unsubscribed', 'denied', 'failed')
        AND (${table.pending_mode} IS NULL
          OR ${table.pending_mode} IN ('subscribe', 'unsubscribe'))
        AND ((${table.status} IN ('pending', 'renewing') AND ${table.pending_mode} = 'subscribe')
          OR (${table.status} = 'unsubscribing' AND ${table.pending_mode} = 'unsubscribe')
          OR (${table.status} IN ('active', 'unsubscribed', 'denied', 'failed')
            AND ${table.pending_mode} IS NULL))
        AND (${table.status} <> 'active'
          OR (${table.verified_at} IS NOT NULL AND ${table.lease_expires_at} IS NOT NULL))`,
    ),
    check(
      "music_channel_websub_subscriptions_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.requested_at}) = 'integer' AND ${table.requested_at} >= 0
        AND (${table.verified_at} IS NULL
          OR (typeof(${table.verified_at}) = 'integer' AND ${table.verified_at} >= 0))
        AND (${table.lease_expires_at} IS NULL
          OR (typeof(${table.lease_expires_at}) = 'integer'
            AND ${table.lease_expires_at} >= ${table.requested_at}))
        AND (${table.last_notification_at} IS NULL
          OR (typeof(${table.last_notification_at}) = 'integer'
            AND ${table.last_notification_at} >= 0))
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannelWebsubSubscription =
  typeof musicChannelWebsubSubscriptions.$inferSelect;
export type NewMusicChannelWebsubSubscription =
  typeof musicChannelWebsubSubscriptions.$inferInsert;

export const musicChannelWebsubDeliveries = sqliteTable(
  "music_channel_websub_deliveries",
  {
    id: text().primaryKey(),
    subscription_id: text("subscription_id")
      .notNull()
      .references(() => musicChannelWebsubSubscriptions.id, { onDelete: "restrict" }),
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "restrict" }),
    monitor_generation: integer("monitor_generation").notNull(),
    external_channel_id: text("external_channel_id").notNull(),
    external_video_id: text("external_video_id").notNull(),
    provider_updated_at: integer("provider_updated_at").notNull(),
    status: text()
      .$type<
        | "pending"
        | "enqueued"
        | "processing"
        | "completed"
        | "rejected"
        | "failed"
        | "dead_letter"
      >()
      .notNull(),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error_code: text("last_error_code"),
    received_at: integer("received_at").notNull(),
    enqueued_at: integer("enqueued_at"),
    processed_at: integer("processed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_websub_deliveries_event").on(
      table.subscription_id,
      table.external_video_id,
      table.provider_updated_at,
    ),
    index("idx_music_channel_websub_deliveries_status_received").on(
      table.status,
      table.received_at,
      table.id,
    ),
    index("idx_music_channel_websub_deliveries_monitor_received").on(
      table.monitor_id,
      sql`${table.received_at} DESC`,
      table.id,
    ),
    check(
      "music_channel_websub_deliveries_identity_check",
      sql`length(trim(${table.id})) > 0
        AND typeof(${table.monitor_generation}) = 'integer'
        AND ${table.monitor_generation} >= 0
        AND length(${table.external_channel_id}) = 24
        AND substr(${table.external_channel_id}, 1, 2) = 'UC'
        AND substr(${table.external_channel_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(${table.external_video_id}) = 11
        AND ${table.external_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_channel_websub_deliveries_status_check",
      sql`${table.status} IN ('pending', 'enqueued', 'processing', 'completed',
        'rejected', 'failed', 'dead_letter')
        AND typeof(${table.attempt_count}) = 'integer'
        AND ${table.attempt_count} >= 0
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)`,
    ),
    check(
      "music_channel_websub_deliveries_time_check",
      sql`typeof(${table.provider_updated_at}) = 'integer' AND ${table.provider_updated_at} >= 0
        AND typeof(${table.received_at}) = 'integer' AND ${table.received_at} >= 0
        AND (${table.enqueued_at} IS NULL
          OR (typeof(${table.enqueued_at}) = 'integer' AND ${table.enqueued_at} >= ${table.received_at}))
        AND (${table.processed_at} IS NULL
          OR (typeof(${table.processed_at}) = 'integer' AND ${table.processed_at} >= ${table.received_at}))
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.received_at}`,
    ),
  ],
);

export type MusicChannelWebsubDelivery =
  typeof musicChannelWebsubDeliveries.$inferSelect;
export type NewMusicChannelWebsubDelivery =
  typeof musicChannelWebsubDeliveries.$inferInsert;

export const musicChannelUploadCandidateOrigins = sqliteTable(
  "music_channel_upload_candidate_origins",
  {
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "cascade" }),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => musicIngestionCandidates.id, { onDelete: "cascade" }),
    provider_published_at: integer("provider_published_at"),
    discovered_at: integer("discovered_at").notNull(),
    monitor_generation: integer("monitor_generation").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.monitor_id, table.candidate_id] }),
    index("idx_music_channel_upload_origins_monitor_discovered").on(
      table.monitor_id,
      sql`${table.discovered_at} DESC`,
      table.candidate_id,
    ),
    index("idx_music_channel_upload_origins_monitor_generation_discovered").on(
      table.monitor_id,
      table.monitor_generation,
      sql`${table.discovered_at} DESC`,
      table.candidate_id,
    ),
  ],
);

export const musicIngestionEvents = sqliteTable(
  "music_ingestion_events",
  {
    id: text().primaryKey(),
    job_id: text("job_id").references(() => musicIngestionJobs.id, {
      onDelete: "restrict",
    }),
    candidate_id: text("candidate_id").references(
      () => musicIngestionCandidates.id,
      { onDelete: "restrict" },
    ),
    event_type: text("event_type").notNull(),
    actor_user_id: text("actor_user_id").notNull(),
    detail_json: text("detail_json").notNull().default("{}"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_music_ingestion_events_job_created_id").on(
      table.job_id,
      table.created_at,
      table.id,
    ),
    index("idx_music_ingestion_events_candidate_created_id").on(
      table.candidate_id,
      table.created_at,
      table.id,
    ),
    check(
      "music_ingestion_events_required_check",
      sql`length(trim(${table.id})) > 0
        AND (${table.job_id} IS NOT NULL OR ${table.candidate_id} IS NOT NULL)
        AND length(trim(${table.event_type})) > 0
        AND length(trim(${table.actor_user_id})) > 0
        AND json_valid(${table.detail_json}) = 1
        AND json_type(${table.detail_json}) = 'object'
        AND typeof(${table.created_at}) = 'integer'
        AND ${table.created_at} >= 0`,
    ),
  ],
);

export type MusicIngestionEvent = typeof musicIngestionEvents.$inferSelect;
export type NewMusicIngestionEvent = typeof musicIngestionEvents.$inferInsert;

export const musicIngestionCandidateOrigins = sqliteTable(
  "music_ingestion_candidate_origins",
  {
    id: text().primaryKey(),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => musicIngestionCandidates.id, { onDelete: "cascade" }),
    job_id: text("job_id")
      .notNull()
      .references(() => musicIngestionJobs.id, { onDelete: "cascade" }),
    origin_kind: text("origin_kind").notNull().default("playlist_import"),
    playlist_id: text("playlist_id").notNull(),
    playlist_item_id: text("playlist_item_id").notNull(),
    playlist_position: integer("playlist_position").notNull(),
    is_playlist_duplicate: integer("is_playlist_duplicate", { mode: "boolean" })
      .notNull()
      .default(false),
    discovered_at: integer("discovered_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_origins_job_item").on(
      table.job_id,
      table.playlist_item_id,
    ),
    index("idx_music_ingestion_origins_job_position_id").on(
      table.job_id,
      table.playlist_position,
      table.id,
    ),
    index("idx_music_ingestion_origins_candidate_discovered_id").on(
      table.candidate_id,
      sql`${table.discovered_at} DESC`,
      table.id,
    ),
    check(
      "music_ingestion_origins_required_check",
      sql`${table.origin_kind} = 'playlist_import'
        AND length(trim(${table.id})) > 0
        AND length(trim(${table.playlist_id})) > 0
        AND length(trim(${table.playlist_item_id})) > 0
        AND typeof(${table.playlist_position}) = 'integer'
        AND ${table.playlist_position} >= 0
        AND typeof(${table.is_playlist_duplicate}) = 'integer'
        AND ${table.is_playlist_duplicate} IN (0, 1)
        AND typeof(${table.discovered_at}) = 'integer'
        AND ${table.discovered_at} >= 0`,
    ),
  ],
);

export type MusicIngestionCandidateOrigin =
  typeof musicIngestionCandidateOrigins.$inferSelect;
export type NewMusicIngestionCandidateOrigin =
  typeof musicIngestionCandidateOrigins.$inferInsert;

export const musicIngestionMessages = sqliteTable(
  "music_ingestion_messages",
  {
    idempotency_key: text("idempotency_key").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => musicIngestionJobs.id, { onDelete: "cascade" }),
    message_kind: text("message_kind").notNull(),
    payload_key: text("payload_key").notNull(),
    page_token: text("page_token"),
    video_ids_json: text("video_ids_json"),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    last_error_code: text("last_error_code"),
    next_retry_at: integer("next_retry_at"),
    created_at: integer("created_at").notNull(),
    completed_at: integer("completed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_messages_job_kind_payload").on(
      table.job_id,
      table.message_kind,
      table.payload_key,
    ),
    index("idx_music_ingestion_messages_status_retry_key").on(
      table.status,
      table.next_retry_at,
      table.idempotency_key,
    ),
    check(
      "music_ingestion_messages_required_check",
      sql`length(trim(${table.idempotency_key})) > 0
        AND length(trim(${table.payload_key})) > 0
        AND ${table.message_kind} IN ('playlist_page', 'video_batch')
        AND ${table.status} IN ('pending', 'completed', 'failed')
        AND typeof(${table.attempts}) = 'integer' AND ${table.attempts} >= 0`,
    ),
    check(
      "music_ingestion_messages_payload_check",
      sql`(${table.message_kind} = 'playlist_page' AND ${table.video_ids_json} IS NULL)
        OR (${table.message_kind} = 'video_batch'
          AND ${table.page_token} IS NULL
          AND ${table.video_ids_json} IS NOT NULL
          AND json_valid(${table.video_ids_json}) = 1
          AND json_type(${table.video_ids_json}) = 'array')`,
    ),
    check(
      "music_ingestion_messages_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.completed_at} IS NULL
          OR (typeof(${table.completed_at}) = 'integer' AND ${table.completed_at} >= ${table.created_at}))
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))`,
    ),
  ],
);

export type MusicIngestionMessage = typeof musicIngestionMessages.$inferSelect;
export type NewMusicIngestionMessage = typeof musicIngestionMessages.$inferInsert;

export const musicSearchTerms = sqliteTable(
  "music_search_terms",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    term_kind: text("term_kind").$type<OtwPlaySearchTermKind>().notNull(),
    display_value: text("display_value").notNull(),
    normalized_term: text("normalized_term").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.term_kind, table.normalized_term],
      name: "pk_music_search_terms",
    }),
    index("idx_music_search_terms_normalized_kind_song").on(
      table.normalized_term,
      table.term_kind,
      table.song_id,
    ),
    check(
      "music_search_terms_kind_check",
      sql`${table.term_kind} IN ('title', 'title_alias', 'original_artist', 'participant')`,
    ),
    check(
      "music_search_terms_required_text_check",
      sql`length(trim(${table.display_value})) > 0 AND length(trim(${table.normalized_term})) > 0`,
    ),
  ],
);

export type MusicSearchTerm = typeof musicSearchTerms.$inferSelect;
export type NewMusicSearchTerm = typeof musicSearchTerms.$inferInsert;

export const musicSearchGrams = sqliteTable(
  "music_search_grams",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    gram_size: integer("gram_size").notNull(),
    normalized_gram: text("normalized_gram").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.gram_size, table.normalized_gram],
      name: "pk_music_search_grams",
    }),
    index("idx_music_search_grams_size_normalized_song").on(
      table.gram_size,
      table.normalized_gram,
      table.song_id,
    ),
    check(
      "music_search_grams_size_check",
      sql`typeof(${table.gram_size}) = 'integer'
        AND ${table.gram_size} IN (2, 3)`,
    ),
    check(
      "music_search_grams_value_check",
      sql`typeof(${table.normalized_gram}) = 'text'
        AND length(${table.normalized_gram}) = ${table.gram_size}`,
    ),
  ],
);

export type MusicSearchGram = typeof musicSearchGrams.$inferSelect;
export type NewMusicSearchGram = typeof musicSearchGrams.$inferInsert;

export const musicSearchGramStats = sqliteTable(
  "music_search_gram_stats",
  {
    gram_size: integer("gram_size").notNull(),
    normalized_gram: text("normalized_gram").notNull(),
    song_count: integer("song_count").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.gram_size, table.normalized_gram],
      name: "pk_music_search_gram_stats",
    }),
    check(
      "music_search_gram_stats_size_check",
      sql`typeof(${table.gram_size}) = 'integer'
        AND ${table.gram_size} IN (2, 3)`,
    ),
    check(
      "music_search_gram_stats_value_check",
      sql`typeof(${table.normalized_gram}) = 'text'
        AND length(${table.normalized_gram}) = ${table.gram_size}`,
    ),
    check(
      "music_search_gram_stats_count_check",
      sql`typeof(${table.song_count}) = 'integer'
        AND ${table.song_count} > 0`,
    ),
  ],
);

export type MusicSearchGramStat = typeof musicSearchGramStats.$inferSelect;
export type NewMusicSearchGramStat =
  typeof musicSearchGramStats.$inferInsert;

export const musicCatalogMeta = sqliteTable(
  "music_catalog_meta",
  {
    id: integer().primaryKey(),
    revision: integer().notNull().default(0),
    public_read_enabled: integer("public_read_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    navigation_visible: integer("navigation_visible", { mode: "boolean" })
      .notNull()
      .default(false),
    updated_at: integer("updated_at").notNull().default(0),
  },
  (table) => [
    check(
      "music_catalog_meta_singleton_check",
      sql`typeof(${table.id}) = 'integer' AND ${table.id} = 1`,
    ),
    check(
      "music_catalog_meta_revision_check",
      sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 0`,
    ),
    check(
      "music_catalog_meta_flags_check",
      sql`typeof(${table.public_read_enabled}) = 'integer'
        AND ${table.public_read_enabled} IN (0, 1)
        AND typeof(${table.navigation_visible}) = 'integer'
        AND ${table.navigation_visible} IN (0, 1)`,
    ),
    check(
      "music_catalog_meta_navigation_check",
      sql`${table.navigation_visible} = 0 OR ${table.public_read_enabled} = 1`,
    ),
    check(
      "music_catalog_meta_time_check",
      sql`typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= 0`,
    ),
  ],
);

export type MusicCatalogMeta = typeof musicCatalogMeta.$inferSelect;
export type NewMusicCatalogMeta = typeof musicCatalogMeta.$inferInsert;

export const musicPublicReadModelMeta = sqliteTable(
  "music_public_read_model_meta",
  {
    id: integer().primaryKey(),
    revision: integer().notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "music_public_read_model_meta_singleton_check",
      sql`typeof(${table.id}) = 'integer' AND ${table.id} = 1`,
    ),
    check(
      "music_public_read_model_meta_revision_check",
      sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 0`,
    ),
    check(
      "music_public_read_model_meta_time_check",
      sql`typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= 0`,
    ),
  ],
);

export type MusicPublicReadModelMeta =
  typeof musicPublicReadModelMeta.$inferSelect;
export type NewMusicPublicReadModelMeta =
  typeof musicPublicReadModelMeta.$inferInsert;
