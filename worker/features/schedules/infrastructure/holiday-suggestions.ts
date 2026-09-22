import type { ChzzkVideoCatalog } from "../../chzzk";
import { extractChzzkChannelId, getKSTDateString } from "../../../platform/http-helpers";

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
  fetchLive: ChzzkVideoCatalog["fetchLiveStatus"],
  now = Date.now(),
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
    await db.prepare(`INSERT INTO schedule_day_assessments
      (member_uid, date, channel_id, checked_at, range_start, range_end, scan_status, broadcast_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, MAX(?, EXISTS (
        SELECT 1 FROM schedule_broadcast_observations
        WHERE member_uid = ? AND started_at < ? AND ended_at > ?)))
      ON CONFLICT(member_uid, date) DO UPDATE SET channel_id = excluded.channel_id,
        checked_at = excluded.checked_at, scan_status = excluded.scan_status,
        broadcast_seen = MAX(schedule_day_assessments.broadcast_seen, excluded.broadcast_seen)
      WHERE excluded.checked_at >= schedule_day_assessments.checked_at`)
      .bind(member.uid, date, channelId, now, start, end, status, liveSeen ? 1 : 0, member.uid, end, start).run();
  }
};

export const reconcileHolidaySuggestions = async (
  db: D1Database,
  target?: { memberUid: number; date: string },
  now = Date.now(),
) => {
  const obsolete = `pending.candidate_kind = 'holiday_suggestion'
    AND NOT EXISTS (SELECT 1 FROM schedule_day_assessments assessment
      WHERE assessment.member_uid = pending.member_uid AND assessment.date = pending.date AND ${holidayEligibleSql})`;
  const removed = await db.batch([
    db.prepare(`INSERT INTO update_logs (member_uid, member_name, schedule_date, action, title, reason_code)
      SELECT pending.member_uid, pending.member_name, pending.date, 'candidate_obsolete', pending.title, 'holiday_evidence_changed'
      FROM pending_schedules pending WHERE ${obsolete}`),
    db.prepare(`DELETE FROM pending_schedules AS pending WHERE ${obsolete}`),
    db.prepare(`UPDATE schedule_day_assessments SET decision = 'none'
      WHERE decision = 'pending' AND NOT EXISTS (SELECT 1 FROM pending_schedules pending
        WHERE pending.member_uid = schedule_day_assessments.member_uid
          AND pending.date = schedule_day_assessments.date AND pending.candidate_kind = 'holiday_suggestion')`),
  ]);
  const date = holidayTargetDate(now);
  if (!date || (target && target.date !== date)) return { created: 0, withdrawn: removed[1].meta.changes, createdItems: [] };
  const cutoff = Date.parse(`${getKSTDateString(new Date(now))}T09:00:00+09:00`);
  const result = await db.batch([
    db.prepare(`INSERT INTO pending_schedules
      (member_uid, member_name, date, title, status, action_type, candidate_kind, match_reason, match_confidence, vod_segment_count)
      SELECT assessment.member_uid, member.name, assessment.date, '휴방 추정', '휴방', 'create',
        'holiday_suggestion', 'no_broadcast_observed', 'low', 0
      FROM schedule_day_assessments assessment JOIN members member ON member.uid = assessment.member_uid
      WHERE assessment.date = ? AND assessment.checked_at >= ? AND ${holidayEligibleSql}
        ${target ? "AND assessment.member_uid = ?" : ""}
        AND NOT EXISTS (SELECT 1 FROM pending_schedules pending
          WHERE pending.member_uid = assessment.member_uid AND pending.date = assessment.date)
      ON CONFLICT DO NOTHING RETURNING member_uid, member_name, date`)
      .bind(date, cutoff, ...(target ? [target.memberUid] : [])),
    db.prepare(`INSERT INTO update_logs (member_uid, member_name, schedule_date, action, title, reason_code)
      SELECT pending.member_uid, pending.member_name, pending.date, 'auto_collected', pending.title, 'no_broadcast_observed'
      FROM pending_schedules pending JOIN schedule_day_assessments assessment
        ON assessment.member_uid = pending.member_uid AND assessment.date = pending.date
      WHERE pending.candidate_kind = 'holiday_suggestion' AND assessment.decision = 'none'`),
    db.prepare(`UPDATE schedule_day_assessments SET decision = 'pending'
      WHERE decision = 'none' AND EXISTS (SELECT 1 FROM pending_schedules pending
        WHERE pending.member_uid = schedule_day_assessments.member_uid AND pending.date = schedule_day_assessments.date
          AND pending.candidate_kind = 'holiday_suggestion')`),
  ]);
  return { created: result[0].meta.changes, withdrawn: removed[1].meta.changes,
    createdItems: result[0].results as { member_uid: number; member_name: string; date: string }[] };
};
