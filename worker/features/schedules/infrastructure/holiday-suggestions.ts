import type {ChzzkScanProvider} from "./chzzk-scan-types";
import { editableCollectorSql } from "../../content-access";
import type {CollectorCommand} from "../domain/collector-command";
import type {CollectorWriter,CollectorBatchResult} from "./collector-writer";
import { extractChzzkChannelId, getKSTDateString } from "../../../platform/http-helpers";
import { automaticScheduleAllowedSql } from "./automatic-schedule-policy";

export type ScanCoverage = "complete" | "failed" | "incomplete";
export const holidayTargetDate = (now = Date.now()) => {
  const shifted = new Date(now + 9 * 60 * 60_000);
  return shifted.getUTCHours() >= 9 ? getKSTDateString(new Date(now - 86_400_000)) : null;
};
export const dayBounds = (date: string) => {
  const start = Date.parse(`${date}T00:00:00+09:00`);
  return { start, end: start + 86_400_000 };
};

// Reused by generation and approval: absence is a hypothesis, never a direct write to schedules.
export const holidayEligibleSql = `assessment.scan_status = 'complete'
  AND length(assessment.channel_id) = 32 AND assessment.channel_id NOT GLOB '*[^a-f0-9]*'
  AND assessment.broadcast_seen = 0 AND assessment.decision NOT IN ('approved', 'rejected')
  AND EXISTS (SELECT 1 FROM members member WHERE member.uid = assessment.member_uid
    AND COALESCE(member.is_deprecated, 0) != 1
    AND instr(lower(member.url_chzzk), 'chzzk.naver.com/' || assessment.channel_id) > 0)
  AND NOT EXISTS (SELECT 1 FROM schedules schedule
    WHERE schedule.member_uid = assessment.member_uid AND schedule.date = assessment.date)
  AND NOT EXISTS (SELECT 1 FROM schedule_broadcast_observations observation
    WHERE observation.member_uid = assessment.member_uid
      AND observation.started_at < assessment.range_end AND observation.ended_at > assessment.range_start)`;

