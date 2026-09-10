// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: {
    configurable: true,
    value: () => false,
  },
  releasePointerCapture: {
    configurable: true,
    value: () => undefined,
  },
  scrollIntoView: {
    configurable: true,
    value: () => undefined,
  },
  setPointerCapture: {
    configurable: true,
    value: () => undefined,
  },
});

const mocks = vi.hoisted(() => ({
  useCatalog: vi.fn(),
  useFacets: vi.fn(),
}));

vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlayCatalog: mocks.useCatalog,
  useOtwPlayFacets: mocks.useFacets,
}));
vi.mock("./catalog-components", () => ({
  OtwPlaySongRow: () => null,
}));
vi.mock("./catalog-result-views", () => ({
  OtwPlaySongTable: ({ songs }: { songs: { id: string }[] }) => <div aria-label="곡 표 리스트">{songs.map(song => song.id).join(",")}</div>,
  OtwPlaySongGrid: ({ songs }: { songs: { id: string }[] }) => <div aria-label="곡 그리드">{songs.map(song => song.id).join(",")}</div>,
}));

import { OtwPlayCatalogPage } from "./catalog-page";

const catalogResult = {
  data: { pages: [{ data: { items: [] } }] },
  isPending: false,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

const member = {
  memberUid: 1,
  code: "member-1",
  displayName: "멤버 1",
  oshiMark: "🌙",
  unitName: null,
};

const openFilters = () => {
  fireEvent.click(
    screen.getByRole("button", { name: /^필터(?: \d+)?$/ }),
  );
};

const chooseSelectOption = (label: string, option: string) => {
  const trigger = screen.getByRole("combobox", { name: label });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: option }));
};

let intersect: (visible: boolean) => void;
const disconnect = vi.fn();

