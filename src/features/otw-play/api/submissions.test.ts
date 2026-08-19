import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOtwPlaySubmission,
  fetchMyOtwPlaySubmission,
  fetchMyOtwPlaySubmissions,
  preflightOtwPlaySubmission,
} from "./submissions";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));

describe("OTW Play member submission API", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ data: { items: [], nextCursor: null } });
  });

  it("uses required authentication and preserves submission payloads", async () => {
    const preflight = { youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" };
    const create = {
      clientRequestId: "d9428888-122b-4c2c-bb16-06ac47ec1d74",
      youtubeUrl: preflight.youtubeUrl,
      title: "Cover Song",
      suggestedSongId: null,
      originalArtists: [{ kind: "external" as const, displayName: "Artist" }],
      participants: [
        { kind: "member" as const, memberUid: 1, participantRole: "vocal" as const },
      ],
      note: null,
    };

    await preflightOtwPlaySubmission(preflight);
    await createOtwPlaySubmission(create);

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/submissions/preflight",
      { method: "POST", json: preflight, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/submissions",
      { method: "POST", json: create, auth: "required" },
    );
  });

  it("encodes member-owned pagination and detail routes", async () => {
    await fetchMyOtwPlaySubmissions({ limit: 50, cursor: "한 글 cursor" });
    await fetchMyOtwPlaySubmission("proposal / one");

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/submissions/mine?limit=50&cursor=%ED%95%9C+%EA%B8%80+cursor",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/submissions/proposal%20%2F%20one",
      { auth: "required" },
    );
  });
});
