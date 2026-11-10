const historyDateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatHistoryDate(value: string | null) {
  if (!value) return "기록 없음";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const utcValue = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(utcValue);
  return Number.isFinite(date.getTime()) ? historyDateFormat.format(date) : value;
}
