// @vitest-environment jsdom
import { createElement, type ComponentType, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../model/types";

const navigateMock = vi.hoisted(() => vi.fn());
// Exercise the rotation timer without waiting for a visual exit animation in jsdom.
vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", { href: "/notice" }, children),
  useNavigate: () => navigateMock,
}));

import { NoticeBanner } from "./notice-banner";

const makeNotice = (links: Notice["links"]): Notice => ({
  id: 38,
  content: "배너 공지",
  links,
  image_urls: [],
  related_member_uids: [],
  url: links[0]?.url ?? null,
  thumbnail_url: null,
  type: "notice",
  publisher_type: "otw",
  publisher_member_uid: null,
  is_active: true,
  is_featured: true,
  started_at: null,
  ended_at: null,
  created_at: "2026-08-03 00:00:00",
});

const renderBanner = (notice: Notice | Notice[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(NoticeBanner as ComponentType<{ notices?: Notice[] }>, {
        notices: Array.isArray(notice) ? notice : [notice],
      }),
    ),
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("NoticeBanner", () => {
  it("rotates visible notices every five seconds and keeps full long titles", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const first = { ...makeNotice([]), content: "첫 번째 공지" };
    const second = { ...makeNotice([]), id: 37, content: "아주 긴 공지 제목 ".repeat(30) };
    const inactive = { ...makeNotice([]), id: 40, content: "숨김 공지", is_active: false };
    const future = { ...makeNotice([]), id: 41, content: "예정 공지", started_at: "9999-01-01" };
    const expired = { ...makeNotice([]), id: 42, content: "지난 공지", ended_at: "2000-01-01" };
    renderBanner([second, inactive, future, expired, first]);
    expect(screen.getByText(first.content)).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText(first.content)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    const title = await screen.findByText(second.content.trim());
    expect(title.getAttribute("title")).toBe(second.content);
    expect(screen.getByText("2/2")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(await screen.findByText(first.content)).toBeTruthy();
    expect(screen.queryByText(inactive.content)).toBeNull();
    expect(screen.queryByText(future.content)).toBeNull();
    expect(screen.queryByText(expired.content)).toBeNull();
  });

  it("opens the URL directly only when exactly one link exists", () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    renderBanner(makeNotice([{ label: "바로가기", url: "https://example.com" }]));
    fireEvent.click(screen.getByRole("button", { name: "바로가기 링크 열기" }));
    expect(openMock).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it.each([
    [[]],
    [[
      { label: "A", url: "https://example.com/a" },
      { label: "B", url: "https://example.com/b" },
    ]],
  ])("routes zero or multiple links to the focused notice", (links) => {
    renderBanner(makeNotice(links));
    fireEvent.click(screen.getByRole("button", { name: "선택한 공지사항의 모든 콘텐츠 보기" }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/notice", search: { noticeId: 38 } });
  });
});
