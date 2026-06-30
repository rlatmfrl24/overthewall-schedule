import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { type DbInstance } from "../db";
import { members, schedules, settings } from "../../src/db/schema";
import type { CachedLiveStatus } from "../types";
import {
  extractChzzkChannelId,
  extractKSTTime,
  getKSTDateString,
  insertUpdateLog,
} from "../utils/helpers";

type LiveStatusContent = NonNullable<CachedLiveStatus["content"]>;

export type LiveStatusItem = {
  channelId: string;
  content: CachedLiveStatus["content"] | null;
};

export const LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY =
  "live_schedule_auto_fill_enabled";

type LiveScheduleMember = {
  uid: number;
  name: string;
  url_chzzk: string | null;
};

type LiveScheduleRow = {
  id: number;
  member_uid: number;
  date: string;
  start_time?: string | null;
  title?: string | null;
  status: string;
};

type LiveScheduleFillPlanBase = {
  memberUid: number;
  memberName: string;
  scheduleDate: string;
  startTime: string;
  title: string;
};

export type LiveScheduleFillPlan =
  | (LiveScheduleFillPlanBase & {
      action: "update";
      scheduleId: number;
      previousStatus: string;
    })
  | (LiveScheduleFillPlanBase & {
      action: "create";
      scheduleId: null;
      previousStatus: null;
    });

const isOpenLiveStatus = (
  content: CachedLiveStatus["content"] | null,
): content is LiveStatusContent => content?.status === "OPEN";

const normalizeChannelId = (value: string) => value.trim().toLowerCase();

export const isLiveScheduleAutoFillEnabled = async (db: DbInstance) => {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY))
    .limit(1);

  return rows[0]?.value !== "false";
};

const hasExplicitTimezone = (value: string) =>
  /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);

const HALF_HOUR_MS = 30 * 60 * 1000;

