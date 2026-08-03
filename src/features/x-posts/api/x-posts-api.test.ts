import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { XPostDto } from "@contracts/x-posts";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (uid: number, urlTwitter?: string | null): MemberDto => ({
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
  });

const makePost = (id: string, username: string): XPostDto => ({
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
    const { extractXHandleFromUrl } = await import("../model/x-handles");

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
    const { fetchMembersXPosts } = await import("./x-posts-api");
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
      "/api/x/posts?handles=valid_user&maxResults=10&clientVersion=v4",
      { cache: "default" },
    );
  });

  it("기본 요청 개수는 5개로 제한한다", async () => {
    const { fetchMembersXPosts } = await import("./x-posts-api");
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      posts: [],
      byHandle: [],
    });

    await fetchMembersXPosts([makeMember(1, "https://x.com/valid_user")]);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/x/posts?handles=valid_user&maxResults=5&clientVersion=v4",
      { cache: "default" },
    );
  });

  it("관리자 모니터링 요청은 admin 파라미터를 포함한다", async () => {
    const { fetchMembersXPosts } = await import("./x-posts-api");
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      posts: [],
      byHandle: [],
    });

    await fetchMembersXPosts([makeMember(1, "https://x.com/valid_user")], {
      admin: true,
      maxResults: 10,
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/x/posts?handles=valid_user&maxResults=10&clientVersion=v4&admin=1",
      { cache: "default" },
    );
  });

  it("config API adapter는 React Query와 별도의 캐시를 유지하지 않는다", async () => {
    const { fetchXPostsConfig } = await import("./x-posts-api");
    apiFetchMock.mockResolvedValue({ visibility: "public" });

    const first = await fetchXPostsConfig();
    const second = await fetchXPostsConfig();

    expect(first.visibility).toBe("public");
    expect(second.visibility).toBe("public");
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/x/config", {
      cache: "default",
    });
  });

  it("답글 문맥 API는 선택한 저장 게시글 ID의 전용 경로를 호출한다", async () => {
    const { fetchXPostContext } = await import("./x-posts-api");
    apiFetchMock.mockResolvedValue({
      sourcePostId: "2059529979700846592",
      replyTo: makePost("2059529979700846500", "parent_user"),
    });

    await fetchXPostContext("2059529979700846592");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/x/posts/2059529979700846592/context",
      { cache: "default" },
    );
  });

  it("게시글에 memberUid를 매핑한다", async () => {
    const { fetchMembersXPosts } = await import("./x-posts-api");
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

    expect(first?.posts[0]?.memberUid).toBe(10);
    expect(first?.byHandle[0]?.posts[0]?.memberUid).toBe(10);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("force 옵션을 사용하면 fresh cache를 우회해 다시 요청한다", async () => {
    const { fetchMembersXPosts } = await import("./x-posts-api");
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

});
