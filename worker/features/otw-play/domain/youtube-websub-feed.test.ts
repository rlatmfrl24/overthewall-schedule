import { describe, expect, it } from "vitest";
import { parseYoutubeWebsubFeed } from "./youtube-websub-feed";

const topic = "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCmmmmmmmmmmmmmmmmmmmmmm";
const feed = (entry: string) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <link rel="self" href="${topic}" />
  <entry>${entry}</entry>
</feed>`;

describe("YouTube WebSub Atom parsing", () => {
  it("extracts only the authoritative identity fields", () => {
    expect(parseYoutubeWebsubFeed(feed(`
      <yt:videoId>AAAAAAAAAAA</yt:videoId>
      <yt:channelId>UCmmmmmmmmmmmmmmmmmmmmmm</yt:channelId>
      <updated>2026-08-25T01:02:03Z</updated>
      <title>Untrusted title</title>
    `))).toEqual({
      topicUrl: topic,
      entries: [{
        videoId: "AAAAAAAAAAA",
        channelId: "UCmmmmmmmmmmmmmmmmmmmmmm",
        updatedAt: Date.parse("2026-08-25T01:02:03Z"),
      }],
    });
  });

  it("rejects DTD/entity declarations and malformed YouTube identities", () => {
    expect(() => parseYoutubeWebsubFeed(
      `<!DOCTYPE feed [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${feed("")}`,
    )).toThrow(/DTD/u);
    expect(() => parseYoutubeWebsubFeed(feed(`
      <yt:videoId>short</yt:videoId>
      <yt:channelId>UCmmmmmmmmmmmmmmmmmmmmmm</yt:channelId>
      <updated>2026-08-25T01:02:03Z</updated>
    `))).toThrow(/Invalid YouTube Atom entry/u);
  });
});
