import type { ChzzkVideo } from "@/lib/types";

export interface VodDateGroup {
  dateKey: string;
  label: string;
  vods: ChzzkVideo[];
  videoCount: number;
  totalReadCount: number;
}

const UNKNOWN_DATE_KEY = "unknown";
const dateLabelFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const toVodDate = (dateString: string) => {
  const date = new Date(dateString.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

const getVodTimestamp = (vod: ChzzkVideo) =>
  toVodDate(vod.publishDate)?.getTime() ?? 0;

const getDateKeyFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getVodDateKey = (vod: ChzzkVideo) => {
  const date = toVodDate(vod.publishDate);
  if (!date) return UNKNOWN_DATE_KEY;

  return getDateKeyFromDate(date);
};

export const formatVodDateLabel = (dateKey: string) => {
  if (dateKey === UNKNOWN_DATE_KEY) return "날짜 미상";

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "날짜 미상"
    : dateLabelFormatter.format(date);
};

export const compareVodsByDate = (a: ChzzkVideo, b: ChzzkVideo) => {
  const dateDiff = getVodTimestamp(b) - getVodTimestamp(a);
  if (dateDiff !== 0) return dateDiff;

  const viewDiff = b.readCount - a.readCount;
  if (viewDiff !== 0) return viewDiff;

  return String(a.videoNo).localeCompare(String(b.videoNo));
};

export const groupVodsByDate = (vods: ChzzkVideo[]): VodDateGroup[] => {
  const grouped = new Map<string, ChzzkVideo[]>();

  vods.forEach((vod) => {
    const dateKey = getVodDateKey(vod);
    const list = grouped.get(dateKey) || [];
    list.push(vod);
    grouped.set(dateKey, list);
  });

  return Array.from(grouped.entries())
    .map(([dateKey, groupedVods]) => {
      const sortedVods = [...groupedVods].sort(compareVodsByDate);

      return {
        dateKey,
        label: formatVodDateLabel(dateKey),
        vods: sortedVods,
        videoCount: sortedVods.length,
        totalReadCount: sortedVods.reduce(
          (total, vod) => total + vod.readCount,
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
