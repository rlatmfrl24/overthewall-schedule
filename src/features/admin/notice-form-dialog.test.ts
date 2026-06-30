// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NoticeFormDialog } from "./notice-form-dialog";
import { NOTICE_THUMBNAIL_ACCEPT } from "@/lib/notice-thumbnails";
import type { Notice } from "@/db/schema";

const uploadNoticeThumbnailMock = vi.hoisted(() => vi.fn());
const deleteNoticeThumbnailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/notices", () => ({
  deleteNoticeThumbnail: deleteNoticeThumbnailMock,
  uploadNoticeThumbnail: uploadNoticeThumbnailMock,
}));

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

  it("shows thumbnail upload controls and keeps external URL entry available", () => {
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(),
        members: [],
      }),
    );

    expect(screen.getByText("썸네일 이미지")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이미지 업로드" })).toBeTruthy();
    expect(screen.getByLabelText("썸네일 이미지")).toBeTruthy();
    expect(
      document.querySelector('input[type="file"]')?.getAttribute("accept"),
    ).toBe(NOTICE_THUMBNAIL_ACCEPT);
  });

  it("renders the existing thumbnail as a preview when editing", () => {
    const notice = {
      id: 1,
      content: "공지",
      url: null,
      thumbnail_url: "/r2-assets/notices/thumbnails/current.webp",
      type: "notice",
      publisher_type: "otw",
      publisher_member_uid: null,
      is_active: true,
      started_at: null,
      ended_at: null,
      created_at: null,
    } as Notice;
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(),
        initialValues: notice,
        members: [],
      }),
    );

    const preview = document.querySelector("img");

    expect(preview?.getAttribute("src")).toBe(
      "/r2-assets/notices/thumbnails/current.webp",
    );
    expect(screen.getByRole("button", { name: "제거" })).toBeTruthy();
  });

  it("uploads a pasted clipboard image and updates the thumbnail URL", async () => {
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(),
        members: [],
      }),
    );
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    const form = document.querySelector("form");

    expect(form).toBeTruthy();

    fireEvent.paste(form!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() =>
      expect(uploadNoticeThumbnailMock).toHaveBeenCalledWith(file),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("썸네일 이미지")).toHaveProperty(
        "value",
        "/r2-assets/notices/thumbnails/uploaded.webp",
      ),
    );
  });

  it("cleans up an uploaded thumbnail when the dialog is cancelled", async () => {
    const onOpenChange = vi.fn();
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange,
        onSubmit: vi.fn(),
        members: [],
      }),
    );
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    const form = document.querySelector("form");

    fireEvent.paste(form!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("썸네일 이미지")).toHaveProperty(
        "value",
        "/r2-assets/notices/thumbnails/uploaded.webp",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(deleteNoticeThumbnailMock).toHaveBeenCalledWith(
      "/r2-assets/notices/thumbnails/uploaded.webp",
    );
  });

  it("keeps the uploaded thumbnail when it is submitted as the notice thumbnail", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(NoticeFormDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit,
        members: [],
      }),
    );
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    const form = document.querySelector("form");

    fireEvent.change(screen.getByLabelText("내용"), {
      target: { value: "새 공지" },
    });
    fireEvent.paste(form!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("썸네일 이미지")).toHaveProperty(
        "value",
        "/r2-assets/notices/thumbnails/uploaded.webp",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(deleteNoticeThumbnailMock).not.toHaveBeenCalled();
  });
});
