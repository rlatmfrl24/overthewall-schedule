import { parseSiteId } from "@contracts/site-definition";
import { D1ChzzkScanWriter, D1CollectorWriter, D1LiveScheduleWriter } from "../features/schedules";
import type { Env } from "../platform/types";

export const buildChzzkScanWriter = (env: Env) => new D1ChzzkScanWriter(env.otw_db, parseSiteId(env.SITE_ID));
export const buildCollectorWriter = (env: Env) => new D1CollectorWriter(env.otw_db, parseSiteId(env.SITE_ID));
export const buildLiveScheduleWriter = (env: Env) => new D1LiveScheduleWriter(env.otw_db, parseSiteId(env.SITE_ID));
