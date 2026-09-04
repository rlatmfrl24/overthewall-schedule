// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { pressed: true }));
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
