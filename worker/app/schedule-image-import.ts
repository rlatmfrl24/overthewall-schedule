import { createScheduleImageHandler, D1ScheduleImageBudget, readScheduleImageMembers, FlashLiteScheduleImageReader, createScheduleImageApplyHandler, ScheduleImageApplyService, D1ScheduleWriteRepository, PublicScheduleWritePolicy, ScheduleImageError } from "../features/schedules";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";

export const handleScheduleImageAnalyze = createScheduleImageHandler((env: Env) => {
  const openRouter = env.SCHEDULE_IMAGE_OPENROUTER_API_KEY?.trim(), gemini = env.SCHEDULE_IMAGE_GEMINI_API_KEY?.trim();
  if (!openRouter || !gemini) throw new ScheduleImageError("이미지 인식 연결 설정이 필요합니다. 기존 직접 입력은 계속 사용할 수 있습니다.", 503);
  const site = getWorkerSiteResources(env).site.id;
  return {
    reader: new FlashLiteScheduleImageReader({ openRouter, gemini }),
    budget: new D1ScheduleImageBudget(env.otw_db, site),
    members: () => readScheduleImageMembers(env.otw_db, site),
  };
});

export const handleScheduleImageApply = createScheduleImageApplyHandler(env => {
  const site = getWorkerSiteResources(env).site.id;
  return new ScheduleImageApplyService(new D1ScheduleWriteRepository(env.otw_db, site), new PublicScheduleWritePolicy(env.otw_db, site));
});
