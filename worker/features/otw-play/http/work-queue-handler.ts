import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { WorkQueueService } from "../application/work-queue-service";
import { WorkQueueError } from "../application/ports/work-queue";

const object=(value:unknown):value is Record<string,unknown>=>Boolean(value && typeof value === "object" && !Array.isArray(value));
const validId=(value:unknown):value is string=>typeof value === "string" && /^[a-zA-Z0-9_:-]{1,400}$/.test(value);
const invalid=()=>new WorkQueueError("invalid_request","작업 요청 대상과 입력을 확인하세요.",400);
export function parseWorkCommand(body:unknown) {
  if (!object(body) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion)<0 || typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) throw invalid();
  return {expectedVersion:Number(body.expectedVersion),idempotencyKey:body.idempotencyKey};
}
export const createWorkQueueHandler=(resolve:(env:Env)=>WorkQueueService)=>async(request:Request,env:Env)=>{
  const admin=await requireAdminUser(request,env);
  if (!admin.ok) return admin.response;
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
  try {
    const url=new URL(request.url), parts=url.pathname.split("/").filter(Boolean), resource=parts[3];
    const id=parts[4] ? decodeURIComponent(parts[4]) : undefined;
    if (id !== undefined && !validId(id)) throw invalid();
    const service=resolve(env);
    if (request.method === "GET") {
      if (resource === "work-queues" && !id) {
        if ([...url.searchParams.keys()].some(k=>!["deferredCursor","queueId"].includes(k)) || ["deferredCursor","queueId"].some(k=>url.searchParams.getAll(k).length>1)) throw invalid();
        const cursor=url.searchParams.get("deferredCursor") ?? undefined;
        const queueId=url.searchParams.get("queueId") ?? undefined;
        if ((cursor && !validId(cursor)) || (queueId && !validId(queueId))) throw invalid();
        return json({data:await service.overview(cursor,queueId)});
      }
      if (resource === "work-batches" && id && !url.search) return json({data:await service.batch(id)});
      throw invalid();
    }
    if (url.search) throw invalid();
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length>131072) throw new WorkQueueError("invalid_request","요청이 너무 큽니다.",413);
    let body:unknown;
    try { body=JSON.parse(raw); } catch { throw invalid(); }
    if (!object(body)) throw invalid();
    const actor={userId:admin.user.id,displayName:admin.user.displayName,ipAddress:request.headers.get("CF-Connecting-IP")};
    if (resource === "work-queues" && !id && request.method === "POST") {
      if (Object.keys(body).some(k=>k !== "urls") || !Array.isArray(body.urls) || !body.urls.length || body.urls.length>100 || body.urls.some(u=>typeof u !== "string" || !u.trim() || u.length>1000)) throw invalid();
      return json({data:await service.add(body.urls as string[],actor.userId)},202);
    }
    if (resource === "work-items" && id && request.method === "PATCH") {
      if (Object.keys(body).some(k=>!["expectedVersion","disposition","reason"].includes(k)) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion)<0 || !["pending","deferred","excluded"].includes(String(body.disposition)) || (body.reason !== null && (typeof body.reason !== "string" || body.reason.length>500))) throw invalid();
      await service.disposition(id,Number(body.expectedVersion),body.disposition as "pending"|"deferred"|"excluded",body.reason as string|null,actor.userId);
      return json({data:{id}});
    }
    if (!id || parts[5] !== "command" || request.method !== "POST") throw invalid();
    if (Object.keys(body).some(k=>!["action","expectedVersion","idempotencyKey","startNext"].includes(k))) throw invalid();
    const command=parseWorkCommand(body);
    if (resource === "work-queues" && ["start","rescan","retry","archive"].includes(String(body.action)) && body.startNext === undefined) {
      return json({data:await service.action(id,body.action as "start"|"rescan"|"retry"|"archive",command,actor.userId)},202);
    }
    if (resource === "work-batches" && body.action === "complete" && typeof body.startNext === "boolean") return json({data:await service.complete(id,{...command,startNext:body.startNext},actor.userId)},202);
    if (resource === "work-batches" && body.action === "retry" && body.startNext === undefined) return json({data:await service.retry(id,command,actor)},202);
    throw invalid();
  } catch (error) {
    const e=error instanceof WorkQueueError ? error : new WorkQueueError("work_queue_unavailable","작업 큐를 불러오거나 처리하지 못했습니다. 최신 상태를 확인하세요.",503);
    return json({error:{code:e.code,message:e.message}},e.status);
  }
};
