// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OTW Play YouTube IFrame adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = "";
    document.body.innerHTML = '<div id="player"></div>';
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
  });

  it("loads one script and constructs one policy-compliant player", async () => {
    const Player = vi.fn(function (this: Record<string, unknown>, _element, options) {
      Object.assign(this, {
        loadVideoById: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        stopVideo: vi.fn(),
        destroy: vi.fn(),
      });
      options.events.onReady();
    });
    const { loadYouTubeIframeApi, createOtwPlayYouTubePlayer } = await import(
      "./youtube-iframe-api"
    );

    const first = loadYouTubeIframeApi();
    const second = loadYouTubeIframeApi();
    expect(document.querySelectorAll("script")).toHaveLength(1);
    window.YT = { Player } as unknown as NonNullable<typeof window.YT>;
    window.onYouTubeIframeAPIReady?.();
    await expect(first).resolves.toBe(window.YT);
    await expect(second).resolves.toBe(window.YT);

    const ready = vi.fn();
    await createOtwPlayYouTubePlayer(
      document.getElementById("player")!,
      { onReady: ready },
      "https://example.com",
    );
    expect(Player).toHaveBeenCalledTimes(1);
    expect(Player.mock.calls[0]?.[1]).toMatchObject({
      playerVars: {
        autoplay: 0,
        controls: 1,
        playsinline: 1,
        origin: "https://example.com",
      },
    });
    expect(ready).toHaveBeenCalledOnce();
  });

  it("does not load video until the caller issues a user-intent load", async () => {
    const loadVideoById = vi.fn();
    const stopVideo = vi.fn();
    const destroy = vi.fn();
    const Player = vi.fn(function (this: Record<string, unknown>) {
      Object.assign(this, {
        loadVideoById,
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        stopVideo,
        destroy,
      });
    });
    window.YT = { Player } as unknown as NonNullable<typeof window.YT>;
    const { createOtwPlayYouTubePlayer } = await import("./youtube-iframe-api");

    const player = await createOtwPlayYouTubePlayer(
      document.getElementById("player")!,
    );
    expect(loadVideoById).not.toHaveBeenCalled();
    player.load({ videoId: "dQw4w9WgXcQ", startSeconds: 0 });
    expect(loadVideoById).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 0,
    });
    player.destroy();
    player.destroy();
    expect(stopVideo).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
