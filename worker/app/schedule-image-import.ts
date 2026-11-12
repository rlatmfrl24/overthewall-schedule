import { createScheduleImageHandler, D1ScheduleImageBudget, LunaScheduleImageReader } from "../features/schedules";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";

export const handleScheduleImageAnalyze = createScheduleImageHandler((env: Env) => {
  if (!env.SCHEDULE_IMAGE_OPENAI_API_KEY?.trim()) throw new Error("Schedule image model is not configured");
  return {
    reader: new LunaScheduleImageReader(env.SCHEDULE_IMAGE_OPENAI_API_KEY),
    budget: new D1ScheduleImageBudget(env.otw_db, getWorkerSiteResources(env).site.id),
    members: async () => (await env.otw_db.prepare("SELECT uid,name FROM members WHERE content_access='normal' AND is_deprecated=0 ORDER BY uid").all<{ uid: number; name: string }>()).results,
  };
});
