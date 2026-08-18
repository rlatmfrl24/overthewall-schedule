// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useOtwPlayCatalog,
  OtwPlayCatalogRequestProvider,
  useOtwPlayConfig,
  useOtwPlayFacets,
  useOtwPlayPerformance,
  useOtwPlaySong,
} from "./use-public-catalog";

const apiMocks = vi.hoisted(() => ({
  fetchOtwPlayCatalog: vi.fn(),
  fetchOtwPlayConfig: vi.fn(),
  fetchOtwPlayFacets: vi.fn(),
  fetchOtwPlayPerformance: vi.fn(),
  fetchOtwPlaySong: vi.fn(),
  getOtwPlayCatalogQueryKey: vi.fn(() => "member=1&relation=cover"),
}));

vi.mock("../api/public", () => apiMocks);

const envelope = (data: unknown, nextCursor: string | null = null) => ({
  data,
  nextCursor,
  catalogRevision: 7,
  generatedAt: "2026-08-11T00:00:00.000Z",
});

const createWrapper = (adminPreview = false) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        OtwPlayCatalogRequestProvider,
        { adminPreview, children },
      ),
    );
  };
};

describe("OTW Play public queries", () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMocks)) {
      mock.mockClear();
    }
    apiMocks.getOtwPlayCatalogQueryKey.mockReturnValue(
      "member=1&relation=cover",
    );
  });

  it("catalog cursor를 infinite query page parameter로만 전달한다", async () => {
    apiMocks.fetchOtwPlayCatalog
      .mockResolvedValueOnce(envelope({ items: [] }, "cursor-2"))
      .mockResolvedValueOnce(envelope({ items: [] }));

    const { result } = renderHook(
      () => useOtwPlayCatalog({ member: [1], relation: "cover" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiMocks.getOtwPlayCatalogQueryKey).toHaveBeenCalledWith({
      member: [1],
      relation: "cover",
    });
    expect(apiMocks.fetchOtwPlayCatalog).toHaveBeenNthCalledWith(
      1,
      {
        member: [1],
        relation: "cover",
        cursor: undefined,
      },
      { adminPreview: false },
    );
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(apiMocks.fetchOtwPlayCatalog).toHaveBeenNthCalledWith(
      2,
      {
        member: [1],
        relation: "cover",
        cursor: "cursor-2",
      },
      { adminPreview: false },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  });

  it("config, facets, song과 performance를 독립 query로 읽는다", async () => {
    apiMocks.fetchOtwPlayConfig.mockResolvedValue(
      envelope({ publicReadEnabled: false, navigationVisible: false }),
    );
    apiMocks.fetchOtwPlayFacets.mockResolvedValue(
      envelope({ members: [], groups: [], originalArtists: [] }),
    );
    apiMocks.fetchOtwPlaySong.mockResolvedValue(
      envelope({ id: "song-1", performances: [] }),
    );
    apiMocks.fetchOtwPlayPerformance.mockResolvedValue(
      envelope({ id: "performance-1" }),
    );

    const { result } = renderHook(
      () => ({
        config: useOtwPlayConfig(),
        facets: useOtwPlayFacets(),
        song: useOtwPlaySong("song-slug"),
        performance: useOtwPlayPerformance("performance-1"),
      }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.config.isSuccess).toBe(true);
      expect(result.current.facets.isSuccess).toBe(true);
      expect(result.current.song.isSuccess).toBe(true);
      expect(result.current.performance.isSuccess).toBe(true);
    });

    expect(apiMocks.fetchOtwPlayConfig).toHaveBeenCalledOnce();
    expect(apiMocks.fetchOtwPlayFacets).toHaveBeenCalledOnce();
    expect(apiMocks.fetchOtwPlayConfig).toHaveBeenCalledWith({
      adminPreview: false,
    });
    expect(apiMocks.fetchOtwPlayFacets).toHaveBeenCalledWith({
      adminPreview: false,
    });
    expect(apiMocks.fetchOtwPlaySong).toHaveBeenCalledWith("song-slug", {
      adminPreview: false,
    });
    expect(apiMocks.fetchOtwPlayPerformance).toHaveBeenCalledWith(
      "performance-1",
      { adminPreview: false },
    );
  });

  it("관리자 미리보기 요청을 별도 query audience로 전달한다", async () => {
    apiMocks.fetchOtwPlayConfig.mockResolvedValue(
      envelope({ publicReadEnabled: false, navigationVisible: false }),
    );

    const { result } = renderHook(() => useOtwPlayConfig(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiMocks.fetchOtwPlayConfig).toHaveBeenCalledWith({
      adminPreview: true,
    });
  });

  it("빈 song slug와 performance ID는 request를 시작하지 않는다", () => {
    const { result } = renderHook(
      () => ({
        song: useOtwPlaySong("  "),
        performance: useOtwPlayPerformance(""),
      }),
      { wrapper: createWrapper() },
    );

    expect(result.current.song.fetchStatus).toBe("idle");
    expect(result.current.performance.fetchStatus).toBe("idle");
    expect(apiMocks.fetchOtwPlaySong).not.toHaveBeenCalled();
    expect(apiMocks.fetchOtwPlayPerformance).not.toHaveBeenCalled();
  });
});
