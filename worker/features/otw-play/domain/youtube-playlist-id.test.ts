import { describe, expect, it } from "vitest";
import {
  canonicalYouTubePlaylistUrl,
  extractYouTubePlaylistId,
} from "./youtube-playlist-id";

describe("YouTube playlist identity", () => {
  it.each([
    ["PL1234567890", "PL1234567890"],
    ["https://www.youtube.com/playlist?list=PL1234567890", "PL1234567890"],
    ["https://music.youtube.com/watch?v=abc&list=PL1234567890", "PL1234567890"],
  ])("normalizes %s", (value, expected) => {
    expect(extractYouTubePlaylistId(value)).toBe(expected);
    expect(canonicalYouTubePlaylistUrl(expected)).toBe(
      `https://www.youtube.com/playlist?list=${expected}`,
    );
  });

  it.each([
    "http://www.youtube.com/playlist?list=PL1234567890",
    "https://example.com/playlist?list=PL1234567890",
    "https://www.youtube.com/playlist?list=bad%20id",
    "short",
  ])("rejects non-authoritative input %s", (value) => {
    expect(extractYouTubePlaylistId(value)).toBeNull();
  });
});
