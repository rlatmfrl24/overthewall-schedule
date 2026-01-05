import {
  addYears,
  differenceInCalendarDays,
  isValid,
  parseISO,
  setYear,
} from "date-fns";
import type { DDayItem } from "./types";

export interface DDayMatch {
  id: string;
  title: string;
  description?: string;
  color?: string;
  colors: string[];
  targetDate: string;
  daysUntil: number;
  isToday: boolean;
  type: DDayItem["type"];
  anniversaryLabel?: string;
}

export const normalizeDDayColors = (
  value?: string | string[] | null
): string[] => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(",");
  return raw
    .map((color) => color.trim())
    .filter((color) => color.length > 0);
};

const resolveOccurrence = (dday: DDayItem, referenceDate: Date) => {
  const baseDate = parseISO(dday.date);
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/2e596b27-7c29-45f4-8f96-6c9ebb37b20a", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "src/lib/dday.ts:33",
      message: "resolveOccurrence entry",
      timestamp: Date.now(),
      data: {
        id: dday.id,
        type: dday.type,
        date: dday.date,
        referenceDate: referenceDate.toISOString(),
      },
    }),
  }).catch(() => {});
  // #endregion
  if (!isValid(baseDate)) return null;

  const isAnnual = dday.type === "debut" || dday.type === "birthday";

  let occurrence = baseDate;

  if (isAnnual) {
    // 연간 반복: 현재 연도로 맞추고 이미 지났으면 다음 해로
    occurrence = setYear(baseDate, referenceDate.getFullYear());
    if (differenceInCalendarDays(occurrence, referenceDate) < 0) {
      occurrence = addYears(occurrence, 1);
    }
  } else if (occurrence.getFullYear() !== referenceDate.getFullYear()) {
    // 이벤트: 지정 연도 외에는 표시하지 않음
    return null;
  }

  const diff = differenceInCalendarDays(occurrence, referenceDate);
  // 당일에만 표시
  if (diff !== 0) return null;

  const yearsDiff = occurrence.getFullYear() - baseDate.getFullYear();
  const anniversaryLabel =
    dday.type === "debut" ? `${Math.max(1, yearsDiff)}주년` : undefined;

  return { occurrence, diff, isAnnual, anniversaryLabel };
};

export const getDDaysForDate = (
  ddays: DDayItem[],
  date: Date
): DDayMatch[] => {
  const mappedMatches: (DDayMatch | null)[] = ddays.map((dday) => {
    const resolved = resolveOccurrence(dday, date);
    if (!resolved) return null;

    const { occurrence, diff, isAnnual, anniversaryLabel } = resolved;
    const targetDate = occurrence.toISOString().split("T")[0];
    const colors = normalizeDDayColors(dday.colors ?? dday.color);
    const primaryColor = colors[0];

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/2e596b27-7c29-45f4-8f96-6c9ebb37b20a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H2",
        location: "src/lib/dday.ts:78",
        message: "mapped resolved D-Day",
        timestamp: Date.now(),
        data: {
          id: dday.id,
          isAnnual,
          diff,
          colors,
        },
      }),
    }).catch(() => {});
    // #endregion

    return {
      id: String(dday.id ?? `${dday.title}-${targetDate}`),
      title: dday.title,
      description: dday.description,
      color: primaryColor,
      colors,
      targetDate,
      daysUntil: diff,
      isToday: diff === 0,
      type: dday.type,
      anniversaryLabel,
    } satisfies DDayMatch;
  });

  const filteredMatches = mappedMatches.filter(
    (item): item is DDayMatch => Boolean(item)
  );

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/2e596b27-7c29-45f4-8f96-6c9ebb37b20a", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "src/lib/dday.ts:103",
      message: "filtered D-Day matches",
      timestamp: Date.now(),
      data: {
        mappedCount: mappedMatches.length,
        filteredCount: filteredMatches.length,
        nullCount: mappedMatches.length - filteredMatches.length,
      },
    }),
  }).catch(() => {});
  // #endregion

  return filteredMatches.sort((a, b) => a.daysUntil - b.daysUntil);
};

export const formatDDayLabel = (daysUntil: number) =>
  daysUntil === 0 ? "D-DAY" : `D-${daysUntil}`;

