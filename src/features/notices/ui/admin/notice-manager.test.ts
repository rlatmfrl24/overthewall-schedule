// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { NoticeManager } from "./notice-manager";

const fetchNoticesMock = vi.hoisted(() => vi.fn());
const fetchNoticeThumbnailStatusMock = vi.hoisted(() => vi.fn());
const cleanupUnusedNoticeThumbnailsMock = vi.hoisted(() => vi.fn());
const createNoticeMock = vi.hoisted(() => vi.fn());
const updateNoticeMock = vi.hoisted(() => vi.fn());
const deleteNoticeMock = vi.hoisted(() => vi.fn());
const setFeaturedNoticeMock = vi.hoisted(() => vi.fn());
const fetchActiveMembersMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/notices", () => ({
  cleanupUnusedNoticeThumbnails: cleanupUnusedNoticeThumbnailsMock,
  createNotice: createNoticeMock,
  deleteNotice: deleteNoticeMock,
  fetchNotices: fetchNoticesMock,
  fetchNoticeThumbnailStatus: fetchNoticeThumbnailStatusMock,
  setFeaturedNotice: setFeaturedNoticeMock,
  updateNotice: updateNoticeMock,
}));

vi.mock("@/features/members", () => ({
  fetchActiveMembers: fetchActiveMembersMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const makeThumbnailStatus = () => ({
  updatedAt: "2026-07-09T00:00:00.000Z",
  bucketConfigured: true,
  prefix: "notices/thumbnails/",
  maxBytes: 2_097_152,
  stats: {
    totalObjects: 1,
    referencedObjects: 0,
    unusedObjects: 1,
    missingReferencedObjects: 0,
    cleanupEligibleObjects: 1,
    totalBytes: 2_048,
    unusedBytes: 2_048,
    cleanupEligibleBytes: 2_048,
  },
  objects: [
    {
      key: "notices/thumbnails/unused.webp",
      url: "/r2-assets/notices/thumbnails/unused.webp",
      size: 2_048,
      uploadedAt: 1_788_000_000_000,
      referenced: false,
      referenceCount: 0,
      cleanupEligible: true,
    },
  ],
  missingReferences: [],
});

describe("NoticeManager", () => {
  beforeEach(() => {
    fetchNoticesMock.mockResolvedValue([]);
    fetchActiveMembersMock.mockResolvedValue([]);
    fetchNoticeThumbnailStatusMock.mockResolvedValue(makeThumbnailStatus());
    cleanupUnusedNoticeThumbnailsMock.mockResolvedValue({
      success: true,
      deletedCount: 1,
      failedCount: 0,
      deleted: ["notices/thumbnails/unused.webp"],
      failed: [],
      before: makeThumbnailStatus().stats,
    });
    setFeaturedNoticeMock.mockResolvedValue({ success: true, id: 2 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("미사용 R2 썸네일 정리는 확인 전까지 삭제 API를 호출하지 않는다", async () => {
    render(createElement(NoticeManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() =>
      expect(fetchNoticeThumbnailStatusMock).toHaveBeenCalled(),
    );

    const cleanupButton = screen.getByRole("button", {
      name: "미사용 정리",
    }) as HTMLButtonElement;
    await waitFor(() => expect(cleanupButton.disabled).toBe(false));
    fireEvent.click(cleanupButton);

    expect(cleanupUnusedNoticeThumbnailsMock).not.toHaveBeenCalled();
    expect(screen.getByText("미사용 썸네일 정리 확인")).toBeTruthy();
    expect(screen.getByText(/삭제 후에는 복구할 수 없습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "정리" }));

    await waitFor(() =>
      expect(cleanupUnusedNoticeThumbnailsMock).toHaveBeenCalledTimes(1),
    );
  });

  it("공지 테이블에서 대표 공지를 하나만 선택한다", async () => {
    fetchNoticesMock.mockResolvedValue([
      {
        id: 2,
        content: "새 대표 후보",
        url: null,
        thumbnail_url: null,
        type: "notice",
        publisher_type: "otw",
        publisher_member_uid: null,
        is_active: true,
        is_featured: false,
        started_at: null,
        ended_at: null,
        created_at: "2026-07-14T00:00:00.000Z",
      },
      {
        id: 1,
        content: "기존 대표 공지",
        url: null,
        thumbnail_url: null,
        type: "notice",
        publisher_type: "otw",
        publisher_member_uid: null,
        is_active: true,
        is_featured: true,
        started_at: null,
        ended_at: null,
        created_at: "2026-07-13T00:00:00.000Z",
      },
    ]);

    render(createElement(NoticeManager), {
      wrapper: createQueryWrapper(),
    });

    const selectButton = await screen.findByRole("button", { name: "선택" });
    expect(screen.getByRole("button", { name: "선택됨" })).toBeTruthy();

    fireEvent.click(selectButton);

    await waitFor(() => expect(setFeaturedNoticeMock).toHaveBeenCalledWith(2));
    await waitFor(() => expect(fetchNoticesMock).toHaveBeenCalledTimes(2));
  });

  it("관리자 목록에 관련 멤버와 이미지·링크 개수를 요약한다", async () => {
    fetchActiveMembersMock.mockResolvedValue([
      { uid: 1, name: "하나", code: "one", oshi_mark: "🌙" },
      { uid: 2, name: "둘", code: "two", oshi_mark: null },
    ]);
    fetchNoticesMock.mockResolvedValue([
      {
        id: 38,
        content: "다중 공지",
        links: [
          { label: "첫 링크", url: "https://example.com/one" },
          { label: "둘째 링크", url: "https://example.com/two" },
        ],
        image_urls: ["https://img.example.com/one.webp", "/two.webp"],
        related_member_uids: [1, 2],
        url: "https://example.com/one",
        thumbnail_url: "https://img.example.com/one.webp",
        type: "notice",
        publisher_type: "otw",
        publisher_member_uid: null,
        is_active: true,
        is_featured: true,
        started_at: null,
        ended_at: null,
        created_at: "2026-08-03T00:00:00.000Z",
      },
    ]);

    render(createElement(NoticeManager), { wrapper: createQueryWrapper() });

    expect(await screen.findByText("🌙 하나, 둘")).toBeTruthy();
    expect(screen.getByText("외부 · 2장")).toBeTruthy();
    expect(screen.getByText("첫 링크 외 1개")).toBeTruthy();
  });

  it("관리자 목록에서 두 번째 이후 이미지의 R2 누락도 표시한다", async () => {
    fetchNoticesMock.mockResolvedValue([
      {
        id: 38,
        content: "다중 R2 이미지 공지",
        links: [],
        image_urls: [
          "/r2-assets/notices/thumbnails/one.webp",
          "/r2-assets/notices/thumbnails/two.webp",
        ],
        related_member_uids: [],
        url: null,
        thumbnail_url: "/r2-assets/notices/thumbnails/one.webp",
        type: "notice",
        publisher_type: "otw",
        publisher_member_uid: null,
        is_active: true,
        is_featured: true,
        started_at: null,
        ended_at: null,
        created_at: "2026-08-03T00:00:00.000Z",
      },
    ]);
    fetchNoticeThumbnailStatusMock.mockResolvedValue({
      ...makeThumbnailStatus(),
      stats: {
        ...makeThumbnailStatus().stats,
        totalObjects: 1,
        referencedObjects: 1,
        unusedObjects: 0,
        missingReferencedObjects: 1,
        cleanupEligibleObjects: 0,
      },
      objects: [
        {
          key: "notices/thumbnails/one.webp",
          url: "/r2-assets/notices/thumbnails/one.webp",
          size: 2_048,
          uploadedAt: 1_788_000_000_000,
          referenced: true,
          referenceCount: 1,
          cleanupEligible: false,
        },
      ],
      missingReferences: [
        {
          key: "notices/thumbnails/two.webp",
          url: "/r2-assets/notices/thumbnails/two.webp",
          referenceCount: 1,
        },
      ],
    });

    render(createElement(NoticeManager), { wrapper: createQueryWrapper() });

    expect(await screen.findByText("누락 1/2장")).toBeTruthy();
    expect(screen.queryByText("R2 정상 · 2장")).toBeNull();
  });
});
