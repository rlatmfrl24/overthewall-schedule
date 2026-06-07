import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleScheduleBoard } from "../../../worker/routes/schedule-board";
import type { Env } from "../../../worker/types";

const getScheduleBoardMock = vi.hoisted(() => vi.fn());
const fakeDb = vi.hoisted(() => ({}));

vi.mock("../../../worker/db", () => ({
  getDb: () => fakeDb,
}));

vi.mock("../../../worker/repositories/schedule-board", () => ({
  getScheduleBoard: getScheduleBoardMock,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "",
    otw_db: {} as D1Database,
  }) as Env;

describe("schedule-board worker route", () => {
  beforeEach(() => {
    getScheduleBoardMock.mockReset();
  });

  it("날짜 범위를 검증한다", async () => {
    const response = await handleScheduleBoard(
      new Request(
        "https://example.com/api/schedule-board?startDate=2026-02-16&endDate=2026-02-10",
      ),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "startDate must be before or equal to endDate",
    );
    expect(getScheduleBoardMock).not.toHaveBeenCalled();
  });

  it("유효한 범위는 repository aggregate 결과를 반환한다", async () => {
    getScheduleBoardMock.mockResolvedValueOnce({
      startDate: "2026-02-10",
      endDate: "2026-02-16",
      updatedAt: "2026-02-13T00:00:00.000Z",
      members: [{ uid: 1, name: "멤버" }],
      ddays: [],
      notices: [],
      schedules: [{ id: 1, member_uid: 1, date: "2026-02-13" }],
    });

    const response = await handleScheduleBoard(
      new Request(
        "https://example.com/api/schedule-board?startDate=2026-02-10&endDate=2026-02-16",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as { schedules: unknown[] };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getScheduleBoardMock).toHaveBeenCalledWith(
      fakeDb,
      "2026-02-10",
      "2026-02-16",
    );
    expect(body.schedules).toHaveLength(1);
  });
});
