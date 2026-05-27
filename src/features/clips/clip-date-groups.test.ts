import { describe, expect, it } from "vitest";
import type { ChzzkClip } from "@/lib/types";
import {
  compareClipsByDateThenViews,
  formatClipDateLabel,
  getClipDateKey,
  groupClipsByDate,
} from "./clip-date-groups";

const makeClip = (
  clipUID: string,
  createdDate: string,
  readCount: number,
): ChzzkClip => ({
  clipUID,
  videoId: `video-${clipUID}`,
  clipTitle: `클립 ${clipUID}`,
  ownerChannelId: "channel",
  thumbnailImageUrl: null,
  categoryType: "GAME",
  clipCategory: "category",
  duration: 30,
  adult: false,
  createdDate,
  readCount,
  blindType: null,
});

describe("clip date groups", () => {
  it("일자별로 묶고 날짜 안에서는 조회수순으로 정렬한다", () => {
    const groups = groupClipsByDate([
      makeClip("older-low", "2026-02-13 10:00:00", 10),
      makeClip("older-high", "2026-02-13 11:00:00", 50),
      makeClip("newer-low", "2026-02-14 09:00:00", 1),
      makeClip("older-high-later", "2026-02-13 12:00:00", 50),
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual([
      "2026-02-14",
      "2026-02-13",
    ]);
    expect(groups[1]?.clips.map((clip) => clip.clipUID)).toEqual([
      "older-high-later",
      "older-high",
      "older-low",
    ]);
    expect(groups[1]?.clipCount).toBe(3);
    expect(groups[1]?.totalReadCount).toBe(110);
  });

  it("멤버별 보기에서도 날짜 우선, 같은 날짜는 조회수 우선으로 정렬한다", () => {
    const clips = [
      makeClip("unknown", "not-a-date", 999),
      makeClip("older-high", "2026-02-13 10:00:00", 100),
      makeClip("newer-low", "2026-02-14 10:00:00", 1),
      makeClip("older-low", "2026-02-13 11:00:00", 10),
    ].sort(compareClipsByDateThenViews);

    expect(clips.map((clip) => clip.clipUID)).toEqual([
      "newer-low",
      "older-high",
      "older-low",
      "unknown",
    ]);
  });

  it("파싱할 수 없는 날짜는 별도 그룹으로 둔다", () => {
    expect(getClipDateKey(makeClip("unknown", "not-a-date", 1))).toBe(
      "unknown",
    );
  });

  it("날짜 제목은 요일 없이 표시한다", () => {
    expect(formatClipDateLabel("2026-02-14")).toBe("2026년 2월 14일");
  });
});
