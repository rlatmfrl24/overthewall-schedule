import { apiRoutes } from "@contracts/api-routes";
import type { PlayWorkBatch, PlayWorkCommand, PlayWorkDisposition, PlayWorkQueueAction, PlayWorkQueueOverview } from "@contracts/otw-play-work-queue";
import { apiFetch } from "@/shared/api/client";
export const workQueueQueryKey=["otw-play-work-queues"];
export const fetchWorkBatch=(id:string)=>apiFetch<{data:PlayWorkBatch}>(apiRoutes.otwPlay.admin.workBatch.build(id),{auth:"required"});

export const fetchWorkQueues=(cursor?:string,queueId?:string)=>{
  const params=new URLSearchParams();if(cursor)params.set("deferredCursor",cursor);if(queueId)params.set("queueId",queueId);
  return apiFetch<{data:PlayWorkQueueOverview}>(`${apiRoutes.otwPlay.admin.workQueues.build()}${params.size ? `?${params}` : ""}`,{auth:"required"});
};
export const addWorkQueues=(urls:string[])=>apiFetch<{data:{input:string;queueId:string|null;errorMessage:string|null}[]}>(apiRoutes.otwPlay.admin.workQueues.build(),{method:"POST",auth:"required",json:{urls}});
export const commandWorkQueue=(id:string,action:PlayWorkQueueAction,command:PlayWorkCommand)=>apiFetch<{data:PlayWorkBatch|null}>(apiRoutes.otwPlay.admin.workQueueCommand.build(id),{method:"POST",auth:"required",json:{action,...command}});
export const completeWorkBatch=(id:string,command:PlayWorkCommand & {startNext:boolean})=>apiFetch<{data:PlayWorkBatch}>(apiRoutes.otwPlay.admin.workBatchCommand.build(id),{method:"POST",auth:"required",json:{action:"complete",...command}});
export const retryWorkBatch=(id:string,command:PlayWorkCommand)=>apiFetch<{data:PlayWorkBatch}>(apiRoutes.otwPlay.admin.workBatchCommand.build(id),{method:"POST",auth:"required",json:{action:"retry",...command}});
export const updateWorkItem=(id:string,expectedVersion:number,disposition:PlayWorkDisposition,reason:string|null)=>apiFetch<{data:{id:string}}>(apiRoutes.otwPlay.admin.workItem.build(id),{method:"PATCH",auth:"required",json:{expectedVersion,disposition,reason}});
