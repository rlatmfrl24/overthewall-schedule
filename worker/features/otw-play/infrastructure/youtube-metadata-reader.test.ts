import { describe, expect, it, vi } from "vitest";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import { YouTubeOtwPlayMetadataReader } from "./youtube-metadata-reader";

describe("YouTubeOtwPlayMetadataReader", () => {
  it("reads authoritative video and channel identity without exposing the API key", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels")) {
        return Response.json({
          items: [{ id: "UC123", snippet: { title: "Official" } }],
        });
      }
      return Response.json({
        items: [
          {
            id: "dQw4w9WgXcQ",
            snippet: {
              channelId: "UC123",
              channelTitle: "Official",
              title: "Song",
              publishedAt: "2026-08-11T00:00:00Z",
              thumbnails: { high: { url: "https://i.ytimg.com/test.jpg" } },
            },
            contentDetails: { duration: "PT3M1S" },
            status: { privacyStatus: "public", embeddable: true },
          },
        ],
      });
    });
    const reader = new YouTubeOtwPlayMetadataReader("secret-key", fetcher);
    await expect(reader.readChannel("UC123")).resolves.toEqual({
      channelId: "UC123",
      displayName: "Official",
    });
    await expect(reader.readVideo("dQw4w9WgXcQ")).resolves.toMatchObject({
      videoId: "dQw4w9WgXcQ",
      channelId: "UC123",
      durationSeconds: 181,
      availabilityStatus: "playable",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed when YouTube is unavailable", async () => {
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })),
    );
    await expect(reader.readVideo("dQw4w9WgXcQ")).rejects.toBeInstanceOf(
      OtwPlayYouTubeMetadataError,
    );
  });

  it("keeps embed-disabled separate from general unavailability", async () => {
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          items: [
            {
              id: "dQw4w9WgXcQ",
              snippet: { channelId: "UC123", title: "Song" },
              status: { privacyStatus: "public", embeddable: false },
            },
          ],
        }),
      ),
    );

    await expect(reader.readVideo("dQw4w9WgXcQ")).resolves.toMatchObject({
      availabilityStatus: "embed_disabled",
    });
  });
});
