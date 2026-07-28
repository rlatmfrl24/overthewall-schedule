// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { useNaverCafePosts } from "./use-naver-cafe-posts";

const fetchNaverCafePostsMock = vi.hoisted(() => vi.fn());

vi.mock("../api/naver-cafe-api", () => ({
  fetchNaverCafePosts: fetchNaverCafePostsMock,
}));

describe("useNaverCafePosts", () => {
  beforeEach(() => {
    fetchNaverCafePostsMock.mockReset();
  });

  it("enabled=false면 요청하지 않는다", async () => {
    const { result } = renderHook(() =>
      useNaverCafePosts({ enabled: false }),
      { wrapper: createQueryWrapper() },
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

    const { result } = renderHook(() => useNaverCafePosts({ size: 7 }), {
      wrapper: createQueryWrapper(),
    });

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

  it("기존 데이터가 있는 reload 실패는 stale 상태로 표시한다", async () => {
    fetchNaverCafePostsMock
      .mockResolvedValueOnce({
        posts: [{ id: "post1" }],
        sources: [{ stale: false }],
        updatedAt: "2026-05-27T00:00:00Z",
      })
      .mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useNaverCafePosts(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow("network");
    });

    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.posts).toEqual([{ id: "post1" }]);
  });
});
