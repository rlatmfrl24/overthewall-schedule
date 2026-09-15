import { describe, expect, it } from "vitest";
import {
  parseAiReviewResult,
  resolveAiReviewCatalog,
} from "./ai-review-result";
import type { OtwPlayAdminCatalogDto } from "@contracts/otw-play";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";
import { normalizeOtwPlaySongTags } from "@contracts/otw-play-tags";
import { aiSongTitleKeys, aiSongTitlesMatch, aiVideoTimecodeSeconds, formatAiSongTitle } from "./ai-review-normalization";
const input = {
  video: {
    title: "Song cover",
    description: "Original: Artist. 방송 2026-09-01",
    durationSeconds: 300,
  },
  range: { startSeconds: 100, endSeconds: 200 },
};
const evidence = { source: "video", text: "노래 가창", seconds: 120 };
describe("AI grounded suggestions", () => {
  it.each([
    ["うたたね", ["선잠", "Utatane"], "선잠 (うたたね)"],
    ["선잠 (うたたね, Utatane)", [], "선잠 (うたたね)"],
    ["変わらないもの (변하지 않는 것)", [], "변하지 않는 것 (変わらないもの)"],
    ["밤편지", ["Through the Night"], "밤편지 (Through the Night)"],
    ["선잠 (うたたね)", ["선잠"], "선잠 (うたたね)"],
    ["KICK BACK", [], "KICK BACK"],
    ["밤편지", [], "밤편지"],
    ["Song (Live)", ["노래"], "Song (Live)"],
    ["노래 (부제)", ["Song"], "노래 (부제)"],
  ])("uses Korean-first display without inventing titles: %s", (title, alternates, expected) => {
    expect(formatAiSongTitle(title, alternates)).toBe(expected);
  });
  it("uses source-grounded artist spellings and alternate titles for the catalog lookup", () => {
    const excerpt = "오쿠 하나코 - 변하지 않는 것 (変わらないもの)";
    const parsed = parseAiReviewResult({ videoAnalyzed: true, warnings: [], songs: [{ values: {
      song: { title: "変わらないもの", alternateTitles: ["변하지 않는 것", "Invented title"], originalArtists: [{ name: "奥華子", sourceNames: ["오쿠 하나코", "Forged artist"], entityKind: "person" }], tags: [] },
    }, evidence: { song: [{ source: "description", text: excerpt, timecode: null }] } }] }, { ...input, video: { ...input.video, description: excerpt } });
    expect(parsed.songs[0].values.song?.originalArtists[0].sourceNames).toEqual(["오쿠 하나코"]);
    expect(parsed.songs[0].values.song?.alternateTitles).toEqual(["변하지 않는 것"]);
    expect(parsed.songs[0].values.song?.title).toBe("변하지 않는 것 (変わらないもの)");
    const catalog = { entities: [{ id: "artist", displayName: "오쿠 하나코", entityKind: "person", archivedAt: null }], songs: [{ id: "existing", title: "변하지 않는 것", archivedAt: null, tags: ["J-POP"], aliases: [], originalArtists: [{ entityId: "artist", displayName: "오쿠 하나코" }] }] } as unknown as OtwPlayAdminCatalogDto;
    expect(resolveAiReviewCatalog(parsed, catalog).songs[0].values.song).toMatchObject({ existingSongId: "existing", title: "변하지 않는 것", tags: ["J-POP"] });
  });
  it("matches catalog spellings and multilingual titles without stripping version qualifiers", () => {
    expect(aiSongTitlesMatch(aiSongTitleKeys("KICK BACK"), aiSongTitleKeys("KICKBACK"))).toBe(true);
    expect(aiSongTitlesMatch(aiSongTitleKeys("うたたね"), aiSongTitleKeys("선잠 (うたたね)"))).toBe(true);
    expect(aiSongTitlesMatch(aiSongTitleKeys("BAD HABIT"), aiSongTitleKeys("QWER - BAD HABIT", ["QWER"]))).toBe(true);
    expect(aiSongTitlesMatch(aiSongTitleKeys("Song"), aiSongTitleKeys("Song (Live)"))).toBe(false);
    expect(aiSongTitlesMatch(aiSongTitleKeys("Song"), aiSongTitleKeys("Song Part 2"))).toBe(false);
  });
  it("converts explicit timecodes and preserves complete/partial performance evidence", () => {
    const parsed = parseAiReviewResult({ videoAnalyzed: true, warnings: [], songs: ["full", "partial"].map((value) => ({
      values: {
        segment: { startTime: "00:04", endTime: "02:34", observation: "가창 시작과 마지막 가사 종료" },
        extent: { value, observation: value === "full" ? "도입부와 마지막 후렴 모두 가창" : "후렴만 가창", timecode: "02:30" },
      }, evidence: {}, warnings: [],
    })) }, { range: null, video: { ...input.video, durationSeconds: 156 } });
    expect(parsed.songs.map((s) => s.values.segment)).toEqual([{ startSeconds: 4, endSeconds: 154 }, { startSeconds: 4, endSeconds: 154 }]);
    expect(parsed.songs.map((s) => s.values.extent)).toEqual(["full", "partial"]);
    expect(parsed.songs[0].evidence.extent?.[0].seconds).toBe(150);
    expect(aiVideoTimecodeSeconds("01:02:34")).toBe(3754);
    expect(aiVideoTimecodeSeconds("02:99")).toBeNull();
    expect(aiVideoTimecodeSeconds(234)).toBeNull();
  });
  it("does not reinterpret invalid seconds, relative clipped times or missing video evidence as valid", () => {
    const parsed = parseAiReviewResult({ videoAnalyzed: true, warnings: [], songs: [{
      values: {
        segment: { startTime: "00:04", endTime: "02:34", observation: "가창" },
        extent: { value: "full", observation: "완곡", timecode: "02:99" },
      }, evidence: {}, warnings: [],
    }] }, input);
    expect(parsed.songs[0].values.segment).toBeUndefined();
    expect(parsed.songs[0].values.extent).toBeUndefined();
  });
  it("canonicalizes preferred genres without forcing an unrelated genre", () => {
    expect(normalizeOtwPlaySongTags(["JPOP", "J-pop", "Ｋ－ＰＯＰ", "Vocaloid", "ボーカロイド", "Jazz"])).toEqual(["J-POP", "K-POP", "보컬로이드", "Jazz"]);
  });
  it("uses members before external entities, keeps collisions unresolved and deduplicates aliases", () => {
    const raw: AiReviewResult = { videoAnalyzed: true, warnings: [], songs: [{
      values: { participants: ["Singer", "가창자", "동명", "Guest"].map((name) => ({ name, entityKind: "person", subject: null, role: "vocal" })) }, evidence: {}, warnings: [],
    }] };
    const catalog = { entities: [{ id: "external", displayName: "Singer", entityKind: "person", memberUid: null, archivedAt: null }], songs: [] } as unknown as OtwPlayAdminCatalogDto;
    const members = [
      { uid: 7, name: "가창자", aliases: ["Singer"], youtubeChannelIds: [], youtubeVodChannelIds: [] },
      ...[8, 9].map((uid) => ({ uid, name: "동명", aliases: [], youtubeChannelIds: [], youtubeVodChannelIds: [] })),
    ];
    const result = resolveAiReviewCatalog(raw, { ...catalog, members });
    expect(result.songs[0].values.participants).toMatchObject([
      { name: "가창자", subject: { kind: "member", memberUid: 7 } },
      { name: "동명", subject: null },
      { name: "Guest", subject: { kind: "new_external" } },
    ]);
    expect(raw.songs[0].values.participants).toHaveLength(4);
  });
  it.each([
    ["https://youtu.be/AAAAAAAAAAA", "원본 방송: https://youtu.be/AAAAAAAAAAA", true],
    ["https://youtu.be/BBBBBBBBBBB", "원본 방송: https://youtu.be/BBBBBBBBBBB", false],
    ["https://evil.test/video", "원본 방송: https://evil.test/video", false],
    ["https://youtu.be/AAAAAAAAAAA", "방송 날짜만 확인", false],
  ])("requires an actual source URL in its evidence: %s", (url, excerpt, accepted) => {
    const result = parseAiReviewResult({ videoAnalyzed: true, warnings: [], songs: [{ values: { originalUrl: url }, evidence: { originalUrl: [{ source: "description", text: excerpt, seconds: null }] } }] }, {
      ...input, video: { ...input.video, videoId: "BBBBBBBBBBB", description: excerpt },
    });
    expect(result.songs[0].values.originalUrl).toBe(accepted ? url : undefined);
  });
  it("accepts an explicit broadcast date in the title but not upload metadata", () => {
    const title = "여행 · 온하루 [2026-08-14 방송]";
    const values = { broadcastDate: { performedOn: "2026-08-14", dateEvidence: "2026-08-14 방송" } };
    const parse = (source: string, excerpt: string) => parseAiReviewResult({
      videoAnalyzed: true, warnings: [], songs: [{ values, evidence: { broadcastDate: [{ source, text: excerpt, seconds: null }] } }],
    }, { ...input, video: { ...input.video, title } }).songs[0].values.broadcastDate;
    expect(parse("title", "2026-08-14 방송")).toEqual(values.broadcastDate);
    expect(parse("title", "없는 방송일 근거")).toBeUndefined();
    expect(parse("metadata", "2026-08-14")).toBeUndefined();
  });
  it("removes forged references, out-of-range timestamps, unknown evidence and invalid dates", () => {
    const parsed = parseAiReviewResult(
      {
        videoAnalyzed: true,
        warnings: [],
        songs: [
          {
            warnings: [],
            values: {
              song: {
                title: "Song",
                originalArtists: [
                  {
                    name: "Artist",
                    entityKind: "person",
                    subject: { kind: "entity", entityId: "forged" },
                  },
                ],
                tags: [],
                existingSongId: "forged",
              },
              segment: { startSeconds: 0, endSeconds: 150 },
              broadcastDate: {
                performedOn: "2026-02-31",
                dateEvidence: "fake",
              },
            },
            evidence: {
              song: [
                {
                  source: "description",
                  text: "Original: Artist",
                  seconds: null,
                },
              ],
              segment: [evidence],
              broadcastDate: [evidence],
            },
          },
        ],
      },
      input,
    );
    expect(parsed.songs[0].values.song).toMatchObject({
      existingSongId: null,
      originalArtists: [{ subject: null }],
    });
    expect(parsed.songs[0].values.segment).toBeUndefined();
    expect(parsed.songs[0].values.broadcastDate).toBeUndefined();
  });
  it("keeps uncertainty distinct from incomplete video analysis", () => {
    const raw = {
      videoAnalyzed: false,
      warnings: ["영상 접근 불가"],
      songs: [
        {
          values: {
            segment: { startSeconds: 110, endSeconds: 190 },
            extent: "full",
            song: {
              title: "Song",
              originalArtists: [{ name: "Artist", entityKind: "person" }],
              tags: [],
            },
          },
          evidence: {
            segment: [evidence],
            extent: [evidence],
            song: [
              {
                source: "description",
                text: "Original: Artist",
                seconds: null,
              },
            ],
          },
          warnings: [],
        },
      ],
    };
    const result = parseAiReviewResult(raw, input);
    expect(result.videoAnalyzed).toBe(false);
    expect(Object.keys(result.songs[0].values)).toEqual(["song"]);
  });
  it("resolves identity aliases, distinguishes same-title songs and never trusts incoming IDs", () => {
    const result = parseAiReviewResult(
      {
        videoAnalyzed: true,
        warnings: [],
        songs: [
          {
            values: {
              song: {
                title: "Song",
                originalArtists: [{ name: "Artist", entityKind: "person" }],
                tags: [],
              },
            },
            evidence: {
              song: [
                {
                  source: "description",
                  text: "Original: Artist",
                  seconds: null,
                },
              ],
            },
          },
        ],
      },
      input,
    );
    const catalog = {
      entities: [{ id: "artist", displayName: "아티스트", entityKind: "person", archivedAt: null }],
      songs: [
        {
          id: "song1",
          tags: ["J-POP"],
          title: "Song",
          aliases: [],
          originalArtists: [{ entityId: "artist", displayName: "아티스트" }],
          archivedAt: null,
        },
        {
          id: "song2",
          tags: [],
          title: "Song",
          aliases: [],
          originalArtists: [{ entityId: "other", displayName: "Other" }],
          archivedAt: null,
        },
      ],
      entityAliases: { artist: ["Artist"] },
    } as unknown as OtwPlayAdminCatalogDto & {
      entityAliases: Record<string, string[]>;
    };
    const resolved = resolveAiReviewCatalog(result, catalog);
    expect(resolved.songs[0].values.song?.existingSongId).toBe("song1");
    expect(resolved.songs[0].values.song?.candidates).toHaveLength(2);
    expect(resolved.songs[0].values.song?.tags).toEqual(["J-POP"]);
    const alternate = structuredClone(result);
    alternate.songs[0].values.song!.title = "曲";
    alternate.songs[0].values.song!.alternateTitles = ["Song"];
    expect(resolveAiReviewCatalog(alternate, catalog).songs[0].values.song?.existingSongId).toBe("song1");
    alternate.songs[0].values.song!.originalArtists[0].name = "Unknown Artist";
    const uncertain = resolveAiReviewCatalog(alternate, catalog).songs[0].values.song!;
    expect(uncertain.existingSongId).toBeNull();
    expect(uncertain.candidates).toHaveLength(2);
  });
});
