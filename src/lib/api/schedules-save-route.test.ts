import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSchedules } from "../../../worker/routes/schedules";
import type { Env } from "../../../worker/types";

const saveScheduleWithConflictsMock = vi.hoisted(() => vi.fn());
const fakeDb = vi.hoisted(() => ({}));

vi.mock("../../../worker/auth", () => ({
  authenticateOptionalRequest: vi.fn(async () => ({
    id: "admin",
    displayName: "Admin User",
  })),
}));

vi.mock("../../../worker/db", () => ({
  getDb: () => fakeDb,
}));

vi.mock("../../../worker/use-cases/save-schedule", () => ({
  saveScheduleWithConflicts: saveScheduleWithConflictsMock,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "",
    otw_db: {} as D1Database,
  }) as Env;

const makeSaveRequest = (body: Record<string, unknown>) =>
  new Request("https://example.com/api/schedules/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });

describe("schedule save command route", () => {
  beforeEach(() => {
    saveScheduleWithConflictsMock.mockReset();
  });

  it("잘못된 상태값은 use case 호출 전에 거부한다", async () => {
    const response = await handleSchedules(
      makeSaveRequest({
        member_uid: 1,
        date: "2026-02-13",
        status: "invalid",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Missing or invalid required fields");
    expect(saveScheduleWithConflictsMock).not.toHaveBeenCalled();
  });

  it("스케줄 command를 정규화해 use case로 위임한다", async () => {
    saveScheduleWithConflictsMock.mockResolvedValueOnce({
      success: true,
      action: "update",
      scheduleId: 7,
      deletedIds: [8],
    });

    const response = await handleSchedules(
      makeSaveRequest({
        id: "7",
        member_uid: 1,
        date: "2026-02-13",
        start_time: "20:00",
        title: "정규 방송",
        status: "방송",
      }),
      makeEnv(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      action: "update",
      scheduleId: 7,
      deletedIds: [8],
    });
    expect(saveScheduleWithConflictsMock).toHaveBeenCalledWith(
      fakeDb,
      {
        id: 7,
        member_uid: 1,
        date: "2026-02-13",
        start_time: "20:00",
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
