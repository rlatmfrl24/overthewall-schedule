import { describe, expect, it } from "vitest";
import {
  assessExactSourceDuplicate,
  assessSoftDuplicate,
  createPerformanceDedupeKeyMaterial,
  createSongDedupeKeyMaterial,
} from "./duplicate-policy";

describe("OTW Play duplicate policy", () => {
  it("creates deterministic song key material without hashing", () => {
    const artistIds = ["artist-b", "artist-a", "artist-a"];
    const material = createSongDedupeKeyMaterial({
      title: " Ｂｌｕｅ--Ｍｏｏｎ！ ",
      originalArtistIds: artistIds,
    });

    expect(material).toBe(
      createSongDedupeKeyMaterial({
        title: "blue moon",
        originalArtistIds: ["artist-a", "artist-b"],
      }),
    );
    expect(JSON.parse(material)).toEqual([
      "song:v1",
      "blue moon",
      ["artist-a", "artist-b"],
    ]);
    expect(artistIds).toEqual(["artist-b", "artist-a", "artist-a"]);
    expect(material).not.toMatch(/^[a-f\d]{64}$/i);
  });

  it("creates versioned performance key material with a canonical start", () => {
    expect(
      createPerformanceDedupeKeyMaterial({
        songId: " song-1 ",
        sourceId: " source-1 ",
      }),
    ).toBe(
      createPerformanceDedupeKeyMaterial({
        songId: "song-1",
        sourceId: "source-1",
        startSeconds: 0,
      }),
    );
    expect(
      JSON.parse(
        createPerformanceDedupeKeyMaterial({
          songId: "song-1",
          sourceId: "source-1",
          startSeconds: 30,
        }),
      ),
    ).toEqual(["performance:v1", "song-1", "source-1", 30]);
  });

  it("keeps exact duplicate evidence separate and never auto-merges", () => {
    const exact = assessExactSourceDuplicate(
      { youtubeVideoId: "dQw4w9WgXcQ", startSeconds: null },
      { youtubeVideoId: "dQw4w9WgXcQ", startSeconds: 0 },
    );
    const differentSegment = assessExactSourceDuplicate(
      { youtubeVideoId: "dQw4w9WgXcQ", startSeconds: 30 },
      { youtubeVideoId: "dQw4w9WgXcQ", startSeconds: 0 },
    );

    expect(exact).toEqual({
      isExactDuplicate: true,
      evidence: ["same_youtube_video_id", "same_segment_start"],
      automaticMerge: false,
    });
    expect(differentSegment).toEqual({
      isExactDuplicate: false,
      evidence: ["same_youtube_video_id"],
      automaticMerge: false,
    });
  });

  it("keeps soft duplicate evidence separate and never auto-merges", () => {
    expect(
      assessSoftDuplicate({
        similarTitle: true,
        overlappingOriginalArtistIds: ["artist-1"],
        nearbyReleaseDate: true,
        overlappingParticipantIds: ["member-1"],
      }),
    ).toEqual({
      isSoftDuplicateCandidate: true,
      evidence: [
        "similar_title",
        "overlapping_original_artist",
        "nearby_release_date",
        "overlapping_participant",
      ],
      automaticMerge: false,
    });
    expect(assessSoftDuplicate({})).toEqual({
      isSoftDuplicateCandidate: false,
      evidence: [],
      automaticMerge: false,
    });
  });
});
