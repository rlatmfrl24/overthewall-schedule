import { apiRoutes } from "@contracts/api-routes";
import type {
  AiReviewDto,
  AiReviewRequest,
  AiReviewCloseUnknownRequest,
  AiReviewResumeRequest,
} from "@contracts/otw-play-ai-review";
import { apiFetch } from "@/shared/api/client";

export const startAiReview = (input: AiReviewRequest) =>
  apiFetch<{ data: AiReviewDto }>(apiRoutes.otwPlay.admin.aiReviews.build(), {
    method: "POST",
    auth: "required",
    json: input,
  });
export const getAiReview = (id: string) =>
  apiFetch<{ data: AiReviewDto }>(apiRoutes.otwPlay.admin.aiReview.build(id), {
    auth: "required",
  });
export const closeUnknownAiReview = (id: string, input: AiReviewCloseUnknownRequest) =>
  apiFetch<{ data: AiReviewDto }>(apiRoutes.otwPlay.admin.aiReviewCloseUnknown.build(id), {
    method: 'POST', auth: 'required', json: input,
  });
export const resumeUnissuedAiReview = (id:string,input:AiReviewResumeRequest) =>
  apiFetch<{data:AiReviewDto}>(apiRoutes.otwPlay.admin.aiReviewResume.build(id),{method:'POST',auth:'required',json:input});
export const latestAiReview = (
  input: Pick<AiReviewRequest, "target" | "range">,
) => {
  const p = new URLSearchParams(input.target);
  if (input.range) {
    p.set("startSeconds", String(input.range.startSeconds));
    p.set("endSeconds", String(input.range.endSeconds));
  }
  return apiFetch<{ data: AiReviewDto | null }>(
    `${apiRoutes.otwPlay.admin.aiReviews.build()}?${p}`,
    { auth: "required" },
  );
};
