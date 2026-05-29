import { describe, expect, it } from "vitest";
import type { ChzzkVideo } from "@/lib/types";
import { groupVodsByDate } from "./vod-date-groups";

const makeVod = (
  videoId: string,
  publishDate: string,
  readCount: number,
): ChzzkVideo =>
  ({
    videoNo: Number(videoId.replace(/\D/g, "")),
    videoId,
    videoTitle: videoId,
    publishDate,
    readCount,
  }) as ChzzkVideo;

describe("vod date groups", () => {
  it("다시보기를 일자별로 묶고 날짜 안에서는 최신순으로 정렬한다", () => {
    const groups = groupVodsByDate([
      makeVod("v1", "2026-05-28T23:00:00+09:00", 20),
      makeVod("v2", "2026-05-29T09:00:00+09:00", 10),
      makeVod("v3", "2026-05-29T18:00:00+09:00", 30),
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual([
      "2026-05-29",
      "2026-05-28",
    ]);
    expect(groups[0]?.vods.map((vod) => vod.videoId)).toEqual(["v3", "v2"]);
    expect(groups[0]?.videoCount).toBe(2);
    expect(groups[0]?.totalReadCount).toBe(40);
  });
});
