import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1IngestionRepository, D1WebsubRepository } from "../../otw-play";
import type {
  NewScheduledItem,
  ScheduledJobRunRecord,
} from "../../../platform/scheduled-jobs";
import type { Env } from "../../../platform/types";

const mocks = vi.hoisted(() => ({
  getScheduledXCollectionDecision: vi.fn(),
  readActiveXHandles: vi.fn(),
  readOtwPlayAutomationPaused: vi.fn(),
  readDueDataRetentionPolicyIds: vi.fn(),
  hasScheduledYouTubeFeedWork: vi.fn(),
}));

vi.mock("../../otw-play", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../otw-play")>(),
  readOtwPlayAutomationPaused: mocks.readOtwPlayAutomationPaused,
}));
vi.mock("../../operations", () => ({
  readDueDataRetentionPolicyIds: mocks.readDueDataRetentionPolicyIds,
}));
vi.mock("../../youtube", () => ({
  hasScheduledYouTubeFeedWork: mocks.hasScheduledYouTubeFeedWork,
}));
vi.mock("../../x-posts", () => ({
  getScheduledXCollectionDecision: mocks.getScheduledXCollectionDecision,
  readActiveXHandles: mocks.readActiveXHandles,
}));
vi.mock("../../../platform/db", () => ({ getDb: vi.fn(() => ({})) }));

import { ScheduledJobPlanner } from "./scheduled-job-planner";

const makeRun = (
  jobType: ScheduledJobRunRecord["job_type"],
  source: ScheduledJobRunRecord["source"],
  scheduledFor: number,
): ScheduledJobRunRecord => ({
  id: `run:${jobType}:${source}`,
  job_type: jobType,
  source,
  idempotency_key: `key:${jobType}:${source}`,
  scheduled_bucket: source === "scheduled" ? String(scheduledFor) : null,
  status: "queued",
  scheduled_for: source === "scheduled" ? scheduledFor : null,
  accepted_at: scheduledFor,
  started_at: null,
  finished_at: null,
  last_error: null,
  summary_json: null,
});

const makeEnv = (
  values: Record<string, string | null>,
  channelIds: string[] = [],
) => {
  const prepare = vi.fn((sql: string) => ({
    first: vi.fn(async () => {
      const key = Object.keys(values).find((candidate) =>
        sql.includes(`'${candidate}'`)
      );
      return key ? { value: values[key] } : null;
    }),
    all: vi.fn(async () => ({
      results: sql.includes("FROM members")
        ? channelIds.map((urlChzzk) => ({ urlChzzk }))
        : [],
    })),
  }));
  return {
    env: { otw_db: { prepare } } as unknown as Env,
    prepare,
  };
};

