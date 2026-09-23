import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { OtwPlayAdminEntityDto, OtwPlayAdminSongDto, OtwPlayIngestionReviewCandidateDto } from "@contracts/otw-play";
import { queryKeys } from "@/shared/query/query-keys";
import { createAdminCatalogFixture } from "../test/catalog-fixtures";
import { applyReviewCatalogChanges } from "./review-catalog-changes";
import { refreshReviewInbox } from "./refresh-review-inbox";

const song: OtwPlayAdminSongDto = { id: "new-song", slug: "new-song", title: "New song", normalizedTitle: "new song", isOtwOriginal: false,
  originalReleaseDate: null, originalReleasePrecision: "unknown", aliases: [], tags: [], originalArtists: [], version: 0, archivedAt: null };
const entity: OtwPlayAdminEntityDto = { id: "new-singer", slug: "new-singer", displayName: "Singer", normalizedName: "singer", entityKind: "person", memberUid: null, version: 0, archivedAt: null };
const saved = (revision: number): OtwPlayIngestionReviewCandidateDto => ({ id: "candidate", version: 2, videoId: "AAAAAAAAAAA", status: "ready", candidateKind: "official_video", classification: "eligible", catalogChannelId: "channel", reviewInput: null, linkedPerformanceId: null,
  catalogChanges: { revision, songs: [song], entities: [entity] } });

describe("Ready catalog authority", () => {
  it("makes returned IDs reusable immediately without reloading the catalog", () => {
    const client = new QueryClient();
    const key = queryKeys.otwPlay.adminCatalog();
    client.setQueryData(key, createAdminCatalogFixture({ revision: 7, readModelRevision: 7 }));
    applyReviewCatalogChanges(client, saved(8));
    applyReviewCatalogChanges(client, saved(8));
    expect(client.getQueryData(key)).toMatchObject({ revision: 8, readModelRevision: 8, songs: [song], entities: [entity] });
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });
  it("does not certify missing concurrent revisions or overwrite a newer snapshot", () => {
    const client = new QueryClient(), key = queryKeys.otwPlay.adminCatalog();
    client.setQueryData(key, createAdminCatalogFixture({ revision: 7, readModelRevision: 7 }));
    applyReviewCatalogChanges(client, saved(10));
    expect(client.getQueryData(key)).toMatchObject({ revision: 7, songs: [song] });
    client.setQueryData(key, createAdminCatalogFixture({ revision: 11, readModelRevision: 11 }));
    applyReviewCatalogChanges(client, saved(10));
    expect(client.getQueryData(key)).toMatchObject({ revision: 11, songs: [], entities: [] });
    client.clear();
  });
  it("cancels an in-flight page refresh before rebuilding cursors", async () => {
    const client = new QueryClient();
    const filters = { jobId: "one" };
    const key = ["otw-play-review-inbox", filters];
    const pages = { pages: [{ items: [], nextCursor: "old" }, { items: [], nextCursor: null }], pageParams: [null, "old"] };
    client.setQueryData(key, pages);
    let finish!: (value: typeof pages) => void;
    const response = new Promise<typeof pages>(resolve => { finish = resolve; });
    const pending = client.fetchQuery({ queryKey: key, queryFn: () => response }).catch(() => {});
    await refreshReviewInbox(client, filters);
    finish(pages);
    await pending;
    expect(client.getQueryData(key)).toEqual({ pages: pages.pages.slice(0, 1), pageParams: [null] });
    client.clear();
  });
  it("drops obsolete subsequent page cursors before refreshing, without touching another import", async () => {
    const client = new QueryClient();
    const filters = { jobId: "one" }, other = { jobId: "two" };
    const pages = { pages: [{ items: [], nextCursor: "old" }, { items: [], nextCursor: null }], pageParams: [null, "old"] };
    client.setQueryData(["otw-play-review-inbox", filters], pages);
    client.setQueryData(["otw-play-review-inbox", other], pages);
    await refreshReviewInbox(client, filters);
    expect(client.getQueryData(["otw-play-review-inbox", filters])).toEqual({ pages: pages.pages.slice(0, 1), pageParams: [null] });
    expect(client.getQueryData(["otw-play-review-inbox", other])).toEqual(pages);
    client.clear();
  });
});
