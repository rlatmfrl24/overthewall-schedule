// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { YouTubeHistoryDto } from "@contracts/youtube";
import { YouTubeHistory } from "./youtube-history";
import { fetchYouTubeHistory } from "../../api/history";
vi.mock("../../api/history", () => ({ fetchYouTubeHistory: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("inspects retained metadata as read-only and drops the previous page on a denied next-page read", async () => {
  const data: YouTubeHistoryDto = { channels: [], nextCursor: "next", items: [{ videoId: "heldvod0001", title: "보관 다시보기", description: "보관 설명", thumbnailUrl: "", channelId: "channel", channelTitle: "채널", duration: 10, viewCount: 1, isShort: false, publishedAt: "2026-10-14", storedAt: "2026-10-14", available: false, contentAccess: "admin_archive", sourceKind: "official" }] };
  vi.mocked(fetchYouTubeHistory).mockResolvedValueOnce(data).mockRejectedValue(new Error("403"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><YouTubeHistory /></QueryClientProvider>);
  expect(await screen.findByText("보관 다시보기")).toBeTruthy();
  expect(screen.getByText("관리자 보관 · 읽기 전용")).toBeTruthy();
  fireEvent.click(screen.getByText("저장 메타데이터"));
  expect(view.container.querySelector("details")?.open).toBe(true);
  expect(view.container.textContent).toContain("보관 설명");
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("보관 다시보기")).toBeNull();
  await waitFor(() => expect(fetchYouTubeHistory).toHaveBeenLastCalledWith("", "next"));
  client.clear();
});
