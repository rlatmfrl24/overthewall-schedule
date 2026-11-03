import { expect, it, vi } from "vitest";
import type { FxRssContinuation } from "@contracts/x-collection";
import type { FxRssCollectionPorts } from "../ports/fx-rss-collection";
import type { XPostDto } from "@contracts/x-posts";

const now = Date.UTC(2026, 10, 3, 20, 23, 1);
const candidate = (id: string) => ({ id, firstSeenAt: now, createdAtHint: now, attempts: 0, nextAttemptAt: now, error: null, stage: "free" as const });
const state = (ids: string[] = []): FxRssContinuation => ({ provider: "fxembed", mode: "rss_candidates", scope: "regular", handles: ["member"], phase: ids.length ? "hydrate" : "fetch", candidates: ids.map(candidate), nextAttemptAt: null });
const setup = () => {
  const stored = new Set<string>();
  const ports: FxRssCollectionPorts = {
    now: () => now,
    readContext: async () => ({ allowed: true, policy: "rss_v1", collectionStartedAt: 1, trustedUserId: "101", pendingItemId: null }),
    fetchFeed: vi.fn(async () => ({ rawCount: 6, entries: ["1", "2", "3", "4", "5", "6"].map(id => ({ id, handle: "member", createdAtHint: now })) })),
    fetchStatus: vi.fn(async id => ({ id, createdAt: new Date(now).toISOString() }) as XPostDto),
    readStoredIds: async ids => ids.filter(id => stored.has(id)),
    store: vi.fn(async post => { stored.add(post.id); return { ok: true, postsStored: 1 }; }),
    prepareOfficialBatch: vi.fn(async () => ({ batch: null, error: "rss_official_timeline_pending" })),
    hydrateOfficial: vi.fn(async candidates => ({ resolvedIds: [], remaining: candidates, postsReturned: 0, postsStored: 0, paidApiCalls: 0, estimatedCostMicros: 0, error: null })),
    checkpoint: vi.fn(async () => true),
  };
  return { ports, stored };
};
const run = async (ports: FxRssCollectionPorts, input: FxRssContinuation) => {
  const module = await import("./fx-rss-collection").catch(() => null);
  expect(module?.createFxRssCollection, "RSS collection application exists").toBeTypeOf("function");
  return module!.createFxRssCollection(ports).run(input);
};

it("does_not_rescan_pending_feed and resumes the sixth candidate at the next nominal tick", async () => {
  const { ports } = setup();
  const first = await run(ports, state());
  expect(first.stats.freeApiCalls).toBe(5);
  expect(first.state.candidates.map(c => c.id)).toEqual(["6"]);
  expect(first.nextAttemptAt).toBe(Date.UTC(2026, 10, 3, 20, 53));
  ports.now = () => first.nextAttemptAt!;
  vi.mocked(ports.fetchFeed).mockClear();
  expect((await run(ports, first.state)).status).toBe("complete");
  expect(ports.fetchFeed).not.toHaveBeenCalled();
});

it("checkpoints_before_first_lookup and excludes before-start, foreign, duplicate and stored IDs", async () => {
  const { ports, stored } = setup();
  stored.add("hidden");
  ports.fetchFeed = async () => ({ rawCount: 5, entries: [
    { id: "old", handle: "member", createdAtHint: 0 }, { id: "foreign", handle: "other", createdAtHint: now },
    { id: "hidden", handle: "member", createdAtHint: now }, { id: "1", handle: "member", createdAtHint: now }, { id: "1", handle: "member", createdAtHint: now },
  ] });
  ports.fetchStatus = async id => {
    expect(ports.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ phase: "hydrate", candidates: [expect.objectContaining({ id: "1" })] }), expect.anything());
    return { id, createdAt: new Date(now).toISOString() } as XPostDto;
  };
  const result = await run(ports, state());
  expect(result.stats).toMatchObject({ postsStored: 1, candidatesFound: 1, freeApiCalls: 1 });
});

