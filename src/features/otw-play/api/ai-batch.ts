import { apiRoutes } from "@contracts/api-routes";
import type { AiBatchDraft, AiBatchPage, AiBatchSelection, AiBatchSummary } from "@contracts/otw-play-ai-batch";
import { apiFetch } from "@/shared/api/client";

export const previewAiBatch = (selection: AiBatchSelection) => apiFetch<{ data: { count: number } }>(apiRoutes.otwPlay.admin.aiReviewBatchPreview.build(), { method: "POST", auth: "required", json: { selection } });
export const startAiBatch = (selection: AiBatchSelection, idempotencyKey: string) => apiFetch<{ data: AiBatchSummary }>(apiRoutes.otwPlay.admin.aiReviewBatches.build(), { method: "POST", auth: "required", json: { selection, idempotencyKey } });
export const listAiBatches = () => apiFetch<{ data: AiBatchSummary[] }>(apiRoutes.otwPlay.admin.aiReviewBatches.build(), { auth: "required" });
export const getAiBatch = (id: string, cursor?: string) => apiFetch<{ data: AiBatchPage }>(`${apiRoutes.otwPlay.admin.aiReviewBatch.build(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { auth: "required" });
export const retryAiBatch = (id: string) => apiFetch<{ data: AiBatchPage }>(apiRoutes.otwPlay.admin.aiReviewBatchRetry.build(id), { method: "POST", auth: "required" });
export const getAiBatchDraft = (id: string) => apiFetch<{ data: AiBatchDraft | null }>(apiRoutes.otwPlay.admin.aiReviewDraft.build(id), { auth: "required" });
