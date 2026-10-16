import type { ChzzkLiveContentDto } from "@contracts/chzzk";
import type { DbInstance } from "../../../platform/db";
import type { D1LiveScheduleTransitionWriter } from "./d1-live-schedule-transition-writer";
import {
  autoFillUndecidedLiveSchedules,
  isLiveScheduleAutoFillEnabled,
} from "./live-schedule";

export type LiveScheduleStatusItem = {
  channelId: string;
  content: ChzzkLiveContentDto | null;
};

export const createLiveScheduleAutoFillService = (db: DbInstance, writer?: D1LiveScheduleTransitionWriter) => ({
  async run(items: LiveScheduleStatusItem[]) {
    if (!(await isLiveScheduleAutoFillEnabled(db))) {
      return { updated: 0, details: [] };
    }
    return autoFillUndecidedLiveSchedules(db, items, writer);
  },
});

export type LiveScheduleAutoFillService = ReturnType<
  typeof createLiveScheduleAutoFillService
>;
