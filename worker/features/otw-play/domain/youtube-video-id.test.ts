import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId } from "./youtube-video-id";

describe("OTW Play YouTube video ID parser", () => {
  const videoId = "dQw4w9WgXcQ";

  it.each([
    ["https://www.youtube.com/watch?v=" + videoId, videoId],
    ["https://youtube.com/watch?feature=share&v=" + videoId, videoId],
    ["https://m.youtube.com/watch?v=" + videoId + "&t=30", videoId],
    ["https://music.youtube.com/watch?v=" + videoId, videoId],
    ["https://youtu.be/" + videoId + "?t=30", videoId],
    ["https://www.youtube.com/embed/" + videoId, videoId],
    ["https://www.youtube.com/shorts/" + videoId + "?feature=share", videoId],
  ])("extracts an ID from an allowed URL: %s", (value, expected) => {
    expect(extractYouTubeVideoId(value)).toBe(expected);
  });

  it.each([
    "https://youtube.com.evil.test/watch?v=" + videoId,
    "https://youtu.be.evil.test/" + videoId,
    "https://evil-youtube.com/watch?v=" + videoId,
    "https://evil.youtube.com/watch?v=" + videoId,
    "https://attacker@www.youtube.com/watch?v=" + videoId,
    "https://www.youtube-nocookie.com/embed/" + videoId,
    "https://www.youtu.be/" + videoId,
  ])("rejects arbitrary, lookalike, or credentialed hosts: %s", (value) => {
    expect(extractYouTubeVideoId(value)).toBeNull();
  });

  it.each([
    videoId,
    "/watch?v=" + videoId,
    "not a URL",
    "http://www.youtube.com/watch?v=" + videoId,
    "ftp://www.youtube.com/watch?v=" + videoId,
    "https://www.youtube.com:444/watch?v=" + videoId,
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=" + videoId + "&v=ABCDEFGHIJK",
    "https://www.youtube.com/watch?v=abcdefghij",
    "https://www.youtube.com/watch?v=abcdefghijkl",
    "https://www.youtube.com/watch?v=abcde!ghijk",
    "https://www.youtube.com/embed/" + videoId + "/extra",
    "https://www.youtube.com/live/" + videoId,
    "https://youtu.be//" + videoId,
    "https://youtu.be////" + videoId + "////",
    "https://www.youtube.com/embed//" + videoId,
    "https://www.youtube.com//embed//" + videoId + "//",
    "https://www.youtube.com/shorts//" + videoId,
    "https:\\www.youtube.com\\watch?v=" + videoId,
    "https://www.you\ttube.com/watch?v=" + videoId,
  ])("rejects malformed or unsupported input: %s", (value) => {
    expect(extractYouTubeVideoId(value)).toBeNull();
  });
});
