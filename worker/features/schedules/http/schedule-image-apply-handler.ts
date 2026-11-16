import { apiRoutes } from "../../../../contracts/api-routes";
import type { Env } from "../../../platform/types";
import { authenticateRequest, isAdminUser } from "../../../platform/auth";
import { getActorInfo, parseNumericId } from "../../../platform/http-helpers";
import type { ScheduleImageApplyService } from "../application/schedule-image-apply-service";
import { ScheduleImageError } from "../application/read-schedule-image";
import { parseScheduleImageGroup } from "../domain/schedule-image-command";
import { isIsoDate } from "../domain/schedule-input";
import { readImageImportBody } from "./image-import-body";

export const createScheduleImageApplyHandler = (resolve: (env: Env) => ScheduleImageApplyService) => async (request: Request, env: Env): Promise<Response> => {
  const auth = await authenticateRequest(request, env); if (!auth.ok) return auth.response;
  const actor = { ...getActorInfo(request, auth.user), isAdmin: isAdminUser(env, auth.user.id) };
  const url = new URL(request.url);
  try {
    const service = resolve(env);
    let result: unknown;
    if (url.pathname === apiRoutes.schedules.imageContext.pattern) {
      const uid = parseNumericId(url.searchParams.get("memberUid")), date = url.searchParams.get("date");
      if (uid === null || !isIsoDate(date)) throw new ScheduleImageError("멤버와 날짜를 확인해주세요.");
      result = await service.context(uid, date, actor);
    } else if (url.pathname === apiRoutes.schedules.imageResult.pattern) {
      result = await service.result(url.searchParams.get("operationId") ?? "", actor);
    } else {
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(await readImageImportBody(request, 300_000))); }
      catch { throw new ScheduleImageError("적용 요청 형식을 확인해주세요."); }
      const group = parseScheduleImageGroup(body);
      if (!group) throw new ScheduleImageError("일정의 값과 묶음 안의 충돌을 확인해주세요.");
      result = await service.apply(group, actor);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { code: "SCHEDULE_IMAGE_APPLY_ERROR", message: error instanceof ScheduleImageError ? error.message : "결과를 확인하지 못했습니다. 같은 요청의 결과를 다시 조회해주세요." } },
      { status: error instanceof ScheduleImageError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
  }
};
