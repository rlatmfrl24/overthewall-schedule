// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNaverCafePosts } from "./use-naver-cafe-posts";

const fetchNaverCafePostsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/naver-cafe", () => ({
  fetchNaverCafePosts: fetchNaverCafePostsMock,
}));

describe("useNaverCafePosts", () => {
  beforeEach(() => {
    fetchNaverCafePostsMock.mockReset();
  });

  it("enabled=false면 요청하지 않는다", async () => {
    const { result } = renderHook(() =>
      useNaverCafePosts({ enabled: false }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasLoaded).toBe(false);
    expect(fetchNaverCafePostsMock).not.toHaveBeenCalled();
  });

  it("조회 결과와 stale 상태를 반영하고 reload를 수행한다", async () => {
    fetchNaverCafePostsMock.mockResolvedValue({
      posts: [{ id: "post1" }],
      sources: [{ stale: true }],
      updatedAt: "2026-05-27T00:00:00Z",
    });

    const { result } = renderHook(() => useNaverCafePosts({ size: 7 }));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(fetchNaverCafePostsMock).toHaveBeenCalledWith({
      admin: false,
      force: false,
      size: 7,
    });
    expect(result.current.posts).toEqual([{ id: "post1" }]);
    expect(result.current.updatedAt).toBe("2026-05-27T00:00:00Z");
    expect(result.current.stale).toBe(true);

    await act(async () => {
      await result.current.reload();
    });
    expect(fetchNaverCafePostsMock).toHaveBeenLastCalledWith({
      admin: false,
      force: true,
      size: 7,
    });
  });
});
