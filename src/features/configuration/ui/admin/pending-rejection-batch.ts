import type { SelectedPendingBatchResponse } from "@/features/schedules";

export const summarizePendingRejectionBatch = (
  result: SelectedPendingBatchResponse,
) => {
  const successfulIds = result.results
    .filter((item) => item.success)
    .map((item) => item.id);
  const feedback=result.results.filter(item=>!item.success && ["CONTENT_MOVED","CONTENT_ACCEPTED","CONTENT_CONFLICT"].includes(item.error??""))
    .map(item=>item.message).filter(Boolean).slice(0,3).join(" · ");
  if (result.failedCount === 0) {
    return {
      successfulIds,
      variant: "success" as const,
      description: `${result.successCount}건을 거부 제외로 등록했습니다.`,
    };
  }
  if (result.successCount === 0) {
    return {
      successfulIds,
      variant: "error" as const,
      description: `거부 제외 처리에 실패했습니다: 실패 ${result.failedCount}건${feedback?` · ${feedback}`:""}`,
    };
  }
  return {
    successfulIds,
    variant: "info" as const,
    description: `거부 제외 처리: 성공 ${result.successCount}건, 실패 ${result.failedCount}건${feedback?` · ${feedback}`:""}`,
  };
};
