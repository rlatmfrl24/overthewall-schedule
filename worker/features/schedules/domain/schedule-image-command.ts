import type { ApplyScheduleImageGroup, ScheduleImageChange } from "../../../../contracts/schedule-image-import";
import { isIsoDate, parseScheduleInput } from "./schedule-input";

export function parseScheduleImageGroup(value: unknown): ApplyScheduleImageGroup | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ApplyScheduleImageGroup;
  if (!Number.isSafeInteger(v.memberUid) || v.memberUid <= 0 || !isIsoDate(v.date) || typeof v.operationId !== "string" ||
    !/^\d{13}_[0-9a-f-]{36}$/.test(v.operationId) || typeof v.expected !== "string" || v.expected.length > 200_000 ||
    !Array.isArray(v.changes) || !v.changes.length || v.changes.length > 100 ||
    !Array.isArray(v.confirmedDeletedIds) || v.confirmedDeletedIds.length > 500 ||
    !v.confirmedDeletedIds.every(id => Number.isSafeInteger(id) && id > 0)) return null;
  const changes: ScheduleImageChange[] = [];
  for (const c of v.changes) {
    if (!c || typeof c.clientId !== "string" || c.clientId.length > 100 || !c.clientId ||
      (c.id !== null && (!Number.isSafeInteger(c.id) || c.id <= 0)) ||
      !["방송", "휴방", "게릴라"].includes(c.status) || (c.title !== null && (typeof c.title !== "string" || c.title.length > 500))) return null;
    const input = parseScheduleInput({ id: c.id, member_uid: v.memberUid, date: v.date, start_time: c.startTime, title: c.title, status: c.status }, { requireId: false });
    if (!input) return null;
    changes.push({ clientId: c.clientId, id: input.id, startTime: input.startTime, title: input.title, status: c.status });
  }
  if (new Set(changes.map(c => c.clientId)).size !== changes.length ||
    new Set(changes.filter(c => c.id !== null).map(c => c.id)).size !== changes.filter(c => c.id !== null).length ||
    (changes.length > 1 && changes.some(c => c.status !== "방송")) ||
    new Set(changes.map(c => JSON.stringify([c.status, c.startTime, c.title ?? ""]))).size !== changes.length) return null;
  return { operationId: v.operationId, memberUid: v.memberUid, date: v.date, expected: v.expected, changes, confirmedDeletedIds: [...new Set(v.confirmedDeletedIds)].sort((a,b) => a-b) };
}
