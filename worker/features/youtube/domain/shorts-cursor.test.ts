import { describe, expect, it } from "vitest";
import {
  decodeYouTubeShortsCursor,
  encodeYouTubeShortsCursor,
  YouTubeShortsCursorError,
} from "./shorts-cursor";

const channels = ["UCaaaaaaaaaaaaaaaaaaaaaa", "UCbbbbbbbbbbbbbbbbbbbbbb"];

describe("YouTube Shorts cursor", () => {
  it("round-trips with order-independent channel fingerprints", () => {
    const value = encodeYouTubeShortsCursor(
      { publishedAt: 1_700_000_000_000, videoId: "video-1" },
      channels,
    );
    expect(decodeYouTubeShortsCursor(value, [...channels].reverse())).toEqual({
      publishedAt: 1_700_000_000_000,
      videoId: "video-1",
    });
  });

  it("rejects malformed and cross-channel cursors", () => {
    expect(() => decodeYouTubeShortsCursor("not-base64", channels)).toThrow(
      YouTubeShortsCursorError,
    );
    const value = encodeYouTubeShortsCursor(
      { publishedAt: 1_700_000_000_000, videoId: "video-1" },
      channels,
    );
    expect(() => decodeYouTubeShortsCursor(value, [channels[0]!])).toThrow(
      YouTubeShortsCursorError,
    );
  });
});
