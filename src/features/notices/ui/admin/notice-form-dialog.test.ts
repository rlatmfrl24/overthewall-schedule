// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/features/members";
import { NoticeFormDialog } from "./notice-form-dialog";
import { NOTICE_THUMBNAIL_ACCEPT, NOTICE_THUMBNAIL_MAX_BYTES } from "../../model/notice-thumbnails";
import type { Notice } from "../../model/types";

const uploadNoticeThumbnailMock = vi.hoisted(() => vi.fn());
const deleteNoticeThumbnailMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/notices", () => ({
  deleteNoticeThumbnail: deleteNoticeThumbnailMock,
  uploadNoticeThumbnail: uploadNoticeThumbnailMock,
}));

const members = [
  { uid: 1, name: "멤버 하나", code: "one", oshi_mark: "🌙" },
  { uid: 2, name: "멤버 둘", code: "two", oshi_mark: null },
] as Member[];

const makeClipboardItem = (file: File) => ({
  kind: "file",
  type: file.type,
  getAsFile: () => file,
});

describe("NoticeFormDialog", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    uploadNoticeThumbnailMock.mockResolvedValue({
      thumbnail_url: "/r2-assets/notices/thumbnails/uploaded.webp",
    });
    deleteNoticeThumbnailMock.mockResolvedValue({ deleted: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows multi-link, multi-image, and related-member controls", () => {
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit: vi.fn(), members }));

    expect(screen.getByRole("button", { name: "링크 추가" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "파일 선택" })).toBeTruthy();
    expect(screen.getByLabelText("이미지 URL")).toBeTruthy();
    expect(screen.getByText("관련 멤버")).toBeTruthy();
    const fileInput = screen.getByLabelText("공지 이미지 파일") as HTMLInputElement;
    expect(fileInput.multiple).toBe(true);
    expect(fileInput.accept).toBe(NOTICE_THUMBNAIL_ACCEPT);
  });

  it("loads and reorders existing links and images", async () => {
    const notice = {
      id: 1,
      content: "공지",
      links: [
        { label: "첫 링크", url: "https://example.com/first" },
        { label: "둘째 링크", url: "https://example.com/second" },
      ],
      image_urls: ["/first.webp", "/second.webp"],
      related_member_uids: [1],
      url: "https://example.com/first",
      thumbnail_url: "/first.webp",
      type: "notice",
      publisher_type: "otw",
      publisher_member_uid: null,
      is_active: true,
      is_featured: false,
      started_at: null,
      ended_at: null,
      created_at: null,
    } as Notice;
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit, initialValues: notice, members }));

    fireEvent.click(screen.getByRole("button", { name: "링크 2 위로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "이미지 2 위로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      links: [
        { label: "둘째 링크", url: "https://example.com/second" },
        { label: "첫 링크", url: "https://example.com/first" },
      ],
      image_urls: ["/second.webp", "/first.webp"],
      related_member_uids: [1],
    });
  });

  it("adds, removes, and submits named links", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit, members: [] }));
    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "새 공지" } });
    fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
    fireEvent.change(screen.getByLabelText("링크 1 이름"), { target: { value: "공식 페이지" } });
    fireEvent.change(screen.getByLabelText("링크 1 URL"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "링크 2 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "공지 등록" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].links).toEqual([
      { label: "공식 페이지", url: "https://example.com" },
    ]);
  });

  it("uploads multiple files sequentially and keeps successful results", async () => {
    uploadNoticeThumbnailMock
      .mockResolvedValueOnce({ thumbnail_url: "/one.webp" })
      .mockRejectedValueOnce(Object.assign(new Error("failed"), { status: 500 }))
      .mockResolvedValueOnce({ thumbnail_url: "/three.webp" });
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit: vi.fn(), members: [] }));
    const files = [
      new File(["1"], "one.png", { type: "image/png" }),
      new File(["2"], "two.png", { type: "image/png" }),
      new File(["3"], "three.png", { type: "image/png" }),
    ];
    fireEvent.change(screen.getByLabelText("공지 이미지 파일"), { target: { files } });

    await waitFor(() => expect(uploadNoticeThumbnailMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("img", { name: "공지 이미지 1" }).getAttribute("src")).toBe("/one.webp");
    expect(screen.getByRole("img", { name: "공지 이미지 2" }).getAttribute("src")).toBe("/three.webp");
    expect(screen.getByRole("status").textContent).toContain("2개 업로드 완료");
    expect(screen.getByRole("status").textContent).toContain("two.png");
  });

  it("continues to a valid file when an earlier file does not consume the last slot", async () => {
    const existingImages = Array.from(
      { length: 9 },
      (_, index) => `/existing-${index + 1}.webp`,
    );
    const notice = {
      id: 1,
      content: "공지",
      links: [],
      image_urls: existingImages,
      related_member_uids: [],
      url: null,
      thumbnail_url: existingImages[0],
      type: "notice",
      publisher_type: "otw",
      publisher_member_uid: null,
      is_active: true,
      is_featured: false,
      started_at: null,
      ended_at: null,
      created_at: null,
    } as Notice;
    uploadNoticeThumbnailMock.mockResolvedValueOnce({
      thumbnail_url: "/tenth.webp",
    });
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(),
        initialValues: notice,
        members: [],
      }),
    );

    fireEvent.change(screen.getByLabelText("공지 이미지 파일"), {
      target: {
        files: [
          new File(["invalid"], "invalid.gif", { type: "image/gif" }),
          new File(["valid"], "valid.png", { type: "image/png" }),
        ],
      },
    });

    await waitFor(() =>
      expect(uploadNoticeThumbnailMock).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByRole("img", { name: "공지 이미지 10" }).getAttribute("src"),
    ).toBe("/tenth.webp");
    expect(screen.getByRole("status").textContent).toContain("invalid.gif");
    expect(screen.getByRole("status").textContent).not.toContain(
      "최대 개수를 초과",
    );
  });

  it("accepts multiple clipboard images and rejects an oversized file individually", async () => {
    uploadNoticeThumbnailMock
      .mockResolvedValueOnce({ thumbnail_url: "/paste-one.webp" })
      .mockResolvedValueOnce({ thumbnail_url: "/paste-two.webp" });
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit: vi.fn(), members: [] }));
    const one = new File(["1"], "one.png", { type: "image/png" });
    const two = new File(["2"], "two.jpg", { type: "image/jpeg" });
    const large = new File([new Uint8Array(NOTICE_THUMBNAIL_MAX_BYTES + 1)], "large.png", { type: "image/png" });
    fireEvent.paste(document.querySelector("form")!, {
      clipboardData: { items: [makeClipboardItem(one), makeClipboardItem(large), makeClipboardItem(two)] },
    });

    await waitFor(() => expect(uploadNoticeThumbnailMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status").textContent).toContain("large.png");
    expect(screen.getByRole("status").textContent).toContain("2MB 이하");
  });

  it("cleans up every newly uploaded image when cancelled", async () => {
    uploadNoticeThumbnailMock
      .mockResolvedValueOnce({ thumbnail_url: "/one.webp" })
      .mockResolvedValueOnce({ thumbnail_url: "/two.webp" });
    const onOpenChange = vi.fn();
    render(createElement(NoticeFormDialog, { open: true, onOpenChange, onSubmit: vi.fn(), members: [] }));
    const files = [
      new File(["1"], "one.png", { type: "image/png" }),
      new File(["2"], "two.png", { type: "image/png" }),
    ];
    fireEvent.change(screen.getByLabelText("공지 이미지 파일"), { target: { files } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(deleteNoticeThumbnailMock).toHaveBeenCalledWith("/one.webp");
    expect(deleteNoticeThumbnailMock).toHaveBeenCalledWith("/two.webp");
  });

  it("submits all selected members and preserves saved uploads", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(createElement(NoticeFormDialog, { open: true, onOpenChange: vi.fn(), onSubmit, members }));
    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "멤버 공지" } });
    fireEvent.click(screen.getByText("🌙 멤버 하나"));
    fireEvent.click(screen.getByText("멤버 둘"));
    const image = new File(["image"], "saved.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("공지 이미지 파일"), { target: { files: [image] } });
    await waitFor(() => expect(screen.getByRole("img", { name: "공지 이미지 1" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "공지 등록" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      related_member_uids: [1, 2],
      image_urls: ["/r2-assets/notices/thumbnails/uploaded.webp"],
    });
    expect(deleteNoticeThumbnailMock).not.toHaveBeenCalled();
  });
});
