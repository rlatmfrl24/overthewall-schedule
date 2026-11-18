import { beforeEach, expect, it, vi } from "vitest";
import { fetchSettings, updateSettings } from "./settings";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("reads settings without caching", async () => {
    apiFetchMock.mockResolvedValueOnce({});
    await fetchSettings();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings", {
        cache: "no-store",
    });
});
it("sends editable settings as a PUT payload", async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);
    await updateSettings({
        auto_update_enabled: "true",
        x_rich_link_preview_enabled: "false",
        x_posts_visibility: "public",
        x_collection_interval_hours: "6",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings", {
        method: "PUT",
        json: {
            auto_update_enabled: "true",
            x_rich_link_preview_enabled: "false",
            x_posts_visibility: "public",
            x_collection_interval_hours: "6",
        },
    });
});
