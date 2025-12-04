import { relations } from "drizzle-orm";
import { members, schedules } from "./schema";

export const membersRelations = relations(members, ({ many }) => ({
  schedules: many(schedules),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  member: one(members, {
    fields: [schedules.member_uid],
    references: [members.uid],
  }),
}));

