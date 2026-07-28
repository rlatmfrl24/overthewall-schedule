import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { ScheduleService } from "../application/schedule-service";
import { PublicScheduleWritePolicy } from "../infrastructure/public-schedule-write-policy";
import { createScheduleRequestHandler } from "./schedule-handler";

const repositoryMocks = vi.hoisted(() => ({
  save: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const readSchedulesMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  authenticateOptionalRequest: vi.fn(async () => ({
    id: "admin",
    displayName: "Admin User",
  })),
}));

const env = {
  YOUTUBE_API_KEY: "",
  otw_db: {} as D1Database,
} as Env;
const handleScheduleRequest = createScheduleRequestHandler(
  () =>
    new ScheduleService(
      { read: readSchedulesMock },
      {
        saveWithConflictResolution: repositoryMocks.save,
        create: repositoryMocks.create,
        update: repositoryMocks.update,
        delete: repositoryMocks.delete,
      },
      new PublicScheduleWritePolicy(),
    ),
);

const makeSaveRequest = (body: unknown) =>
  new Request("https://example.com/api/schedules/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });

describe("schedule HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("잘못된 상태값은 repository 호출 전에 거부한다", async () => {
    const response = await handleScheduleRequest(
      makeSaveRequest({
        member_uid: 1,
        date: "2026-02-13",
        status: "invalid",
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(repositoryMocks.save).not.toHaveBeenCalled();
  });

  it("strict ID와 date/time을 검증한다", async () => {
    const invalidId = await handleScheduleRequest(
      makeSaveRequest({
        id: "7abc",
        member_uid: 1,
        date: "2026-02-13",
        start_time: "20:00",
        status: "방송",
      }),
      env,
    );
    const invalidDate = await handleScheduleRequest(
      makeSaveRequest({
        member_uid: 1,
        date: "2026-02-30",
        start_time: "20:00",
        status: "방송",
      }),
      env,
    );
    const invalidTime = await handleScheduleRequest(
      makeSaveRequest({
        member_uid: 1,
        date: "2026-02-13",
        start_time: "24:00",
        status: "방송",
      }),
      env,
    );

    expect(invalidId.status).toBe(400);
    expect(invalidDate.status).toBe(400);
    expect(invalidTime.status).toBe(400);
    expect(repositoryMocks.save).not.toHaveBeenCalled();
  });

  it("정규화한 command와 actor를 application 경계로 전달한다", async () => {
    repositoryMocks.save.mockResolvedValueOnce({
      success: true,
      action: "update",
      scheduleId: 7,
      deletedIds: [8],
    });

    const response = await handleScheduleRequest(
      makeSaveRequest({
        id: "7",
        member_uid: 1,
        date: "2026-02-13",
        start_time: "20:00",
        title: "정규 방송",
        status: "방송",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      action: "update",
      scheduleId: 7,
      deletedIds: [8],
    });
    expect(repositoryMocks.save).toHaveBeenCalledWith(
      {
        id: 7,
        memberUid: 1,
        date: "2026-02-13",
        startTime: "20:00",
        title: "정규 방송",
        status: "방송",
      },
      expect.objectContaining({
        actorId: "admin",
        actorName: "Admin User",
      }),
    );
  });
});
