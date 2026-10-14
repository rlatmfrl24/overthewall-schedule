import type {UpsertSchedulePayload} from "../../../../contracts/schedules";
import {parseNumericId} from "../../../../contracts/numeric-id";
import {isScheduleStatus,type ScheduleWriteInput} from "./schedule";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
};

const isNullableText = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

export const parseScheduleInput = (
  body: unknown,
  options: { requireId: boolean },
): ScheduleWriteInput | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const candidate = body as Partial<
    UpsertSchedulePayload & { id: number | string | null }
  >;
  const memberUid = parseNumericId(candidate.member_uid);
  const id =
    candidate.id === undefined || candidate.id === null
      ? null
      : parseNumericId(candidate.id);

  if (
    memberUid === null ||
    (options.requireId && id === null) ||
    (candidate.id !== undefined && candidate.id !== null && id === null) ||
    !isIsoDate(candidate.date) ||
    !isScheduleStatus(candidate.status) ||
    !isNullableText(candidate.start_time) ||
    !isNullableText(candidate.title) ||
    (typeof candidate.start_time === "string" &&
      !TIME_PATTERN.test(candidate.start_time))
  ) {
    return null;
  }

  return {
    id,
    memberUid,
    date: candidate.date,
    startTime: candidate.start_time ?? null,
    title: candidate.title ?? null,
    status: candidate.status,
  };
};
