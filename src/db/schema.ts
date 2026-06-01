import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  sqliteTable,
  text,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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
      sql`type IN ('youtube_vod', 'youtube_sub')`,
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
    url: text(),
    type: text("type").notNull().default("notice"),
    is_active: integer("is_active", { mode: "boolean" }).default(true),
    started_at: text("started_at"),
    ended_at: text("ended_at"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  () => [check("notices_type_check", sql`type IN ('notice', 'event')`)],
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
  ],
);

export type UpdateLog = typeof updateLogs.$inferSelect;
export type NewUpdateLog = typeof updateLogs.$inferInsert;

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
    previous_title: text("previous_title"), // 수정 전 제목
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
