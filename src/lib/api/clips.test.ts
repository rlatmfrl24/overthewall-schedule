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

describe("clips api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.resetModules();
  });

  it("멤버 클립을 최신순으로 합치고 memberUid를 매핑한다", async () => {
    const { fetchAllMembersClips } = await import("./clips");

    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          channelId: "aaa",
          content: {
            data: [
              { clipUID: "c1", createdDate: "2026-02-13T12:00:00Z" },
              { clipUID: "c2", createdDate: "2026-02-10T12:00:00Z" },
            ],
          },
        },
        {
          channelId: "bbb",
          content: {
            data: [{ clipUID: "c3", createdDate: "2026-02-14T12:00:00Z" }],
          },
        },
      ],
    });

    const result = await fetchAllMembersClips(
      [makeMember(1, "aaa"), makeMember(2, "bbb")],
      5,
    );

    expect(result.map((clip) => clip.clipUID)).toEqual(["c3", "c1", "c2"]);
    expect(result.find((clip) => clip.clipUID === "c1")?.memberUid).toBe(1);
    expect(result.find((clip) => clip.clipUID === "c3")?.memberUid).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/clips/chzzk?channelIds=aaa%2Cbbb&size=5",
    );
  });

  it("fresh cache가 있으면 재호출 없이 캐시를 사용한다", async () => {
    const { fetchAllMembersClips } = await import("./clips");

    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          channelId: "ccc",
          content: {
            data: [{ clipUID: "c9", createdDate: "2026-02-14T12:00:00Z" }],
          },
        },
      ],
    });

    const members = [makeMember(9, "ccc")];
    const first = await fetchAllMembersClips(members, 3);
    const second = await fetchAllMembersClips(members, 3);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("채널이 없는 멤버만 있으면 빈 배열을 반환한다", async () => {
    const { fetchAllMembersClips } = await import("./clips");
    const result = await fetchAllMembersClips([makeMember(1), makeMember(2)]);

    expect(result).toEqual([]);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
