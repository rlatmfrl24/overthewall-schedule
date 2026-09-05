import { addYears, differenceInCalendarDays, format, isValid, parseISO, setYear } from "date-fns";
import type { DDayItem } from "./types";

export function getAdminDDayOccurrence(item: DDayItem, now = new Date()) {
  const base = parseISO(item.date);
  if (!isValid(base)) return { label: "날짜 확인 필요", nextLabel: "미확인", sort: Infinity };
  const annual = item.type === "birthday" || item.type === "debut";
  let next = annual ? setYear(base, now.getFullYear()) : base;
  if (annual && differenceInCalendarDays(next, now) < 0) next = addYears(next, 1);
  const days = differenceInCalendarDays(next, now);
  const anniversary = item.type === "debut" ? ` · ${Math.max(1, next.getFullYear() - base.getFullYear())}주년` : "";
  return {
    label: item.type === "birthday" ? `매년 ${format(base, "M월 d일")}` : format(base, "yyyy.MM.dd"),
    nextLabel: `${format(next, "yyyy.MM.dd")} · ${days < 0 ? "종료" : days === 0 ? "오늘" : `D-${days}`}${anniversary}`,
    sort: days < 0 ? Infinity : next.getTime(),
  };
}
