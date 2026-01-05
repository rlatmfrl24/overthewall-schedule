import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  sqliteTable,
  text,
  index,
  check,
} from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  uid: integer().primaryKey({ autoIncrement: true }),
  code: text().notNull(),
  name: text().notNull(),
  main_color: text("main_color"),
  sub_color: text("sub_color"),
  oshi_mark: text("oshi_mark"),
  url_twitter: text("url_twitter"),
  url_youtube: text("url_youtube"),
  url_chzzk: text("url_chzzk"),
  birth_date: text("birth_date"),
  debut_date: text("debut_date"),
  unit_name: text("unit_name"),
  fan_name: text("fan_name"),
  introduction: text("introduction"),
  is_deprecated: numeric("is_deprecated"),
});

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
    check(
      "schedules_status_check",
      sql`status IN ('방송', '휴방', '게릴라', '미정')`
    ),
  ]
);

export const notices = sqliteTable(
  "notices",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    content: text().notNull(),
    url: text(),
    type: text("type").notNull().default("notice"),
    is_active: numeric("is_active").default("1"),
    started_at: text("started_at"),
    ended_at: text("ended_at"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  () => [check("notices_type_check", sql`type IN ('notice', 'event')`)]
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
  ]
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;
export type DDay = typeof ddays.$inferSelect;
export type NewDDay = typeof ddays.$inferInsert;
