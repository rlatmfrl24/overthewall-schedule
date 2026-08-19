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
        getCurrentTime: vi.fn(() => 0),
        getDuration: vi.fn(() => 0),
        seekTo: vi.fn(),
        setVolume: vi.fn(),
        mute: vi.fn(),
        unMute: vi.fn(),
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
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
        rel: 0,
        origin: "https://example.com",
      },
    });
    const playerVars = Player.mock.calls[0]?.[1].playerVars;
    expect(playerVars).not.toHaveProperty("cc_load_policy");
    expect(playerVars).not.toHaveProperty("modestbranding");
    expect(playerVars).not.toHaveProperty("showinfo");
    expect(ready).toHaveBeenCalledOnce();
  });

  it("does not load video until the caller issues a user-intent load", async () => {
    const loadVideoById = vi.fn();
    const stopVideo = vi.fn();
    const destroy = vi.fn();
    const setVolume = vi.fn();
    const getCurrentTime = vi.fn(() => 42);
    const getDuration = vi.fn(() => 180);
    const seekTo = vi.fn();
    const mute = vi.fn();
    const unMute = vi.fn();
    const Player = vi.fn(function (this: Record<string, unknown>) {
      Object.assign(this, {
        loadVideoById,
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getCurrentTime,
        getDuration,
        seekTo,
        setVolume,
        mute,
        unMute,
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
    player.setVolume(120);
    player.setMuted(true);
    player.setMuted(false);
    expect(setVolume).toHaveBeenCalledWith(100);
    expect(mute).toHaveBeenCalledOnce();
    expect(unMute).toHaveBeenCalledOnce();
    expect(player.getCurrentTime()).toBe(42);
    expect(player.getDuration()).toBe(180);
    player.seekTo(65);
    expect(seekTo).toHaveBeenCalledWith(65, true);
    player.destroy();
    player.destroy();
    expect(stopVideo).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
