import type { ChzzkLiveContentDto } from "@contracts/chzzk";
import type { DbInstance } from "../../../platform/db";
import {
  autoFillUndecidedLiveSchedules,
  isLiveScheduleAutoFillEnabled,
} from "./live-schedule";

export type LiveScheduleStatusItem = {
  channelId: string;
  content: ChzzkLiveContentDto | null;
};

export const createLiveScheduleAutoFillService = (db: DbInstance) => ({
  async run(items: LiveScheduleStatusItem[]) {
    if (!(await isLiveScheduleAutoFillEnabled(db))) {
      return { updated: 0, details: [] };
    }
    return autoFillUndecidedLiveSchedules(db, items);
  },
});

export type LiveScheduleAutoFillService = ReturnType<
  typeof createLiveScheduleAutoFillService
>;
