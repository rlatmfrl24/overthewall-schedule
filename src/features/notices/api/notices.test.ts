import { beforeEach, expect, it, vi } from "vitest";
import { createNotice, deleteNotice, deleteNoticeThumbnail, fetchNotices, setFeaturedNotice, updateNotice, uploadNoticeThumbnail } from "./notices";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("reads active notices", async () => {
    await fetchNotices();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices", {
        cache: "no-store",
    });
});
it("includes inactive notices only when requested", async () => {
    await fetchNotices({ includeInactive: true });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices?includeInactive=1", { cache: "no-store" });
});
it("normalizes an inactive member notice before creation", async () => {
    await createNotice({
        content: "공지",
        type: "notice",
        thumbnail_url: "/profile/member.webp",
        publisher_type: "member",
        publisher_member_uid: 1,
        is_active: 0,
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices", {
        method: "POST",
        json: expect.objectContaining({
            is_active: "0",
            thumbnail_url: "/profile/member.webp",
            publisher_type: "member",
            publisher_member_uid: 1,
        }),
    });
});
it("normalizes an active site notice before update", async () => {
    await updateNotice({
        id: 9,
        content: "이벤트",
        type: "event",
        thumbnail_url: "https://example.com/event.jpg",
        publisher_type: "otw",
        publisher_member_uid: null,
        is_active: true,
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices", {
        method: "PUT",
        json: expect.objectContaining({
            is_active: "1",
            thumbnail_url: "https://example.com/event.jpg",
            publisher_type: "otw",
            publisher_member_uid: null,
        }),
    });
});
it("deletes the selected notice", async () => {
    await deleteNotice(9);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices?id=9", {
        method: "DELETE",
    });
});
it("sets the featured notice", async () => {
    await setFeaturedNotice(8);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices/featured", {
        method: "PUT",
        json: { id: 8 },
    });
});
it("uploads a thumbnail as form data", async () => {
    const thumbnailFile = new File(["thumb"], "thumb.png", {
        type: "image/png",
    });
    await uploadNoticeThumbnail(thumbnailFile);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices/thumbnail", {
        method: "POST",
        body: expect.any(FormData),
    });
});
it("deletes the selected thumbnail", async () => {
    await deleteNoticeThumbnail("/r2-assets/notices/thumbnails/thumb.png");
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/notices/thumbnail", {
        method: "DELETE",
        json: {
            thumbnail_url: "/r2-assets/notices/thumbnails/thumb.png",
        },
    });
});