describe("OtwPlayCatalogPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.clearAllMocks();
    intersect = () => undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = (visible) => callback(
          [{ isIntersecting: visible } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    });
    mocks.useCatalog.mockReturnValue(catalogResult);
    mocks.useFacets.mockReturnValue({
      data: { data: { members: [], groups: [], originalArtists: [] } },
      isPending: false,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads near the list end once, waits for fetching, and stops at the final page", () => {
    const result = {
      ...catalogResult,
      data: { pages: [{ data: { items: [{ id: "first" }] } }] },
      hasNextPage: true,
      isFetching: false,
    };
    mocks.useCatalog.mockReturnValue(result);
    const page = render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    act(() => intersect(false));
    expect(catalogResult.fetchNextPage).not.toHaveBeenCalled();
    act(() => { intersect(true); intersect(true); });
    expect(catalogResult.fetchNextPage).toHaveBeenCalledTimes(1);
    mocks.useCatalog.mockReturnValue({ ...result, isFetching: true });
    page.rerender(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    act(() => intersect(true));
    expect(catalogResult.fetchNextPage).toHaveBeenCalledTimes(1);
    mocks.useCatalog.mockReturnValue(result);
    page.rerender(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    act(() => intersect(true));
    expect(catalogResult.fetchNextPage).toHaveBeenCalledTimes(2);
    mocks.useCatalog.mockReturnValue({ ...result, hasNextPage: false });
    page.rerender(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    act(() => intersect(true));
    expect(catalogResult.fetchNextPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("다음 곡 불러오기")).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });

  it("keeps loaded songs on pagination failure and retries only on request", () => {
    window.localStorage.setItem("otw-play:catalog-view:v1", "table");
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      data: { pages: [{ data: { items: [{ id: "first" }] } }] },
      hasNextPage: true, isError: true, isFetchNextPageError: true,
      error: new Error("network error"),
    });
    render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    expect(screen.getByLabelText("곡 표 리스트").textContent).toBe("first");
    act(() => intersect(true));
    expect(catalogResult.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    expect(catalogResult.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(catalogResult.refetch).not.toHaveBeenCalled();
  });

  it("remembers the view while preserving filters, loaded pages and query inputs", () => {
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      data: { pages: [{ data: { items: [{ id: "first" }] } }, { data: { items: [{ id: "second" }] } }] },
      hasNextPage: true,
    });
    const onSearchChange = vi.fn();
    const page = render(<OtwPlayCatalogPage search={{ q: "노래", sort: "title" }} onSearchChange={onSearchChange} />);
    expect(screen.getByRole("button", { name: "카드" }).getAttribute("aria-pressed")).toBe("true");
    const query = mocks.useCatalog.mock.lastCall?.[0];
    fireEvent.click(screen.getByRole("button", { name: "표 리스트" }));
    expect(screen.getByLabelText("곡 표 리스트").textContent).toBe("first,second");
    fireEvent.click(screen.getByRole("button", { name: "그리드" }));
    expect(screen.getByLabelText("곡 그리드").textContent).toBe("first,second");
    expect(mocks.useCatalog.mock.lastCall?.[0]).toBe(query);
    expect(catalogResult.refetch).not.toHaveBeenCalled();
    expect(onSearchChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("otw-play:catalog-view:v1")).toBe("grid");
    fireEvent.click(screen.getByRole("button", { name: "모두 초기화" }));
    expect(onSearchChange).toHaveBeenCalledWith({}, true);
    page.rerender(<OtwPlayCatalogPage search={{}} onSearchChange={onSearchChange} />);
    expect(screen.getByRole("button", { name: "그리드" }).getAttribute("aria-pressed")).toBe("true");
    act(() => intersect(true));
    expect(catalogResult.fetchNextPage).toHaveBeenCalledOnce();
    page.unmount();
    render(<OtwPlayCatalogPage search={{}} onSearchChange={onSearchChange} />);
    expect(screen.getByRole("button", { name: "그리드" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("uses cards for invalid storage and switches even when storage access fails", () => {
    window.localStorage.setItem("otw-play:catalog-view:v1", "invalid");
    const page = render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "카드" }).getAttribute("aria-pressed")).toBe("true");
    page.unmount();
    vi.spyOn(window.Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(window.Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "카드" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "표 리스트" }));
    expect(screen.getByRole("button", { name: "표 리스트" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps catalog results reachable while reporting and retrying a failed filter query", () => {
    const refetchFacets = vi.fn();
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      data: { pages: [{ data: { items: [{ id: "song-1" }] } }] },
    });
    mocks.useFacets.mockReturnValue({
      data: undefined, isPending: false, isError: true,
      error: new Error("filter request failed"), refetch: refetchFacets,
    });
    render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("필터를 불러오지 못했습니다.");
    expect(screen.queryByText("조건에 맞는 곡이 없습니다.")).toBeNull();
    expect(screen.getByRole("region", { name: "검색 결과" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 다시 불러오기" }));
    expect(refetchFacets).toHaveBeenCalledOnce();
    expect(catalogResult.refetch).not.toHaveBeenCalled();
    openFilters();
    expect(screen.getByRole("combobox", { name: "곡 관계" })).toBeTruthy();
  });

  it("does not block available catalog results while filters are loading", () => {
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      data: { pages: [{ data: { items: [{ id: "song-1" }] } }] },
    });
    mocks.useFacets.mockReturnValue({ data: undefined, isPending: true });
    render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);

    expect(screen.queryByText("곡 목록 불러오는 중")).toBeNull();
    expect(screen.getByText("필터 불러오는 중")).toBeTruthy();
    expect(screen.getByRole("region", { name: "검색 결과" })).toBeTruthy();
  });

  it("syncs search after 250ms but Enter applies immediately", () => {
    const onSearchChange = vi.fn();
    render(<OtwPlayCatalogPage search={{}} onSearchChange={onSearchChange} />);
    expect(screen.getByRole("heading", { name: "곡 검색" })).toBeTruthy();
    const input = screen.getByLabelText("곡 검색");
    fireEvent.change(input, { target: { value: "  노래  " } });
    act(() => vi.advanceTimersByTime(249));
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearchChange).toHaveBeenCalledWith({ q: "노래" }, true);

    onSearchChange.mockClear();
    fireEvent.change(input, { target: { value: "cover" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSearchChange).toHaveBeenCalledWith({ q: "cover" }, true);
  });

  it("cancels a pending search when all filters are reset", () => {
    const onSearchChange = vi.fn();
    render(
      <OtwPlayCatalogPage
        search={{ relation: "cover" }}
        onSearchChange={onSearchChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("곡 검색"), {
      target: { value: "다시 적용되면 안 됨" },
    });
    fireEvent.click(screen.getByRole("button", { name: "모두 초기화" }));
    act(() => vi.advanceTimersByTime(250));

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith({}, true);
    expect((screen.getByLabelText("곡 검색") as HTMLInputElement).value).toBe("");
  });

  it("keeps filters folded by default and exposes disclosure state", () => {
    render(<OtwPlayCatalogPage search={{}} onSearchChange={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "필터" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "카탈로그 필터" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "카탈로그 필터" })).toBeTruthy();
  });

  it("exposes explicit ANY and ALL member semantics", () => {
    const onSearchChange = vi.fn();
    mocks.useFacets.mockReturnValue({
      data: { data: { members: [member], groups: [], originalArtists: [] } },
      isPending: false,
    });
    render(<OtwPlayCatalogPage search={{ member: "1,2" }} onSearchChange={onSearchChange} />);
    openFilters();
    chooseSelectOption("멤버 조건", "선택 멤버 모두 참여");
    expect(onSearchChange).toHaveBeenCalledWith(
      { member: "1,2", memberMode: "all" },
      true,
    );
  });

  it("keeps participant identity and vocal role as separate URL filters", () => {
    const onSearchChange = vi.fn();
    render(
      <OtwPlayCatalogPage
        search={{ participant: "external-singer" }}
        onSearchChange={onSearchChange}
      />,
    );

    openFilters();
    chooseSelectOption("가창 역할", "코러스");
    expect(onSearchChange).toHaveBeenCalledWith(
      { participant: "external-singer", participantRole: "chorus" },
      true,
    );
  });

  it("shows active filter summaries while folded", () => {
    mocks.useFacets.mockReturnValue({
      data: { data: { members: [member], groups: [], originalArtists: [] } },
      isPending: false,
    });
    render(
      <OtwPlayCatalogPage
        search={{
          q: "노래",
          member: "1",
          memberMode: "all",
          participantRole: "vocal",
        }}
        onSearchChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "필터 3" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "카탈로그 필터" })).toBeNull();
    expect(screen.getByRole("button", { name: "멤버 · 멤버 1 필터 제거" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "가창 역할 · 메인 보컬 필터 제거" })).toBeTruthy();
  });

  it("clears member mode when the final selected member is removed", () => {
    const onSearchChange = vi.fn();
    mocks.useFacets.mockReturnValue({
      data: { data: { members: [member], groups: [], originalArtists: [] } },
      isPending: false,
    });
    render(
      <OtwPlayCatalogPage
        search={{ member: "1", memberMode: "all", relation: "cover" }}
        onSearchChange={onSearchChange}
      />,
    );

    openFilters();
    fireEvent.click(within(screen.getByRole("region", { name: "카탈로그 필터" })).getByRole("button", { pressed: true }));
    expect(onSearchChange).toHaveBeenCalledWith(
      {
        member: undefined,
        memberMode: undefined,
        relation: "cover",
      },
      true,
    );

    onSearchChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "필터 3" }));
    fireEvent.click(screen.getByRole("button", { name: "멤버 · 멤버 1 필터 제거" }));
    expect(onSearchChange).toHaveBeenCalledWith(
      {
        member: undefined,
        memberMode: undefined,
        relation: "cover",
      },
      true,
    );
  });
});
