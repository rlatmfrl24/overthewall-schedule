// @vitest-environment jsdom
import { createElement, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/features/members";
import type { Notice } from "../model/types";

const useNoticePageDataMock = vi.hoisted(() => vi.fn());
vi.mock("../queries/use-notice-page-data", () => ({ useNoticePageData: useNoticePageDataMock }));

import { NoticePage } from "./notice-page";

const makeNotice = (overrides: Partial<Notice> = {}): Notice => ({
  id: 1,
  content: "다중 콘텐츠 공지",
  links: [
    { label: "공식 페이지", url: "https://example.com/official" },
    { label: "신청 페이지", url: "https://example.com/apply" },
  ],
  image_urls: ["/one.webp", "/two.webp"],
  related_member_uids: [10, 20],
  url: "https://example.com/official",
  thumbnail_url: "/one.webp",
  type: "event",
  publisher_type: "otw",
  publisher_member_uid: null,
  is_active: true,
  is_featured: true,
  started_at: null,
  ended_at: null,
  created_at: "2026-08-03 00:00:00",
  ...overrides,
});

const memberMap = new Map<number, Member>([
  [10, { uid: 10, name: "하나", code: "one", oshi_mark: "🌙" } as Member],
  [20, { uid: 20, name: "둘", code: "two", oshi_mark: null } as Member],
]);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoticePage", () => {
  it("shows every named link and related member, and advances the manual carousel", () => {
    useNoticePageDataMock.mockReturnValue({ notices: [makeNotice()], memberMap, loading: false, error: null, refetch: vi.fn() });
    render(createElement(NoticePage));

    expect(screen.getByRole("link", { name: /공식 페이지/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /신청 페이지/ })).toBeTruthy();
    const noticeLinks = screen.getAllByRole("link", { name: /페이지/ });
    expect(noticeLinks[0].className).toBe(noticeLinks[1].className);
    expect(noticeLinks[0].className).toContain("border");
    expect(screen.getByText("🌙 하나")).toBeTruthy();
    expect(screen.getByText("둘")).toBeTruthy();
    expect(screen.getByRole("img", { name: /이미지 1/ }).getAttribute("src")).toBe("/one.webp");
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 이미지" }));
    expect(screen.getByRole("img", { name: /이미지 2/ }).getAttribute("src")).toBe("/two.webp");
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("clamps the carousel when the same notice is refreshed with fewer images", () => {
    let currentNotices = [makeNotice()];
    useNoticePageDataMock.mockImplementation(() => ({
      notices: currentNotices,
      memberMap,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }));
    const { rerender } = render(createElement(NoticePage));

    fireEvent.click(screen.getByRole("button", { name: "다음 이미지" }));
    expect(
      screen.getByRole("img", { name: /이미지 2/ }).getAttribute("src"),
    ).toBe("/two.webp");

    currentNotices = [
      makeNotice({
        image_urls: ["/remaining.webp"],
        thumbnail_url: "/remaining.webp",
      }),
    ];
    rerender(createElement(NoticePage));

    expect(
      screen.getByRole("img", { name: /이미지 1/ }).getAttribute("src"),
    ).toBe("/remaining.webp");
    expect(screen.queryByRole("button", { name: "다음 이미지" })).toBeNull();
  });

  it("temporarily promotes the notice selected by noticeId", () => {
    useNoticePageDataMock.mockReturnValue({
      notices: [
        makeNotice({ id: 1, content: "원래 대표", is_featured: true }),
        makeNotice({ id: 2, content: "배너에서 선택", is_featured: false }),
      ],
      memberMap,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const { container } = render(
      createElement(
        NoticePage as ComponentType<{ focusedNoticeId?: number }>,
        { focusedNoticeId: 2 },
      ),
    );
    const focusedCard = container.querySelector('[data-focused-notice="true"]');
    expect(focusedCard?.textContent).toContain("배너에서 선택");
    expect(screen.getByText("선택한 안내")).toBeTruthy();
  });

  it("uses the OTW placeholder instead of a related member profile when no image exists", () => {
    useNoticePageDataMock.mockReturnValue({
      notices: [makeNotice({ image_urls: [], thumbnail_url: null })],
      memberMap,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(createElement(NoticePage));
    expect(screen.getByRole("img", { name: "OTW" }).getAttribute("src")).toBe("/logo_otw.svg");
    expect(screen.queryByRole("button", { name: "다음 이미지" })).toBeNull();
  });
});
