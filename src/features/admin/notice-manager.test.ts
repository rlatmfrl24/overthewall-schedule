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
const fetchActiveMembersMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/notices", () => ({
  cleanupUnusedNoticeThumbnails: cleanupUnusedNoticeThumbnailsMock,
  createNotice: createNoticeMock,
  deleteNotice: deleteNoticeMock,
  fetchNotices: fetchNoticesMock,
  fetchNoticeThumbnailStatus: fetchNoticeThumbnailStatusMock,
  updateNotice: updateNoticeMock,
}));

vi.mock("@/lib/api/members", () => ({
  fetchActiveMembers: fetchActiveMembersMock,
}));

vi.mock("@/components/ui/toast", () => ({
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

    fireEvent.click(screen.getByRole("button", { name: "미사용 정리" }));

    expect(cleanupUnusedNoticeThumbnailsMock).not.toHaveBeenCalled();
    expect(screen.getByText("미사용 썸네일 정리 확인")).toBeTruthy();
    expect(screen.getByText(/삭제 후에는 복구할 수 없습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "정리" }));

    await waitFor(() =>
      expect(cleanupUnusedNoticeThumbnailsMock).toHaveBeenCalledTimes(1),
    );
  });
});
