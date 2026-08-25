import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillOtwPlayChannelMonitor,
  createOtwPlayCatalogEntry,
  createOtwPlayChannelMonitor,
  convertOtwPlayImportCandidates,
  createOtwPlayPerformance,
  deleteOtwPlayPerformance,
  deleteOtwPlaySong,
  deleteOtwPlayChannelMonitor,
  fetchOtwPlayAdminCatalog,
  fetchOtwPlayAdminObservability,
  fetchOtwPlayAdminProposals,
  fetchOtwPlayAdminRelease,
  fetchOtwPlayAdminSourceHealth,
  fetchOtwPlayChannelMonitorCandidates,
  fetchOtwPlayImportJobItems,
  publishOtwPlayPerformance,
  preflightOtwPlayCatalogEntry,
  rejectOtwPlayProposal,
  renewOtwPlayChannelMonitor,
  revokeOtwPlayChannelMonitorApproval,
  recheckOtwPlaySource,
  retryOtwPlayImportJob,
  subscribeOtwPlayChannelMonitor,
  unsubscribeOtwPlayChannelMonitor,
  updateOtwPlayImportCandidate,
  updateOtwPlayAdminRelease,
  updateOtwPlayChannelMonitor,
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
    await fetchOtwPlayAdminSourceHealth();
    await fetchOtwPlayAdminObservability();
    await fetchOtwPlayAdminRelease();
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/catalog",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/source-health",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/observability",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/release",
      { auth: "required" },
    );
  });

  it("sends release authority changes only through PATCH", async () => {
    const command = {
      expected: {
        publicReadEnabled: false,
        navigationVisible: false,
        updatedAt: 10,
      },
      target: { publicReadEnabled: true, navigationVisible: false },
      confirmation: "direct_routes_verified" as const,
    };
    await updateOtwPlayAdminRelease(command);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/release",
      { method: "PATCH", json: command, auth: "required" },
    );
  });

  it("uses the integrated preflight and catalog-entry routes without changing the payload", async () => {
    const preflight = {
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 0,
    };
    await preflightOtwPlayCatalogEntry(preflight);
    const command = {
      expectedCatalogRevision: 1,
      youtubeUrl: preflight.youtubeUrl,
      startSeconds: 0,
      song: { kind: "existing" as const, songId: "song-1" },
      participants: [
        {
          subject: { kind: "member" as const, memberUid: 1 },
          participantRole: "vocal" as const,
          creditOrder: 0,
        },
      ],
      channel: { kind: "existing" as const, channelId: "channel-1" },
      relationType: "cover" as const,
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      publicationTarget: "draft" as const,
    };
    await createOtwPlayCatalogEntry(command);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/catalog-entries/preflight",
      { method: "POST", json: preflight, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/catalog-entries",
      { method: "POST", json: command, auth: "required" },
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

  it("uses encoded candidate conversion and retry command routes", async () => {
    const update = { expectedVersion: 2, action: "ignore" as const };
    const convert = {
      candidates: [{ id: "candidate / one", expectedVersion: 3 }],
    };
    await updateOtwPlayImportCandidate("candidate / one", update);
    await convertOtwPlayImportCandidates("job / one", convert);
    await retryOtwPlayImportJob("job / one");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/import-candidates/candidate%20%2F%20one",
      { method: "PATCH", json: update, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/imports/job%20%2F%20one/convert",
      { method: "POST", json: convert, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/play/admin/imports/job%20%2F%20one/retry",
      { method: "POST", json: {}, auth: "required" },
    );
  });

  it("uses external YouTube channel IDs for collection-target CRUD", async () => {
    await createOtwPlayChannelMonitor({
      externalChannelId: "UC1111111111111111111111",
      approval: {
        scope: "candidate_collection",
        operatorReference: "operator-proof",
        approvalReference: "rights-ticket",
        revocationProcedure: "pause and unsubscribe",
        confirmed: true,
      },
    });
    await updateOtwPlayChannelMonitor("monitor-1", {
      expectedVersion: 3,
      externalChannelId: "UC2222222222222222222222",
    });
    await deleteOtwPlayChannelMonitor("monitor-1", { expectedVersion: 4 });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/channel-monitors",
      {
        method: "POST",
        json: {
          externalChannelId: "UC1111111111111111111111",
          approval: {
            scope: "candidate_collection",
            operatorReference: "operator-proof",
            approvalReference: "rights-ticket",
            revocationProcedure: "pause and unsubscribe",
            confirmed: true,
          },
        },
        auth: "required",
      },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/channel-monitors/monitor-1",
      {
        method: "PATCH",
        json: {
          expectedVersion: 3,
          externalChannelId: "UC2222222222222222222222",
        },
        auth: "required",
      },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/play/admin/channel-monitors/monitor-1",
      {
        method: "DELETE",
        json: { expectedVersion: 4 },
        auth: "required",
      },
    );
  });

  it("serializes channel-monitor candidate pagination and watermark reset", async () => {
    await fetchOtwPlayChannelMonitorCandidates("monitor / one", {
      limit: 50,
      cursor: "cursor-value",
    });
    await updateOtwPlayChannelMonitor("monitor / one", {
      expectedVersion: 5,
      resetWatermark: true,
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/candidates?limit=50&cursor=cursor-value",
      { auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one",
      {
        method: "PATCH",
        json: { expectedVersion: 5, resetWatermark: true },
        auth: "required",
      },
    );
  });

  it("uses explicit WebSub commands and a bounded backfill payload", async () => {
    await subscribeOtwPlayChannelMonitor("monitor / one");
    await renewOtwPlayChannelMonitor("monitor / one");
    await unsubscribeOtwPlayChannelMonitor("monitor / one");
    await revokeOtwPlayChannelMonitorApproval("monitor / one", {
      expectedVersion: 3,
      expectedApprovalVersion: 2,
      confirmed: true,
    });
    await backfillOtwPlayChannelMonitor("monitor / one", { count: 20 });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/subscribe",
      { method: "POST", json: {}, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/renew",
      { method: "POST", json: {}, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/unsubscribe",
      { method: "POST", json: {}, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/revoke-approval",
      {
        method: "POST",
        json: { expectedVersion: 3, expectedApprovalVersion: 2, confirmed: true },
        auth: "required",
      },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/play/admin/channel-monitors/monitor%20%2F%20one/backfill",
      { method: "POST", json: { count: 20 }, auth: "required" },
    );
  });

  it("serializes ingestion pagination and server filters", async () => {
    await fetchOtwPlayImportJobItems("job / one", {
      limit: 100,
      cursor: "cursor-value",
      classification: "eligible",
      status: "ready",
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/play/admin/imports/job%20%2F%20one/items?limit=100&cursor=cursor-value&classification=eligible&status=ready",
      { auth: "required" },
    );
  });

  it("encodes dynamic command identifiers and expected versions", async () => {
    await publishOtwPlayPerformance("performance / one", { expectedVersion: 3 });
    await rejectOtwPlayProposal("proposal / one", {
      expectedVersion: 2,
      resultCode: "duplicate",
    });
    await deleteOtwPlayPerformance("performance / draft", {
      expectedVersion: 4,
    });
    await deleteOtwPlaySong("song / draft", { expectedVersion: 5 });
    await recheckOtwPlaySource("source / one", {
      expectedVersion: 6,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      channelId: "channel-1",
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
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/play/admin/performances/performance%20%2F%20draft",
      { method: "DELETE", json: { expectedVersion: 4 }, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/play/admin/songs/song%20%2F%20draft",
      { method: "DELETE", json: { expectedVersion: 5 }, auth: "required" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/play/admin/sources/source%20%2F%20one/recheck",
      {
        method: "POST",
        json: {
          expectedVersion: 6,
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          channelId: "channel-1",
        },
        auth: "required",
      },
    );
  });
});