describe("ScheduledJobPlanner interval eligibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getScheduledXCollectionDecision.mockResolvedValue({
      shouldRun: true,
    });
    mocks.readActiveXHandles.mockResolvedValue(["member_a"]);
    mocks.readOtwPlayAutomationPaused.mockResolvedValue(false);
    mocks.readDueDataRetentionPolicyIds.mockResolvedValue([]);
    mocks.hasScheduledYouTubeFeedWork.mockResolvedValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it("plans no empty recovery, WebSub, YouTube, or retention work", async () => {
    const { env } = makeEnv({});
    const repository = { addItems: vi.fn(), hasRecoveryWork: vi.fn(async () => false) };
    vi.spyOn(D1WebsubRepository.prototype, "listScheduledMaintenancePhases").mockResolvedValue([]);
    vi.spyOn(D1IngestionRepository.prototype, "hasExpiredApiData").mockResolvedValue(false);
    vi.spyOn(D1IngestionRepository.prototype, "listPendingMessages").mockResolvedValue([]);
    const planner = new ScheduledJobPlanner(env, repository as never);

    for (const jobType of ["ingestion_recovery", "websub_maintenance", "youtube_feed_collection", "retention_prune"] as const) {
      expect(await planner.planScheduled(jobType, 100)).toEqual([]);
    }
    expect(repository.addItems).not.toHaveBeenCalled();
  });

  it("pausing Play keeps common recovery and metadata cleanup but skips ingestion requeue", async () => {
    const { env } = makeEnv({});
    const repository = { addItems: vi.fn(), hasRecoveryWork: vi.fn(async () => true) };
    mocks.readOtwPlayAutomationPaused.mockResolvedValue(true);
    vi.spyOn(D1IngestionRepository.prototype, "hasExpiredApiData").mockResolvedValue(true);
    const pending = vi.spyOn(D1IngestionRepository.prototype, "listPendingMessages");
    const planner = new ScheduledJobPlanner(env, repository as never);

    expect(await planner.planScheduled("ingestion_recovery", 100)).toEqual([
      { targetKey: "recover-scheduled", phase: "recover-scheduled", lane: "ingestion" },
      { targetKey: "cleanup", phase: "cleanup", lane: "ingestion" },
    ]);
    expect(pending).not.toHaveBeenCalled();
    for (const jobType of ["channel_reconcile", "recent_reconcile", "source_health"] as const) {
      expect(await planner.planScheduled(jobType, 100)).toEqual([]);
    }
  });

  it("uses WebSub teardown eligibility while automation is paused", async () => {
    const { env } = makeEnv({});
    mocks.readOtwPlayAutomationPaused.mockResolvedValue(true);
    const phases = vi.spyOn(D1WebsubRepository.prototype, "listScheduledMaintenancePhases")
      .mockResolvedValue(["cleanup", "recover-intent"]);

    expect(await new ScheduledJobPlanner(env, {} as never).planScheduled("websub_maintenance", 100))
      .toEqual([
        { targetKey: "cleanup", phase: "cleanup", lane: "websub" },
        { targetKey: "recover-intent", phase: "recover-intent", lane: "websub" },
      ]);
    expect(phases).toHaveBeenCalledWith(100, true);
  });

  it("plans only retention policies and YouTube feeds with actual work", async () => {
    const { env } = makeEnv({});
    mocks.readDueDataRetentionPolicyIds.mockResolvedValue(["x-api-cache"]);
    mocks.hasScheduledYouTubeFeedWork.mockResolvedValue(true);
    const planner = new ScheduledJobPlanner(env, {} as never);

    expect(await planner.planScheduled("retention_prune", 100)).toEqual([
      { targetKey: "x-api-cache", phase: "prune", lane: "maintenance", continuation: { policyId: "x-api-cache" } },
    ]);
    expect(await planner.planScheduled("youtube_feed_collection", 100)).toEqual([
      { targetKey: "feed:0", phase: "collect", lane: "maintenance" },
    ]);
  });

  it("scheduled X run은 저장된 주기가 아직 지나지 않으면 item을 만들지 않는다", async () => {
    const timestamp = Date.UTC(2026, 7, 31, 0);
    const { env } = makeEnv({ x_collection_enabled: "true" });
    const repository = { addItems: vi.fn(async () => []) };
    mocks.getScheduledXCollectionDecision.mockResolvedValue({
      shouldRun: false,
    });

    await new ScheduledJobPlanner(env, repository as never).plan(
      makeRun("x_collection", "scheduled", timestamp),
    );

    expect(mocks.getScheduledXCollectionDecision).toHaveBeenCalledWith(
      expect.anything(),
      timestamp,
    );
    expect(mocks.readActiveXHandles).not.toHaveBeenCalled();
    expect(repository.addItems).toHaveBeenCalledWith(
      "run:x_collection:scheduled",
      [],
    );
  });

  it("manual X run은 interval eligibility와 무관하게 실행한다", async () => {
    const timestamp = Date.UTC(2026, 7, 31, 0);
    const { env } = makeEnv({ x_collection_enabled: "true" });
    const repository = {
      addItems: vi.fn(async (_runId: string, items: NewScheduledItem[]) => items),
    };
    mocks.getScheduledXCollectionDecision.mockResolvedValue({
      shouldRun: false,
    });

    await new ScheduledJobPlanner(env, repository as never).plan(
      makeRun("x_collection", "manual", timestamp),
    );

    expect(mocks.getScheduledXCollectionDecision).not.toHaveBeenCalled();
    expect(repository.addItems).toHaveBeenCalledWith(
      "run:x_collection:manual",
      [expect.objectContaining({ lane: "x", phase: "collect" })],
    );
  });

  it("scheduled auto-update는 configured interval 이전에 channel scan을 만들지 않는다", async () => {
    const timestamp = Date.UTC(2026, 7, 31, 12);
    const { env, prepare } = makeEnv({
      auto_update_enabled: "true",
      auto_update_interval_hours: "6",
      auto_update_last_run: String(timestamp - 60 * 60_000),
    }, ["https://chzzk.naver.com/member-a"]);
    const repository = { addItems: vi.fn(async () => []) };

    await new ScheduledJobPlanner(env, repository as never).plan(
      makeRun("schedule_auto_update", "scheduled", timestamp),
    );

    expect(repository.addItems).toHaveBeenCalledWith(
      "run:schedule_auto_update:scheduled",
      [],
    );
    expect(
      prepare.mock.calls.some(([sql]) => String(sql).includes("FROM members")),
    ).toBe(false);
  });
});
