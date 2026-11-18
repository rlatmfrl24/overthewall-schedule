import { beforeEach, expect, it, vi } from "vitest";
import { fetchYouTubeFeedStatus } from "./youtube-feed";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("YouTube feed status is a no-store admin snapshot", async () => {
    apiFetchMock.mockResolvedValueOnce({ updatedAt: 1 });
    await fetchYouTubeFeedStatus(168);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/youtube/feed/status?windowHours=168", { cache: "no-store" });
});
