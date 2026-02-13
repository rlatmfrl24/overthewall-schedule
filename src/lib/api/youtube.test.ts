import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (
  uid: number,
  youtubeChannelId?: string | null,
): Member =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: youtubeChannelId ?? null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

describe("youtube api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("채널이 없으면 null을 반환한다", async () => {
    const { fetchMembersYouTubeVideos } = await import("./youtube");
    const result = await fetchMembersYouTubeVideos([makeMember(1, null)]);

    expect(result).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("동영상에 memberUid를 매핑하고 fresh cache를 재사용한다", async () => {
    const { fetchMembersYouTubeVideos } = await import("./youtube");

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      videos: [{ videoId: "v1", channelId: "UC_A" }],
      shorts: [{ videoId: "s1", channelId: "UC_A" }],
      byChannel: [],
    });

    const members = [makeMember(10, "UC_A")];
    const first = await fetchMembersYouTubeVideos(members, { maxResults: 5 });
    const second = await fetchMembersYouTubeVideos(members, { maxResults: 5 });

    expect(first?.videos[0]?.memberUid).toBe(10);
    expect(first?.shorts[0]?.memberUid).toBe(10);
    expect(second?.videos[0]?.videoId).toBe("v1");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/youtube/videos?channelIds=UC_A&maxResults=5",
    );
  });

  it("stale-while-revalidate 구간에서는 캐시를 즉시 반환하고 백그라운드 갱신한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { fetchMembersYouTubeVideos } = await import("./youtube");
    const members = [makeMember(1, "UC_STALE")];

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "old",
      videos: [{ videoId: "old", channelId: "UC_STALE" }],
      shorts: [],
      byChannel: [],
    });

    const first = await fetchMembersYouTubeVideos(members, { maxResults: 20 });
    expect(first?.videos[0]?.videoId).toBe("old");

    vi.setSystemTime(new Date("2026-02-13T00:06:00Z"));
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "new",
      videos: [{ videoId: "new", channelId: "UC_STALE" }],
      shorts: [],
      byChannel: [],
    });

    const second = await fetchMembersYouTubeVideos(members, { maxResults: 20 });
    expect(second?.videos[0]?.videoId).toBe("old");
    await Promise.resolve();

    const third = await fetchMembersYouTubeVideos(members, { maxResults: 20 });
    expect(third?.videos[0]?.videoId).toBe("new");
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("오래된 캐시에서 fetch 실패 시 stale 데이터를 fallback으로 사용한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { fetchMembersYouTubeVideos } = await import("./youtube");
    const members = [makeMember(2, "UC_ERR")];

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "old",
      videos: [{ videoId: "stable", channelId: "UC_ERR" }],
      shorts: [],
      byChannel: [],
    });
    await fetchMembersYouTubeVideos(members);

    vi.setSystemTime(new Date("2026-02-13T01:00:00Z"));
    apiFetchMock.mockRejectedValueOnce(new Error("network"));

    const result = await fetchMembersYouTubeVideos(members);
    expect(result?.videos[0]?.videoId).toBe("stable");
  });
});
