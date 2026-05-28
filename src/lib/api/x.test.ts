import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, XPost } from "@/lib/types";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (uid: number, urlTwitter?: string | null): Member =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: urlTwitter ?? null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const makePost = (id: string, username: string): XPost => ({
  id,
  text: `post ${id}`,
  createdAt: "2026-02-13T00:00:00Z",
  url: `https://x.com/${username}/status/${id}`,
  username,
  metrics: {
    likeCount: 1,
    replyCount: 2,
    repostCount: 3,
    quoteCount: 4,
  },
  media: [],
});

describe("x api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("X/Twitter URL에서 handle을 추출하고 예약 경로는 제외한다", async () => {
    const { extractXHandleFromUrl } = await import("./x");

    expect(extractXHandleFromUrl("https://x.com/otw_member")).toBe(
      "otw_member",
    );
    expect(extractXHandleFromUrl("https://twitter.com/OtwMember/status/1")).toBe(
      "OtwMember",
    );
    expect(extractXHandleFromUrl("@direct_handle")).toBe("direct_handle");
    expect(extractXHandleFromUrl("https://x.com/search?q=otw")).toBeNull();
    expect(extractXHandleFromUrl("https://example.com/otw_member")).toBeNull();
  });

  it("invalid handle은 제외하고 유효한 멤버만 요청한다", async () => {
    const { fetchMembersXPosts } = await import("./x");
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      posts: [],
      byHandle: [],
    });

    await fetchMembersXPosts(
      [
        makeMember(1, "https://x.com/valid_user"),
        makeMember(2, "https://x.com/invalid-user"),
        makeMember(3, "https://example.com/nope"),
      ],
      { maxResults: 10 },
    );

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/x/posts?handles=valid_user&maxResults=10&clientVersion=v3",
      { cache: "default" },
    );
  });

  it("기본 요청 개수는 10개로 제한한다", async () => {
    const { fetchMembersXPosts } = await import("./x");
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      posts: [],
      byHandle: [],
    });

    await fetchMembersXPosts([makeMember(1, "https://x.com/valid_user")]);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/x/posts?handles=valid_user&maxResults=10&clientVersion=v3",
      { cache: "default" },
    );
  });

  it("게시글에 memberUid를 매핑하고 fresh cache를 재사용한다", async () => {
    const { fetchMembersXPosts } = await import("./x");
    const post = makePost("p1", "Valid_User");

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      posts: [post],
      byHandle: [
        {
          handle: "valid_user",
          userId: "u1",
          posts: [post],
          error: null,
          stale: false,
        },
      ],
    });

    const members = [makeMember(10, "https://x.com/valid_user")];
    const first = await fetchMembersXPosts(members, { maxResults: 5 });
    const second = await fetchMembersXPosts(members, { maxResults: 5 });

    expect(first?.posts[0]?.memberUid).toBe(10);
    expect(first?.byHandle[0]?.posts[0]?.memberUid).toBe(10);
    expect(second?.posts[0]?.id).toBe("p1");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("force 옵션을 사용하면 fresh cache를 우회해 다시 요청한다", async () => {
    const { fetchMembersXPosts } = await import("./x");
    const members = [makeMember(10, "https://x.com/valid_user")];
    const oldPost = makePost("old", "valid_user");
    const newPost = makePost("new", "valid_user");

    apiFetchMock
      .mockResolvedValueOnce({
        updatedAt: "old",
        posts: [oldPost],
        byHandle: [],
      })
      .mockResolvedValueOnce({
        updatedAt: "new",
        posts: [newPost],
        byHandle: [],
      });

    const first = await fetchMembersXPosts(members, { maxResults: 5 });
    const second = await fetchMembersXPosts(members, {
      force: true,
      maxResults: 5,
    });

    expect(first?.posts[0]?.id).toBe("old");
    expect(second?.posts[0]?.id).toBe("new");
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[1]?.[0]).toEqual(
      expect.stringContaining("&_="),
    );
    expect(apiFetchMock.mock.calls[1]?.[1]).toEqual({ cache: "no-store" });
  });

  it("stale-while-revalidate 구간에서는 캐시를 반환하고 백그라운드 갱신한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { fetchMembersXPosts } = await import("./x");
    const members = [makeMember(1, "https://x.com/stale_user")];
    const oldPost = makePost("old", "stale_user");
    const newPost = makePost("new", "stale_user");

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "old",
      posts: [oldPost],
      byHandle: [],
    });

    const first = await fetchMembersXPosts(members, { maxResults: 10 });
    expect(first?.posts[0]?.id).toBe("old");

    vi.setSystemTime(new Date("2026-02-13T00:31:00Z"));
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "new",
      posts: [newPost],
      byHandle: [],
    });

    const second = await fetchMembersXPosts(members, { maxResults: 10 });
    expect(second?.posts[0]?.id).toBe("old");
    await Promise.resolve();

    const third = await fetchMembersXPosts(members, { maxResults: 10 });
    expect(third?.posts[0]?.id).toBe("new");
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("오래된 캐시에서 fetch 실패 시 stale 데이터를 fallback으로 사용한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { fetchMembersXPosts } = await import("./x");
    const members = [makeMember(2, "https://x.com/error_user")];
    const post = makePost("stable", "error_user");

    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "old",
      posts: [post],
      byHandle: [],
    });
    await fetchMembersXPosts(members);

    vi.setSystemTime(new Date("2026-02-13T01:00:00Z"));
    apiFetchMock.mockRejectedValueOnce(new Error("network"));

    const result = await fetchMembersXPosts(members);
    expect(result?.posts[0]?.id).toBe("stable");
  });
});
