import { createScheduleImageHandler, D1ScheduleImageBudget, LunaScheduleImageReader, createScheduleImageApplyHandler, ScheduleImageApplyService, D1ScheduleWriteRepository, PublicScheduleWritePolicy, ScheduleImageError } from "../features/schedules";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";

export const handleScheduleImageAnalyze = createScheduleImageHandler((env: Env) => {
  if (!env.SCHEDULE_IMAGE_OPENAI_API_KEY?.trim()) throw new ScheduleImageError("이미지 인식 연결 설정이 필요합니다. 기존 직접 입력은 계속 사용할 수 있습니다.", 503);
  return {
    reader: new LunaScheduleImageReader(env.SCHEDULE_IMAGE_OPENAI_API_KEY),
    budget: new D1ScheduleImageBudget(env.otw_db, getWorkerSiteResources(env).site.id),
    members: async () => (await env.otw_db.prepare("SELECT uid,name FROM members WHERE content_access='normal' AND COALESCE(is_deprecated,0)=0 ORDER BY uid").all<{ uid: number; name: string }>()).results,
  };
});

export const handleScheduleImageApply = createScheduleImageApplyHandler(env => {
  const site = getWorkerSiteResources(env).site.id;
  return new ScheduleImageApplyService(new D1ScheduleWriteRepository(env.otw_db, site), new PublicScheduleWritePolicy(env.otw_db, site));
});
