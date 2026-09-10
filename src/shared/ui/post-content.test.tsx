// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostActions, PostMedia, PostText, type PostMediaItem } from "./post-content";

const url = "https://example.com/original";
const photos: PostMediaItem[] = Array.from({ length: 5 }, (_, index) => ({ src: `https://example.com/${index}.jpg`, alt: `사진 ${index + 1}`, kind: "photo" }));

describe("공통 게시글 UI", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("4개 타일에서 모든 사진을 탐색하고 방향키·Escape·포커스 복원을 지원한다", async () => {
    render(<PostMedia items={photos} title="멤버 사진" url={url} />);
    expect(screen.getAllByRole("button", { name: /이미지 \d 확대/ })).toHaveLength(4);
    expect(screen.getByText("+1")).toBeTruthy();
    const trigger = screen.getByRole("button", { name: /이미지 2 확대/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("2 / 5")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByText("3 / 5")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "이전 이미지" }));
    expect(within(dialog).getByText("2 / 5")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByText("5 / 5")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("사진 실패 시 안내와 원문 링크를 유지하며 단일 사진 이동은 비활성화한다", () => {
    render(<PostMedia items={photos.slice(0, 1)} title="사진" url={url} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("이미지를 불러오지 못했습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /확대/ }));
    expect((screen.getByRole("button", { name: "다음 이미지" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: /원문 보기/ }).getAttribute("href")).toBe(url);
  });

  it("동영상은 새 플레이어 없이 원문 링크로 열며 미리보기가 없는 목록도 안전하다", () => {
    const { rerender } = render(<PostMedia items={[]} title="영상" url={url} />);
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<PostMedia items={[{ ...photos[0], kind: "video" }]} title="영상" url={url} />);
    const link = screen.getByRole("link", { name: /원문에서 영상 보기/ });
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("button", { name: /확대/ })).toBeNull();
  });

  it("넘치는 본문만 펼치며 펼침 상태와 연결된 본문을 알린다", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    render(<PostText>긴 본문</PostText>);
    const more = screen.getByRole("button", { name: "더보기" });
    expect(more.getAttribute("aria-controls")).toBe(screen.getByText("긴 본문").id);
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "접기" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("긴 본문").className).not.toContain("line-clamp");
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.getByText("긴 본문").className).toContain("line-clamp-5");
  });

  it("짧은 본문은 불필요한 더보기 없이 표시한다", () => {
    render(<PostText lines={3}>짧은 본문</PostText>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("열어 둔 사진은 배경 데이터가 갱신되어도 유지한다", () => {
    const { rerender } = render(<PostMedia items={photos} title="사진" url={url} />);
    fireEvent.click(screen.getByRole("button", { name: /이미지 4 확대/ }));
    rerender(<PostMedia items={photos.slice(0, 1)} title="사진" url={url} />);
    expect(within(screen.getByRole("dialog")).getByRole("img").getAttribute("src")).toBe(photos[3].src);
    expect(within(screen.getByRole("dialog")).getByText("4 / 5")).toBeTruthy();
  });

  it.each(["success", "cancel", "failure"])("Web Share %s 처리와 복사 대체", async outcome => {
    const share = vi.fn().mockImplementation(async () => {
      if (outcome === "cancel") throw new DOMException("cancelled", "AbortError");
      if (outcome === "failure") throw new Error("unavailable");
    });
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    render(<PostActions title="글" url={url}>좋아요</PostActions>);
    fireEvent.click(screen.getByRole("button", { name: "글 공유" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "글", url, text: undefined }));
    if (outcome === "failure") await waitFor(() => expect(screen.getByRole("status").textContent).toBe("링크 복사됨"));
    else expect(copy).not.toHaveBeenCalled();
  });

  it("복사 실패를 알리고 원문 링크를 계속 제공한다", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<PostActions title="글" url={url}>좋아요</PostActions>);
    fireEvent.click(screen.getByRole("button", { name: "글 공유" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("링크 복사 실패"));
    expect(screen.getByRole("link", { name: /원문 보기/ }).getAttribute("href")).toBe(url);
  });
});
