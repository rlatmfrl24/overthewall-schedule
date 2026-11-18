import { beforeEach, expect, it, vi } from "vitest";
import { fetchMemberPostsAggregate } from "./member-posts-api";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("member-post aggregate API는 요청 소스와 페이지 크기를 조합한다", async () => {
    await fetchMemberPostsAggregate({
        includeX: false,
        includeNaverCafe: true,
        maxResults: 3,
        size: 7,
        admin: true,
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/member-posts?sources=naver-cafe&maxResults=3&size=7&compact=1&admin=1", { cache: "default" });
});
