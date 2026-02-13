import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  sqliteTable,
  text,
  index,
  check,
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