it("replays_after_post_commit_without_duplicate_write and preserves_candidates_on_lost_checkpoint", async () => {
  const { ports } = setup();
  vi.mocked(ports.checkpoint).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const interrupted = await run(ports, state(["1"]));
  expect(interrupted.status).toBe("blocked");
  expect(interrupted.state.candidates.map(c => c.id)).toContain("1");
  vi.mocked(ports.checkpoint).mockResolvedValue(true);
  expect((await run(ports, interrupted.state)).status).toBe("complete");
  expect(ports.store).toHaveBeenCalledTimes(1);
  expect(ports.fetchStatus).toHaveBeenCalledTimes(1);
});

it("retains 404 candidates and stages only the second free failure for official recovery", async () => {
  const { ports } = setup();
  ports.fetchStatus = async () => { throw new Error("fx_http_404"); };
  const first = await run(ports, state(["1"]));
  expect(first.state.candidates[0]).toMatchObject({ attempts: 1, stage: "free", error: "fx_http_404" });
  ports.now = () => first.nextAttemptAt!;
  const second = await run(ports, first.state);
  expect(second.state.candidates[0]).toMatchObject({ attempts: 2, stage: "official" });
  ports.now = () => second.nextAttemptAt!;
  expect((await run(ports, second.state)).state.candidates).toHaveLength(1);
});

it.each(["rollback", "allowlist", "identity"])("preserves pending candidates on %s", async reason => {
  const { ports } = setup();
  ports.readContext = async () => ({ allowed: reason !== "allowlist", policy: reason === "rollback" ? "legacy" : "rss_v1", collectionStartedAt: 1, trustedUserId: reason === "identity" ? null : "101", pendingItemId: "item" });
  const input = state(["1"]), result = await run(ports, input);
  expect(result.state.candidates).toEqual(input.candidates);
  expect(result.status).not.toBe("complete");
  expect(ports.fetchStatus).not.toHaveBeenCalled();
});

it("does not turn a storage failure into a free provider failure or paid eligibility", async () => {
  const { ports } = setup();
  ports.store = async () => { throw new Error("database_unavailable"); };
  const result = await run(ports, state(["1"]));
  expect(result.status).toBe("blocked");
  expect(result.state.candidates[0]).toMatchObject({ attempts: 0, stage: "free" });
});

it.each([
  { mode: "unknown" }, { handles: ["member", "other"] },
  { candidates: Array.from({ length: 101 }, (_, index) => candidate(String(index))) },
  { candidates: [candidate("1"), candidate("1")] }, { candidates: [{ ...candidate("1"), id: 1 }] },
])("rejects invalid persisted RSS continuation %# before dependencies", async invalid => {
  const { ports } = setup();
  await expect(run(ports, { ...state(["1"]), ...invalid } as FxRssContinuation)).rejects.toThrow("invalid_x_rss_continuation");
  expect(ports.fetchStatus).not.toHaveBeenCalled();
  expect(ports.checkpoint).not.toHaveBeenCalled();
});

it.each([
  { day: "2026-02-30" }, { ids: [] }, { ids: ["1", "1"] }, { ids: ["bad"] }, { ids: Array.from({ length: 100 }, (_, i) => String(i)) },
  { requestId: "other-account-or-day" }, { ids: ["999"] },
])("rejects malformed paid batch metadata before any lookup %#", async invalid => {
  const { ports } = setup(), input = state(["1"]);
  input.candidates[0] = { ...input.candidates[0], stage: "official", attempts: 2 };
  input.paidBatch = { day: "2026-11-03", ids: ["1"], requestId: "otw:rss:member:2026-11-03:00000000-0000-0000-0000-000000000000", ...invalid };
  await expect(run(ports, input)).rejects.toThrow("invalid_x_rss_paid_batch");
  expect(ports.fetchStatus).not.toHaveBeenCalled();
  expect(ports.hydrateOfficial).not.toHaveBeenCalled();
});
