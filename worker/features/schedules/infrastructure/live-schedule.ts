import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { type DbInstance } from "../../../platform/db";
import { members, schedules, settings } from "@db/schema";
import { LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY } from "@contracts/configuration";
import type { CachedLiveStatus } from "../../../platform/types";
import {
  extractChzzkChannelId,
  extractKSTTime,
  getKSTDateString,
} from "../../../platform/http-helpers";
import { ContentWriteError } from "../../content-access";
import type { LiveScheduleAutoFillFeedback } from "@contracts/chzzk";
import type { LiveScheduleCommand, LiveScheduleFillPlan } from "../domain/live-schedule-command";
import type { D1LiveScheduleWriter } from "./publication-writers";
import type { SiteId } from "@contracts/site-definition";
import { isScheduleMemberActive } from "@contracts/schedule-member-policy";
export type { LiveScheduleFillPlan } from "../domain/live-schedule-command";

type LiveStatusContent = NonNullable<CachedLiveStatus["content"]>;

export type LiveStatusItem = {
  channelId: string;
  content: CachedLiveStatus["content"] | null;
};

type LiveScheduleMember = {
  uid: number;
  code?: string;
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
  content.liveTitle?.trim() || "";

const resolveScheduleOpenedAt = (content: LiveStatusContent, siteId: SiteId, code?: string, now = new Date()) => {
  const actual = resolveLiveOpenedAt(content, now);
  const rounded = roundToNearestHalfHour(actual);
  // Keep the last broadcast on its actual day when rounding crosses the policy boundary.
  return !isScheduleMemberActive(siteId, code, getKSTDateString(rounded)) &&
    isScheduleMemberActive(siteId, code, getKSTDateString(actual)) ? actual : rounded;
};

const needsLiveScheduleFill = (schedule: LiveScheduleRow) =>
  schedule.status === "미정" ||
  (schedule.status === "방송" && (!schedule.start_time?.trim() || !schedule.title?.trim()));

export const buildLiveScheduleFillPlans = ({
  members: memberRows,
  schedules: scheduleRows,
  liveItems,
  siteId = "otw",
  now = new Date(),
}: {
  members: LiveScheduleMember[];
  schedules: LiveScheduleRow[];
  liveItems: LiveStatusItem[];
  siteId?: SiteId;
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

    const openedAt = resolveScheduleOpenedAt(live, siteId, member.code, now);
    const scheduleDate = getKSTDateString(openedAt);
    if (!isScheduleMemberActive(siteId, member.code, scheduleDate)) continue;
    const memberSchedulesForDate = scheduleRows.filter(
      (schedule) =>
        schedule.member_uid === member.uid && schedule.date === scheduleDate,
    );
    const candidates = memberSchedulesForDate.filter(needsLiveScheduleFill);
    // Multiple incomplete broadcasts cannot be matched to a single live session safely.
    if (candidates.length > 1) continue;
    const targetSchedule = candidates[0];

    const basePlan = {
      memberUid: member.uid,
      memberName: member.name,
      scheduleDate,
      startTime: extractKSTTime(openedAt.toISOString()),
      title: resolveLiveTitle(live),
    };

    if (targetSchedule) {
      const startTime = targetSchedule.start_time?.trim() ? targetSchedule.start_time : basePlan.startTime;
      const title = targetSchedule.title?.trim() ? targetSchedule.title : basePlan.title || targetSchedule.title || "";
      if (targetSchedule.status === "방송" && startTime === targetSchedule.start_time && title === (targetSchedule.title ?? "")) continue;
      plans.push({
        ...basePlan,
        action: "update",
        scheduleId: targetSchedule.id,
        previousStatus: targetSchedule.status,
        previousStartTime: targetSchedule.start_time ?? null,
        previousTitle: targetSchedule.title ?? null,
        startTime,
        title,
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
  transitionWriter?: D1LiveScheduleWriter,
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
      code: members.code,
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
      const member = targetMembers.find(member => normalizeChannelId(extractChzzkChannelId(member.url_chzzk) ?? "") === normalizeChannelId(item.channelId));
      liveDates.add(
        getKSTDateString(resolveScheduleOpenedAt(item.content, transitionWriter?.siteId ?? "otw", member?.code)),
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
      created_at: schedules.created_at,
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
    siteId: transitionWriter?.siteId ?? "otw",
  });
  let updated = 0;
  const details: LiveScheduleFillPlan[] = [];
  const feedback: LiveScheduleAutoFillFeedback[] = [];

  for (const plan of plans) {
    try {
      if (!await applyLiveScheduleFillPlan(db, {
        plan,
        expectedRows: scheduleRows.filter(row => row.member_uid === plan.memberUid && row.date === plan.scheduleDate),
      }, transitionWriter)) continue;
      updated += 1;
      details.push(plan);
    } catch (error) {
      if (!(error instanceof ContentWriteError)) throw error;
      feedback.push({ memberUid: plan.memberUid, code: error.code, message: error.message, operationId: error.operationId, targetSite: error.targetSite });
    }
  }

  return { updated, details, ...(feedback.length ? { feedback } : {}) };
};

/** The owning executor reuses the exact admitted plan, not a new provider snapshot. */
export async function applyLiveScheduleFillPlan(db: DbInstance, command: LiveScheduleCommand, transitionWriter?: D1LiveScheduleWriter) {
  const { plan } = command, d1 = db.$client;
  const mutation = plan.action === "create"
    ? d1.prepare(`INSERT INTO schedules(member_uid,date,start_time,title,status)
        SELECT ?,?,?,?,'방송' WHERE NOT EXISTS(SELECT 1 FROM schedules WHERE member_uid=? AND date=?) RETURNING id`)
      .bind(plan.memberUid,plan.scheduleDate,plan.startTime,plan.title,plan.memberUid,plan.scheduleDate)
    : d1.prepare(`UPDATE schedules SET status='방송',start_time=?,title=? WHERE id=? AND member_uid=? AND date=? AND status=? AND start_time IS ? AND title IS ? RETURNING id`)
      .bind(plan.startTime,plan.title,plan.scheduleId,plan.memberUid,plan.scheduleDate,plan.previousStatus,plan.previousStartTime,plan.previousTitle);
  // Keep changes()/last_insert_rowid() adjacent. These original schedule_auto_*
  // actions have null actors, including when triggered by an administrator.
  const audit = d1.prepare(`INSERT INTO update_logs(schedule_id,member_uid,member_name,schedule_date,action,title,previous_status)
    SELECT ${plan.action === "create" ? "last_insert_rowid()" : "?"},?,?,?,?,?,? WHERE changes()=1`)
    .bind(...(plan.action === "create" ? [] : [plan.scheduleId]),plan.memberUid,plan.memberName,plan.scheduleDate,plan.action === "create" ? "schedule_auto_created" : "schedule_auto_updated",plan.title,plan.previousStatus);
  const statements = [mutation,audit];
  const results = await transitionWriter?.write(command,statements) ?? await d1.batch(statements);
  return results[0].results.length === 1;
}
