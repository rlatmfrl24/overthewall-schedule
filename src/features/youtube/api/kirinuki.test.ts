import { beforeEach, expect, it, vi } from "vitest";
import { fetchKirinukiVideos } from "./kirinuki";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("requests kirinuki videos with the result limit", async () => {
    apiFetchMock.mockResolvedValueOnce({ updatedAt: "", videos: [], shorts: [], byChannel: [] });
    await fetchKirinukiVideos({ maxResults: 7 });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/kirinuki/videos?maxResults=7");
});
