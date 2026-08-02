// @vitest-environment jsdom
import { createElement, type ComponentType, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../model/types";

const navigateMock = vi.hoisted(() => vi.fn());
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

const renderBanner = (notice: Notice) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(NoticeBanner as ComponentType<{ notices?: Notice[] }>, {
        notices: [notice],
      }),
    ),
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoticeBanner", () => {
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
