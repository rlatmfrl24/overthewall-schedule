import { describe, expect, it } from "vitest";
import type { Member } from "@/lib/types";
import type { MultiviewSource } from "./types";
import { sortMultiviewSources } from "./use-multiview-sources";

const makeSource = (
  name: string,
  unitName: string | null,
  isLive = false,
): MultiviewSource => ({
  channelId: name.padEnd(32, "0").slice(0, 32),
  isLive,
  liveStatus: isLive
    ? ({
        status: "OPEN",
        liveTitle: `${name} live`,
        channelName: name,
      } as MultiviewSource["liveStatus"])
    : null,
  member: {
    uid: name.length,
    code: name,
    name,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: unitName,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  } as Member,
});

describe("sortMultiviewSources", () => {
  it("places live sources first, then Stardays, Luvdia, and Hiblueming members", () => {
    const sorted = sortMultiviewSources([
      makeSource("하이블루밍 오프라인", "HiBlueming"),
      makeSource("러브다이아 라이브", "LUV DIA", true),
      makeSource("기타 오프라인", "OTW"),
      makeSource("러브다이아 오프라인", "러브다이아"),
      makeSource("스타데이즈 오프라인", "스타데이즈"),
      makeSource("하이블루밍 라이브", "하이블루밍", true),
    ]);

    expect(sorted.map((source) => source.member?.name)).toEqual([
      "러브다이아 라이브",
      "하이블루밍 라이브",
      "스타데이즈 오프라인",
      "러브다이아 오프라인",
      "하이블루밍 오프라인",
      "기타 오프라인",
    ]);
  });
});
