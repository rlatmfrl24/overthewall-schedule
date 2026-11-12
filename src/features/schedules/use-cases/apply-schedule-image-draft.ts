import type { ApplyScheduleImageGroup, ScheduleImageReceipt } from "@contracts/schedule-image-import";
import { ApiError } from "@/shared/api/client";
export type ImageApplyState = {
  request: ApplyScheduleImageGroup; state: "ready" | "applied" | "unknown" | "review";
  receipt?: ScheduleImageReceipt; message?: string;
};
export async function applyScheduleImageDraft(groups: ImageApplyState[], dependencies: {
  apply: (group: ApplyScheduleImageGroup) => Promise<ScheduleImageReceipt>; refresh: () => Promise<unknown>;
}, onProgress?: (groups: ImageApplyState[]) => void) {
  const results = [...groups]; let applied = false;
  for (let i = 0; i < results.length; i++) {
    const group = results[i];
    if (group.state === "applied" || group.state === "review") continue;
    try {
      const receipt = await dependencies.apply(group.request);
      results[i] = { ...group, state:"applied", receipt }; applied = true;
    } catch (error) {
      const needsReview = error instanceof ApiError && error.status >= 400 && error.status < 500;
      results[i] = { ...group, state: needsReview ? "review" : "unknown",
        message: needsReview ? error.message : "결과 확인 중입니다. 같은 요청의 결과를 확인하거나 안전하게 재시도해주세요." };
    }
    onProgress?.([...results]);
  }
  let refresh: "not-needed" | "ready" | "failed" = "not-needed";
  if (applied) {
    try { await dependencies.refresh(); refresh = "ready"; } catch { refresh = "failed"; }
  }
  return { groups:results, refresh };
}
export async function confirmScheduleImageResult(group: ImageApplyState, read: (id: string) => Promise<ScheduleImageReceipt | null>): Promise<ImageApplyState> {
  try {
    const receipt = await read(group.request.operationId);
    return receipt ? { ...group, state:"applied", receipt, message:undefined } : { ...group, state:"unknown" };
  } catch (error) {
    return { ...group, state: error instanceof ApiError && error.status === 410 ? "review" : "unknown",
      message: error instanceof Error ? error.message : "결과를 확인하지 못했습니다." };
  }
}
