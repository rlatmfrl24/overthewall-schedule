import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (uid: number, channelId?: string) =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: channelId ? `https://chzzk.naver.com/${channelId}` : null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

describe("vods api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.resetModules();
  });

  it("채널별 최신 vod를 멤버 uid로 매핑한다", async () => {
    const { fetchAllMembersLatestVideos } = await import("./vods");

    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          channelId: "aaa",
          content: {
            data: [{ videoNo: 100, videoId: "v1", publishDate: "2026-02-13" }],
          },
        },
        {
          channelId: "bbb",
          content: {
            data: [{ videoNo: 200, videoId: "v2", publishDate: "2026-02-12" }],
          },
        },
      ],
    });

    const members = [
      makeMember(1, "aaa"),
      makeMember(2, "bbb"),
      makeMember(3, "aaa"),
    ];
    const result = await fetchAllMembersLatestVideos(members);

    expect(result[1]?.videoId).toBe("v1");
    expect(result[2]?.videoId).toBe("v2");
    expect(result[3]?.videoId).toBe("v1");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/vods/chzzk?channelIds=aaa%2Cbbb&page=0&size=1",
    );
  });

  it("채널별 여러 vod를 멤버 uid가 포함된 최신순 배열로 반환한다", async () => {
    const { fetchAllMembersVodVideos } = await import("./vods");

    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          channelId: "aaa",
          content: {
            data: [
              {
                videoNo: 101,
                videoId: "new",
                publishDate: "2026-02-14T11:00:00+09:00",
              },
              {
                videoNo: 100,
                videoId: "old",
                publishDate: "2026-02-13T11:00:00+09:00",
              },
            ],
          },
        },
        {
          channelId: "bbb",
          content: {
            data: [
              {
                videoNo: 200,
                videoId: "mid",
                publishDate: "2026-02-14T09:00:00+09:00",
              },
            ],
          },
        },
      ],
    });

    const members = [makeMember(1, "aaa"), makeMember(2, "bbb")];
    const result = await fetchAllMembersVodVideos(members, 6);

    expect(result.map((video) => video.videoId)).toEqual(["new", "mid", "old"]);
    expect(result.map((video) => video.memberUid)).toEqual([1, 2, 1]);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/vods/chzzk?channelIds=aaa%2Cbbb&page=0&size=6",
    );
  });

  it("latest cache가 fresh이면 재호출하지 않는다", async () => {
    const { fetchAllMembersLatestVideos } = await import("./vods");

    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          channelId: "ccc",
          content: {
            data: [{ videoNo: 300, videoId: "v3", publishDate: "2026-02-11" }],
          },
        },
      ],
    });

    const members = [makeMember(9, "ccc")];
    const first = await fetchAllMembersLatestVideos(members);
    const second = await fetchAllMembersLatestVideos(members);

    expect(first[9]?.videoId).toBe("v3");
    expect(second[9]?.videoId).toBe("v3");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("유효 채널이 없으면 빈 객체를 반환한다", async () => {
    const { fetchAllMembersLatestVideos } = await import("./vods");
    const result = await fetchAllMembersLatestVideos([
      makeMember(1),
      makeMember(2),
    ]);

    expect(result).toEqual({});
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