export const recordHolidayAssessments = async (
  db: D1Database,
  members: { uid: number; url_chzzk: string | null }[],
  coverage: Map<string, ScanCoverage>,
  fetchLive: ChzzkScanProvider["fetchLiveStatus"],
  now = Date.now(),
  statements?: D1PreparedStatement[],
) => {
  const date = holidayTargetDate(now);
  if (!date) return;
  const { start, end } = dayBounds(date);
  for (const member of members) {
    const channelId = extractChzzkChannelId(member.url_chzzk)?.toLowerCase();
    if (!channelId || !/^[a-f0-9]{32}$/.test(channelId) || !coverage.has(channelId)) continue;
    let status = coverage.get(channelId)!;
    let liveSeen = false;
    if (fetchLive) {
      try {
        const live = await fetchLive(channelId);
        const content = live.content;
        if (live.debug.error || live.debug.staleCacheUsed || !content || !["OPEN", "CLOSE", "CLOSED"].includes(content.status)) {
          status = "failed";
        } else if (content.status === "OPEN") {
          const raw = content.openDate?.trim();
          const opened = raw ? Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(" ", "T")}+09:00`) : NaN;
          if (!Number.isFinite(opened) || opened > now) status = "incomplete";
          else liveSeen = opened < end && now > start;
        }
      } catch { status = "failed"; }
    } else status = "failed";
    coverage.set(channelId, status);
    const statement = db.prepare(`INSERT INTO schedule_day_assessments
      (member_uid, date, channel_id, checked_at, range_start, range_end, scan_status, broadcast_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, MAX(?, EXISTS (
        SELECT 1 FROM schedule_broadcast_observations
        WHERE member_uid = ? AND started_at < ? AND ended_at > ?)))
      ON CONFLICT(member_uid, date) DO UPDATE SET channel_id = excluded.channel_id,
        checked_at = excluded.checked_at, scan_status = excluded.scan_status,
        broadcast_seen = MAX(schedule_day_assessments.broadcast_seen, excluded.broadcast_seen)
      WHERE excluded.checked_at >= schedule_day_assessments.checked_at`)
      .bind(member.uid, date, channelId, now, start, end, status, liveSeen ? 1 : 0, member.uid, end, start);
    if (statements) statements.push(statement); else await statement.run();
  }
};

export const reconcileHolidaySuggestions = async (
  db: D1Database,
  target?: { memberUid: number; date: string },
  now = Date.now(),
  transitionWriter?:CollectorWriter,
) => {
  const removed=await executeHolidayCollectorCommand(db,{action:"holiday_obsolete",now,target:target??null},transitionWriter);
  const date = holidayTargetDate(now);
  const withdrawn=removed[1].affectedCount??removed[1].results.length;
  if (!date || (target && target.date !== date)) return { created: 0, withdrawn, createdItems: [] };
  const result=await executeHolidayCollectorCommand(db,{action:"holiday_create",now,target:target??null},transitionWriter);
  return { created: result[0].results.length, withdrawn,
    createdItems: result[0].results as { member_uid: number; member_name: string; date: string }[] };
};

export const executeHolidayCollectorCommand=async(db:D1Database,command:Extract<CollectorCommand,{action:"holiday_obsolete"|"holiday_create"}>,transitionWriter?:CollectorWriter):Promise<CollectorBatchResult[]>=>{
  const {now}=command,target=command.target??undefined;
  const editable=(table:Parameters<typeof editableCollectorSql>[0],alias:string)=>` AND ${automaticScheduleAllowedSql(transitionWriter?.siteId ?? "otw", `${alias}.member_uid`, `${alias}.date`)}` + (transitionWriter?` AND ${editableCollectorSql(table,alias,transitionWriter.siteId??"otw")}${transitionWriter.memberScope?` AND ${alias}.member_uid IN (${transitionWriter.memberScope.map(uid=>{if(!Number.isSafeInteger(uid)||uid<1) throw new Error("Invalid original owner member scope");return uid;}).join(",")||"NULL"})`:""}`:"");
  const obsolete = `pending.candidate_kind = 'holiday_suggestion'
    ${editable("pending_schedules","pending")}
    AND NOT EXISTS (SELECT 1 FROM schedule_day_assessments assessment
      WHERE assessment.member_uid = pending.member_uid AND assessment.date = pending.date AND ${holidayEligibleSql})`;
  const removal = [
    db.prepare(`INSERT INTO update_logs (member_uid, member_name, schedule_date, action, title, reason_code)
      SELECT pending.member_uid, pending.member_name, pending.date, 'candidate_obsolete', pending.title, 'holiday_evidence_changed'
      FROM pending_schedules pending WHERE ${obsolete}`),
    db.prepare(`DELETE FROM pending_schedules AS pending WHERE ${obsolete} RETURNING id`),
    db.prepare(`UPDATE schedule_day_assessments SET decision = 'none'
      WHERE decision = 'pending' ${editable("schedule_day_assessments","schedule_day_assessments")} AND NOT EXISTS (SELECT 1 FROM pending_schedules pending
        WHERE pending.member_uid = schedule_day_assessments.member_uid
          AND pending.date = schedule_day_assessments.date AND pending.candidate_kind = 'holiday_suggestion' ${editable("pending_schedules","pending")})`),
  ];
  if(command.action==="holiday_obsolete") return await transitionWriter?.write(command,removal)??await db.batch(removal);
  const date = holidayTargetDate(now);
  if(!date || target && target.date!==date) throw new Error("Invalid original holiday creation window");
  const cutoff = Date.parse(`${getKSTDateString(new Date(now))}T09:00:00+09:00`);
  const creation = [
    db.prepare(`INSERT INTO pending_schedules
      (member_uid, member_name, date, title, status, action_type, candidate_kind, match_reason, match_confidence, vod_segment_count)
      SELECT assessment.member_uid, member.name, assessment.date, '휴방 추정', '휴방', 'create',
        'holiday_suggestion', 'no_broadcast_observed', 'low', 0
      FROM schedule_day_assessments assessment JOIN members member ON member.uid = assessment.member_uid
      WHERE assessment.date = ? AND assessment.checked_at >= ? AND ${holidayEligibleSql}
        ${editable("schedule_day_assessments","assessment")}
        ${target ? "AND assessment.member_uid = ?" : ""}
        AND NOT EXISTS (SELECT 1 FROM pending_schedules pending
          WHERE pending.member_uid = assessment.member_uid AND pending.date = assessment.date)
      ON CONFLICT DO NOTHING RETURNING member_uid, member_name, date`)
      .bind(date, cutoff, ...(target ? [target.memberUid] : [])),
    db.prepare(`INSERT INTO update_logs (member_uid, member_name, schedule_date, action, title, reason_code)
      SELECT pending.member_uid, pending.member_name, pending.date, 'auto_collected', pending.title, 'no_broadcast_observed'
      FROM pending_schedules pending JOIN schedule_day_assessments assessment
        ON assessment.member_uid = pending.member_uid AND assessment.date = pending.date
      WHERE pending.candidate_kind = 'holiday_suggestion' AND assessment.decision = 'none' ${editable("pending_schedules","pending")} ${editable("schedule_day_assessments","assessment")}`),
    db.prepare(`UPDATE schedule_day_assessments SET decision = 'pending'
      WHERE decision = 'none' ${editable("schedule_day_assessments","schedule_day_assessments")} AND EXISTS (SELECT 1 FROM pending_schedules pending
        WHERE pending.member_uid = schedule_day_assessments.member_uid AND pending.date = schedule_day_assessments.date
          AND pending.candidate_kind = 'holiday_suggestion' ${editable("pending_schedules","pending")})`),
  ];
  return await transitionWriter?.write(command,creation)??await db.batch(creation);
};
