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
            status: {
              uploadStatus: "processed",
              privacyStatus: "public",
              embeddable: true,
            },
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
    expect(
      fetcher.mock.calls.every((call) => call[1]?.signal instanceof AbortSignal),
    ).toBe(true);
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

  it("reads public playlist summary and preserves paginated item positions", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/playlists")) {
        return Response.json({
          items: [{
            id: "PL1234567890",
            snippet: {
              title: "Official Covers",
              channelId: "UC123",
              channelTitle: "Official",
            },
            contentDetails: { itemCount: 51 },
            status: { privacyStatus: "unlisted" },
          }],
        });
      }
      return Response.json({
        items: [{
          id: "playlist-item-1",
          snippet: { position: 50 },
          contentDetails: { videoId: "dQw4w9WgXcQ" },
        }],
        nextPageToken: "next-page",
      });
    });
    const reader = new YouTubeOtwPlayMetadataReader("secret-key", fetcher);
    await expect(reader.readPlaylistSummary("PL1234567890")).resolves.toEqual({
      playlistId: "PL1234567890",
      title: "Official Covers",
      ownerChannelId: "UC123",
      ownerChannelTitle: "Official",
      itemCount: 51,
      privacyStatus: "unlisted",
    });
    await expect(
      reader.readPlaylistPage("PL1234567890", "page-token"),
    ).resolves.toEqual({
      items: [{
        playlistItemId: "playlist-item-1",
        videoId: "dQw4w9WgXcQ",
        position: 50,
      }],
      nextPageToken: "next-page",
    });
    const pageUrl = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(pageUrl.searchParams.get("maxResults")).toBe("50");
    expect(pageUrl.searchParams.get("pageToken")).toBe("page-token");
  });

  it("includes the made-for-kids API fact in video metadata", async () => {
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => Response.json({
        items: [{
          id: "dQw4w9WgXcQ",
          snippet: { channelId: "UC123", title: "Song" },
          status: {
            uploadStatus: "processed",
            privacyStatus: "public",
            embeddable: true,
            madeForKids: true,
          },
        }],
      })),
    );
    await expect(reader.readVideo("dQw4w9WgXcQ")).resolves.toMatchObject({
      madeForKids: true,
    });
  });

  it("reports only a safe fetch failure classification", async () => {
    const failure = new TypeError("secret-key must not be exposed");
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => {
        throw failure;
      }),
    );

    await expect(reader.readVideo("dQw4w9WgXcQ")).rejects.toMatchObject({
      message: "YouTube metadata request failed",
      code: "network",
      retryable: true,
    });
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
              status: {
                uploadStatus: "processed",
                privacyStatus: "public",
                embeddable: false,
              },
            },
          ],
        }),
      ),
    );

    await expect(reader.readVideo("dQw4w9WgXcQ")).resolves.toMatchObject({
      availabilityStatus: "embed_disabled",
    });
  });

  it.each([
    [
      "deleted",
      { uploadStatus: "deleted", privacyStatus: "private", embeddable: false },
      { blocked: ["KR"] },
    ],
    [
      "private",
      { uploadStatus: "processed", privacyStatus: "private", embeddable: false },
      { blocked: ["KR"] },
    ],
    [
      "region_blocked",
      { uploadStatus: "processed", privacyStatus: "public", embeddable: false },
      { allowed: ["US"] },
    ],
    [
      "embed_disabled",
      { uploadStatus: "processed", privacyStatus: "unlisted", embeddable: false },
      undefined,
    ],
    [
      "playable",
      { uploadStatus: "processed", privacyStatus: "unlisted", embeddable: true },
      { blocked: ["US"] },
    ],
    [
      "unavailable",
      { uploadStatus: "failed", privacyStatus: "public", embeddable: true },
      undefined,
    ],
  ] as const)("classifies %s with the fixed precedence", async (expected, status, regionRestriction) => {
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => Response.json({
        items: [{
          id: "dQw4w9WgXcQ",
          snippet: { channelId: "UC123", title: "Song" },
          contentDetails: { regionRestriction },
          status,
        }],
      })),
    );
    await expect(reader.readVideos(["dQw4w9WgXcQ"])).resolves.toEqual([
      expect.objectContaining({ availabilityStatus: expected }),
    ]);
  });

  it("deduplicates and stably sorts a bounded batch while treating missing items as unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ items: [] }));
    const reader = new YouTubeOtwPlayMetadataReader("secret-key", fetcher);
    await expect(reader.readVideos(["zzzzzzzzzzz", "aaaaaaaaaaa", "zzzzzzzzzzz"]))
      .resolves.toEqual([
        { videoId: "aaaaaaaaaaa", availabilityStatus: "unavailable", video: null },
        { videoId: "zzzzzzzzzzz", availabilityStatus: "unavailable", video: null },
      ]);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("id")).toBe("aaaaaaaaaaa,zzzzzzzzzzz");
    await expect(
      reader.readVideos(Array.from({ length: 51 }, (_, index) => String(index).padStart(11, "0"))),
    ).rejects.toMatchObject({ code: "invalid_request", retryable: false });
  });

  it("keeps an explicit deleted signal even when public metadata is absent", async () => {
    const reader = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => Response.json({
        items: [{
          id: "dQw4w9WgXcQ",
          status: { uploadStatus: "deleted", privacyStatus: "private" },
        }],
      })),
    );
    await expect(reader.readVideos(["dQw4w9WgXcQ"])).resolves.toEqual([{
      videoId: "dQw4w9WgXcQ",
      availabilityStatus: "deleted",
      video: null,
    }]);
  });

  it("classifies provider failures without leaking response bodies", async () => {
    const rateLimited = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => new Response("secret body", {
        status: 429,
        headers: { "Retry-After": "120" },
      })),
    );
    await expect(rateLimited.readVideos(["dQw4w9WgXcQ"])).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
      retryAfterMs: 120_000,
    });

    const quota = new YouTubeOtwPlayMetadataReader(
      "secret-key",
      vi.fn<typeof fetch>(async () => Response.json(
        { error: { errors: [{ reason: "quotaExceeded" }] } },
        { status: 403 },
      )),
    );
    await expect(quota.readVideos(["dQw4w9WgXcQ"])).rejects.toMatchObject({
      code: "quota_exceeded",
      retryable: true,
    });
  });

  it("aborts a metadata batch after the fixed 10 second timeout", async () => {
    vi.useFakeTimers();
    try {
      const reader = new YouTubeOtwPlayMetadataReader(
        "secret-key",
        vi.fn<typeof fetch>(async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })),
      );
      const pending = reader.readVideos(["dQw4w9WgXcQ"]);
      const expectation = expect(pending).rejects.toMatchObject({
        code: "timeout",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
