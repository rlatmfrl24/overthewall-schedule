// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("OtwPlayCatalogPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.useCatalog.mockReturnValue(catalogResult);
    mocks.useFacets.mockReturnValue({
      data: { data: { members: [], groups: [], originalArtists: [] } },
      isPending: false,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("exposes explicit ANY and ALL member semantics", () => {
    const onSearchChange = vi.fn();
    render(<OtwPlayCatalogPage search={{ member: "1,2" }} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByLabelText("멤버 조건"), { target: { value: "all" } });
    expect(onSearchChange).toHaveBeenCalledWith(
      { member: "1,2", memberMode: "all" },
      true,
    );
  });
});
