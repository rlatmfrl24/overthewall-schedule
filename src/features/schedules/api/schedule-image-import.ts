import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { ApplyScheduleImageGroup, ScheduleImageContext, ScheduleImageDraft, ScheduleImageReceipt } from "@contracts/schedule-image-import";
import { apiFetch } from "@/shared/api/client";
import { createScheduleImageDetails, type ScheduleImageFocus } from "./schedule-image-details";
export async function readScheduleImage(file: File, signal?: AbortSignal, focus: ScheduleImageFocus = "all") {
  const body = new FormData(); body.append("image",file);
  for (const detail of await createScheduleImageDetails(file, signal, focus)) body.append("detail", detail);
  signal?.throwIfAborted();
  return apiFetch<ScheduleImageDraft>(apiRoutes.schedules.imageAnalyze.build(),{method:"POST",body,signal,auth:"required"});
}
export const fetchImageContext = (memberUid:number,date:string) => apiFetch<ScheduleImageContext>(
  withRouteSearch(apiRoutes.schedules.imageContext.build(),new URLSearchParams({memberUid:String(memberUid),date}).toString()),{auth:"required",cache:"no-store"});
export const applyImageGroup = (group:ApplyScheduleImageGroup) => apiFetch<ScheduleImageReceipt>(apiRoutes.schedules.imageApply.build(),{method:"POST",json:group,auth:"required"});
export const fetchImageResult = (operationId:string) => apiFetch<ScheduleImageReceipt|null>(
  withRouteSearch(apiRoutes.schedules.imageResult.build(),new URLSearchParams({operationId}).toString()),{auth:"required",cache:"no-store"});
