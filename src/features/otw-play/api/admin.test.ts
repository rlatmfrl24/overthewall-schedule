import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOtwPlayPerformance,
  fetchOtwPlayAdminCatalog,
  fetchOtwPlayAdminProposals,
  publishOtwPlayPerformance,
  rejectOtwPlayProposal,
} from "./admin";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));

describe("OTW Play admin API", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ data: {} });
  });

  it("always uses required authentication", async () => {
    await fetchOtwPlayAdminCatalog();
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/catalog",
      { auth: "required" },
    );
  });

  it("serializes the optional proposal status filter without changing auth", async () => {
    await fetchOtwPlayAdminProposals();
    await fetchOtwPlayAdminProposals("pending_review");

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/submissions",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/submissions?status=pending_review",
      { auth: "required" },
    );
  });

  it("preserves the complete draft command payload", async () => {
    const input = {
      songId: "song-1",
      relationType: "cover" as const,
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      qualityStatus: "ok" as const,
      releasedAt: null,
      participants: [{
        entityId: "entity-1",
        participantRole: "vocal" as const,
        creditOrder: 0,
        creditNameSnapshot: "Singer",
      }],
      source: {
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        channelId: "channel-1",
        startSeconds: 0,
        sourceRole: "official" as const,
      },
    };
    await createOtwPlayPerformance(input);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/performances",
      { method: "POST", json: input, auth: "required" },
    );
  });

  it("encodes dynamic command identifiers and expected versions", async () => {
    await publishOtwPlayPerformance("performance / one", { expectedVersion: 3 });
    await rejectOtwPlayProposal("proposal / one", {
      expectedVersion: 2,
      resultCode: "duplicate",
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/performances/performance%20%2F%20one/publish",
      { method: "POST", json: { expectedVersion: 3 }, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/submissions/proposal%20%2F%20one/reject",
      {
        method: "POST",
        json: { expectedVersion: 2, resultCode: "duplicate" },
        auth: "required",
      },
    );
  });
});
