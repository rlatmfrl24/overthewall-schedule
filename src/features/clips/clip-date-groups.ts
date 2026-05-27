import type { ChzzkClip } from "@/lib/types";

export interface ClipDateGroup {
  dateKey: string;
  label: string;
  clips: ChzzkClip[];
  clipCount: number;
  totalReadCount: number;
}

const UNKNOWN_DATE_KEY = "unknown";
const dateLabelFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const toClipDate = (dateString: string) => {
  const date = new Date(dateString.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

const getClipTimestamp = (clip: ChzzkClip) =>
  toClipDate(clip.createdDate)?.getTime() ?? 0;

const getDateKeyFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getClipDateKey = (clip: ChzzkClip) => {
  const date = toClipDate(clip.createdDate);
  if (!date) return UNKNOWN_DATE_KEY;

  return getDateKeyFromDate(date);
};

export const formatClipDateLabel = (dateKey: string) => {
  if (dateKey === UNKNOWN_DATE_KEY) return "날짜 미상";

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "날짜 미상"
    : dateLabelFormatter.format(date);
};

export const compareClipsByViews = (a: ChzzkClip, b: ChzzkClip) => {
  const viewDiff = b.readCount - a.readCount;
  if (viewDiff !== 0) return viewDiff;

  const dateDiff = getClipTimestamp(b) - getClipTimestamp(a);
  if (dateDiff !== 0) return dateDiff;

  return a.clipUID.localeCompare(b.clipUID);
};

export const compareClipsByDateThenViews = (a: ChzzkClip, b: ChzzkClip) => {
  const aDateKey = getClipDateKey(a);
  const bDateKey = getClipDateKey(b);
  if (aDateKey === UNKNOWN_DATE_KEY && bDateKey === UNKNOWN_DATE_KEY) {
    return compareClipsByViews(a, b);
  }
  if (aDateKey === UNKNOWN_DATE_KEY) return 1;
  if (bDateKey === UNKNOWN_DATE_KEY) return -1;

  const dateDiff = bDateKey.localeCompare(aDateKey);
  if (dateDiff !== 0) return dateDiff;

  return compareClipsByViews(a, b);
};

export const groupClipsByDate = (clips: ChzzkClip[]): ClipDateGroup[] => {
  const grouped = new Map<string, ChzzkClip[]>();

  clips.forEach((clip) => {
    const dateKey = getClipDateKey(clip);
    const list = grouped.get(dateKey) || [];
    list.push(clip);
    grouped.set(dateKey, list);
  });

  return Array.from(grouped.entries())
    .map(([dateKey, groupedClips]) => {
      const sortedClips = [...groupedClips].sort(compareClipsByViews);

      return {
        dateKey,
        label: formatClipDateLabel(dateKey),
        clips: sortedClips,
        clipCount: sortedClips.length,
        totalReadCount: sortedClips.reduce(
          (total, clip) => total + clip.readCount,
          0,
        ),
      };
    })
    .sort((a, b) => {
      if (a.dateKey === UNKNOWN_DATE_KEY) return 1;
      if (b.dateKey === UNKNOWN_DATE_KEY) return -1;
      return b.dateKey.localeCompare(a.dateKey);
    });
};
