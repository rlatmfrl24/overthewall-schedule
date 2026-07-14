import { beforeEach, describe, expect, it, vi } from "vitest";

const autoUpdateSchedulesMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/services/schedule", () => ({
  autoUpdateSchedules: autoUpdateSchedulesMock,
}));

vi.mock("../../../worker/utils/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../worker/utils/helpers")>()),
  updateSetting: updateSettingMock,
}));

import { runAutoUpdateWithHistory } from "../../../worker/services/auto-update-runs";
import type { DbInstance } from "../../../worker/db";

const makeDb = () =>
  ({
    insert: vi.fn(() => ({
      values: vi.fn(async () => ({ success: true })),
    })),
  }) as unknown as DbInstance;

describe("auto update run CHZZK cache wiring", () => {
  beforeEach(() => {
    autoUpdateSchedulesMock.mockReset();
    updateSettingMock.mockReset();
    autoUpdateSchedulesMock.mockResolvedValue({
      updated: 0,
      checked: 0,
      details: [],
    });
  });

  it.each(["manual", "scheduled"] as const)(
    "%s 실행은 동일한 D1 cacheDb를 수집 서비스에 전달한다",
    async (source) => {
      const db = makeDb();
      const cacheDb = {} as Pick<D1Database, "prepare">;

      await runAutoUpdateWithHistory(db, {
        source,
        rangeDays: 3,
        cacheDb,
      });

      expect(autoUpdateSchedulesMock).toHaveBeenCalledWith(db, 3, { cacheDb });
    },
  );
});
