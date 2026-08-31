import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";

const mocks = vi.hoisted(() => ({
  createRun: vi.fn(),
  markRunFailed: vi.fn(),
  markRunThrottled: vi.fn(),
  reserveQueueOperations: vi.fn(),
  retryRun: vi.fn(),
  readRunDto: vi.fn(),
}));

vi.mock("./d1-scheduled-job-repository", () => ({
  D1ScheduledJobRepository: class {
    createRun = mocks.createRun;
    markRunFailed = mocks.markRunFailed;
    markRunThrottled = mocks.markRunThrottled;
    reserveQueueOperations = mocks.reserveQueueOperations;
    retryRun = mocks.retryRun;
    readRunDto = mocks.readRunDto;
  },
}));

import { ScheduledRunClient } from "./scheduled-run-client";

const run = {
  id: "run-1",
  job_type: "naver_cafe_collection" as const,
  status: "queued" as const,
  accepted_at: 1,
  idempotency_key: "manual:naver:1",
};

describe("ScheduledRunClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createRun.mockResolvedValue(run);
    mocks.reserveQueueOperations.mockResolvedValue(true);
    mocks.retryRun.mockResolvedValue({ kind: "accepted", run });
    mocks.readRunDto.mockResolvedValue({ runId: run.id, status: "queued" });
  });

  it("control Queue 전송 실패를 실패한 run으로 영속화한다", async () => {
    const client = new ScheduledRunClient({
      otw_db: {} as D1Database,
      OTW_OPS_CONTROL_QUEUE: { send: vi.fn().mockRejectedValue(new Error("down")) },
    } as unknown as Env);

    await expect(
      client.createManualRun("naver_cafe_collection", { actorId: "admin" }),
    ).rejects.toThrow("down");

    expect(mocks.markRunFailed).toHaveBeenCalledWith(
      run.id,
      "control_queue_send_failed:down",
    );
  });

  it("retry는 queued outbox를 drain할 control message를 다시 보낸다", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = new ScheduledRunClient({
      otw_db: {} as D1Database,
      OTW_OPS_CONTROL_QUEUE: { send },
    } as unknown as Env);

    await expect(client.retryRun(run.id)).resolves.toEqual({
      kind: "accepted",
      run: { runId: run.id, status: "queued" },
    });

    expect(send).toHaveBeenCalledWith({
      schemaVersion: 1,
      messageType: "scheduled_job_control",
      runId: run.id,
    }, { contentType: "json" });
  });

  it("terminal run retry는 control message를 보내지 않고 거절 상태를 보존한다", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    mocks.retryRun.mockResolvedValue({
      kind: "not_retryable",
      status: "succeeded",
    });
    const client = new ScheduledRunClient({
      otw_db: {} as D1Database,
      OTW_OPS_CONTROL_QUEUE: { send },
    } as unknown as Env);

    await expect(client.retryRun(run.id)).resolves.toEqual({
      kind: "not_retryable",
      status: "succeeded",
    });

    expect(send).not.toHaveBeenCalled();
    expect(mocks.readRunDto).not.toHaveBeenCalled();
  });
});
