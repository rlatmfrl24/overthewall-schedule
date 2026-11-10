import { apiRoutes } from "@contracts/api-routes";
import type { PlayWorkBatch } from "@contracts/otw-play-work-queue";
import { apiFetch } from "@/shared/api/client";
export const workQueueQueryKey=["otw-play-work-queues"];
export const fetchWorkBatch=(id:string)=>apiFetch<{data:PlayWorkBatch}>(apiRoutes.otwPlay.admin.workBatch.build(id),{auth:"required"});