export const roundToNearestHalfHour = (date: Date) =>
  new Date(Math.round(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);

export const resolveLiveOpenedAt = (
  content: LiveStatusContent,
  fallback: Date = new Date(),
) => {
  const rawOpenDate = content.openDate?.trim();
  if (!rawOpenDate) return fallback;

  const normalized = rawOpenDate.includes("T")
    ? rawOpenDate
    : rawOpenDate.replace(" ", "T");
  const withTimezone = hasExplicitTimezone(normalized)
    ? normalized
    : `${normalized}+09:00`;
  const parsed = new Date(withTimezone);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const resolveLiveTitle = (content: LiveStatusContent) =>
  content.liveTitle?.trim() || "방송 중";

const isUndecidedSchedule = (schedule: LiveScheduleRow) =>
  schedule.status === "미정" ||
  (schedule.status === "방송" && !schedule.start_time?.trim());

export const buildLiveScheduleFillPlans = ({
  members: memberRows,
  schedules: scheduleRows,
  liveItems,
  now = new Date(),
}: {
  members: LiveScheduleMember[];
  schedules: LiveScheduleRow[];
  liveItems: LiveStatusItem[];
  now?: Date;
}): LiveScheduleFillPlan[] => {
  const openLiveByChannel = new Map<string, LiveStatusContent>();
  for (const item of liveItems) {
    if (isOpenLiveStatus(item.content)) {
      openLiveByChannel.set(normalizeChannelId(item.channelId), item.content);
    }
  }

  if (openLiveByChannel.size === 0) {
    return [];
  }

  const plans: LiveScheduleFillPlan[] = [];

  for (const member of memberRows) {
    const channelId = extractChzzkChannelId(member.url_chzzk);
    if (!channelId) continue;

    const live = openLiveByChannel.get(normalizeChannelId(channelId));
    if (!live) continue;

    const openedAt = roundToNearestHalfHour(resolveLiveOpenedAt(live, now));
    const scheduleDate = getKSTDateString(openedAt);
    const memberSchedulesForDate = scheduleRows.filter(
      (schedule) =>
        schedule.member_uid === member.uid && schedule.date === scheduleDate,
    );
    const targetSchedule = memberSchedulesForDate.find((schedule) =>
      isUndecidedSchedule(schedule),
    );

    const basePlan = {
      memberUid: member.uid,
      memberName: member.name,
      scheduleDate,
      startTime: extractKSTTime(openedAt.toISOString()),
      title: resolveLiveTitle(live),
    };

    if (targetSchedule) {
      plans.push({
        ...basePlan,
        action: "update",
        scheduleId: targetSchedule.id,
        previousStatus: targetSchedule.status,
      });
      continue;
    }

    if (memberSchedulesForDate.length === 0) {
      plans.push({
        ...basePlan,
        action: "create",
        scheduleId: null,
        previousStatus: null,
      });
    }
  }

  return plans;
};

export const autoFillUndecidedLiveSchedules = async (
  db: DbInstance,
  liveItems: LiveStatusItem[],
) => {
  const openChannelIds = liveItems
    .filter((item) => isOpenLiveStatus(item.content))
    .map((item) => normalizeChannelId(item.channelId));

  if (openChannelIds.length === 0) {
    return { updated: 0, details: [] as LiveScheduleFillPlan[] };
  }

  const memberRows = await db
    .select({
      uid: members.uid,
      name: members.name,
      url_chzzk: members.url_chzzk,
    })
    .from(members)
    .where(
      sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != 1`,
    );

  const channelSet = new Set(openChannelIds);
  const targetMembers = memberRows.filter((member) => {
    const channelId = extractChzzkChannelId(member.url_chzzk);
    return channelId ? channelSet.has(normalizeChannelId(channelId)) : false;
  });

  if (targetMembers.length === 0) {
    return { updated: 0, details: [] as LiveScheduleFillPlan[] };
  }

  const liveDates = new Set<string>();
  for (const item of liveItems) {
    if (isOpenLiveStatus(item.content)) {
      liveDates.add(
        getKSTDateString(roundToNearestHalfHour(resolveLiveOpenedAt(item.content))),
      );
    }
  }

  const memberUids = targetMembers.map((member) => member.uid);
  const dateValues = [...liveDates];

  if (memberUids.length === 0 || dateValues.length === 0) {
    return { updated: 0, details: [] as LiveScheduleFillPlan[] };
  }

  const scheduleRows = await db
    .select({
      id: schedules.id,
      member_uid: schedules.member_uid,
      date: schedules.date,
      start_time: schedules.start_time,
      title: schedules.title,
      status: schedules.status,
    })
    .from(schedules)
    .where(
      and(
        inArray(schedules.member_uid, memberUids),
        inArray(schedules.date, dateValues),
      ),
    )
    .orderBy(asc(schedules.id));

  const plans = buildLiveScheduleFillPlans({
    members: targetMembers,
    schedules: scheduleRows,
    liveItems,
  });
  let updated = 0;
  const details: LiveScheduleFillPlan[] = [];

  for (const plan of plans) {
    if (plan.action === "create") {
      const existingRows = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(
          and(
            eq(schedules.member_uid, plan.memberUid),
            eq(schedules.date, plan.scheduleDate),
          ),
        )
        .limit(1);

      if (existingRows.length > 0) {
        continue;
      }

      const result = await db.insert(schedules).values({
        member_uid: plan.memberUid,
        date: plan.scheduleDate,
        start_time: plan.startTime,
        title: plan.title,
        status: "방송",
      });

      if (result.meta.changes !== 1) {
        continue;
      }

      await insertUpdateLog(db, {
        scheduleId: null,
        memberUid: plan.memberUid,
        memberName: plan.memberName,
        scheduleDate: plan.scheduleDate,
        action: "auto_collected",
        title: plan.title,
        previousStatus: null,
      });

      updated += 1;
      details.push(plan);
      continue;
    }

    const result = await db
      .update(schedules)
      .set({
        status: "방송",
        start_time: plan.startTime,
        title: plan.title,
      })
      .where(
        and(
          eq(schedules.id, plan.scheduleId),
          or(
            eq(schedules.status, "미정"),
            and(
              eq(schedules.status, "방송"),
              sql`(${schedules.start_time} IS NULL OR trim(${schedules.start_time}) = '')`,
            ),
          ),
        ),
      );

    if (result.meta.changes !== 1) {
      continue;
    }

    await insertUpdateLog(db, {
      scheduleId: plan.scheduleId,
      memberUid: plan.memberUid,
      memberName: plan.memberName,
      scheduleDate: plan.scheduleDate,
      action: "auto_updated",
      title: plan.title,
      previousStatus: plan.previousStatus,
    });

    updated += 1;
    details.push(plan);
  }

  return { updated, details };
};
