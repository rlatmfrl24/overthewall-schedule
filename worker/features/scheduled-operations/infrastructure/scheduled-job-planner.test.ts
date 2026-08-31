import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NewScheduledItem,
  ScheduledJobRunRecord,
} from "../../../platform/scheduled-jobs";
import type { Env } from "../../../platform/types";

const mocks = vi.hoisted(() => ({
  getScheduledXCollectionDecision: vi.fn(),
  readActiveXHandles: vi.fn(),
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
