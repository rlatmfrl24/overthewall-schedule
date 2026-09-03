import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (
  uid: number,
  youtubeChannelId?: string | null,
): MemberDto => ({
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
});

describe("youtube api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("채널이 없으면 null을 반환한다", async () => {
    const result = await import("./youtube").then(({ fetchMembersYouTubeVideos }) =>
      fetchMembersYouTubeVideos([makeMember(1, null)]),
    );

    expect(result).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("채널 ID를 정렬해 조회하고 동영상에 memberUid를 매핑한다", async () => {
    apiFetchMock.mockResolvedValue({
      updatedAt: "2026-02-13T00:00:00Z",
      videos: [{ videoId: "v1", channelId: "UC_A" }],
      shorts: [{ videoId: "s1", channelId: "UC_B" }],
      byChannel: [],
    });

    const { fetchMembersYouTubeVideos } = await import("./youtube");
    const result = await fetchMembersYouTubeVideos(
      [makeMember(2, "UC_B"), makeMember(1, "UC_A")],
      { maxResults: 9 },
    );

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/youtube/videos?channelIds=UC_A%2CUC_B&maxResults=9",
    );
    expect(result?.videos[0]?.memberUid).toBe(1);
    expect(result?.shorts[0]?.memberUid).toBe(2);
  });

  it("API adapter는 오류를 TanStack Query 계층으로 전파한다", async () => {
    apiFetchMock.mockRejectedValue(new Error("failed"));
    const { fetchMembersYouTubeVideos } = await import("./youtube");

    await expect(
      fetchMembersYouTubeVideos([makeMember(1, "UC_A")]),
    ).rejects.toThrow("failed");
  });

  it("Shorts cursor와 선택 채널을 전용 endpoint로 전달한다", async () => {
    apiFetchMock.mockResolvedValue({
      items: [{ videoId: "s1", channelId: "UC_B" }],
      nextCursor: "next",
      hasMore: true,
      updatedAt: "2026-09-03T00:00:00Z",
      collection: {
        state: "ready",
        baselineTarget: 20,
        requested: 20,
        returned: 1,
        revalidateAfterMs: null,
      },
    });
    const { fetchMembersYouTubeShorts } = await import("./youtube");
    const result = await fetchMembersYouTubeShorts(
      [makeMember(2, "UC_B"), makeMember(1, "UC_A")],
      { cursor: "cursor-1" },
    );

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/youtube/shorts?channelIds=UC_A%2CUC_B&limit=20&cursor=cursor-1",
    );
    expect(result?.items[0]?.memberUid).toBe(2);
  });
});
