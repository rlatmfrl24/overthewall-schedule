import { describe, expect, it } from "vitest";
import {
  createPerformanceDedupeKeyMaterial,
  createSongDedupeKeyMaterial,
  createVideoBackedSongDedupeKeyMaterial,
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

  it("keeps video-backed songs distinct without auto-linking equal titles", () => {
    const first = createVideoBackedSongDedupeKeyMaterial({
      title: " Ｓａｍｅ　Ｓｏｎｇ ",
      youtubeVideoId: "aBcDeFgHi_1",
    });
    const second = createVideoBackedSongDedupeKeyMaterial({
      title: "same song",
      youtubeVideoId: "zYxWvUtSr_2",
    });

    expect(JSON.parse(first)).toEqual([
      "song-from-video:v1",
      "same song",
      "aBcDeFgHi_1",
    ]);
    expect(first).not.toBe(second);
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
});
