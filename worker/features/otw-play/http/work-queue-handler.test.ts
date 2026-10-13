import { beforeEach, expect, it, vi } from "vitest";
import { createWorkQueueHandler } from "./work-queue-handler";
import type { WorkQueueService } from "../application/work-queue-service";
import type { Env } from "../../../platform/types";
const auth=vi.hoisted(()=>vi.fn());
vi.mock("../../../platform/auth",()=>({requireAdminUser:auth}));
beforeEach(()=>auth.mockResolvedValue({ok:true,user:{id:"admin",displayName:"Admin"}}));
it("requires admin authorization before resolving every work queue surface",async()=>{
  auth.mockResolvedValue({ok:false,response:new Response(null,{status:403})});
  const resolve=vi.fn();
  for(const [path,method] of [["work-queues","GET"],["work-queues","POST"],["work-queues/id/command","POST"],["work-batches/id","GET"],["work-batches/id/command","POST"],["work-items/id","PATCH"]]) {
    expect((await createWorkQueueHandler(resolve)(new Request(`https://example.com/api/play/admin/${path}`,{method}),{} as Env)).status).toBe(403);
  }
  expect(resolve).not.toHaveBeenCalled();
});
it("reads progress without mutations and validates command scope and explicit dispositions",async()=>{
  const overview=vi.fn().mockResolvedValue({queues:[]}),action=vi.fn(),disposition=vi.fn();
  const handler=createWorkQueueHandler(()=>({overview,action,disposition}) as unknown as WorkQueueService);
  const read=await handler(new Request("https://example.com/api/play/admin/work-queues"),{} as Env);
  expect(read.headers.get("Cache-Control")).toBe("no-store");expect(action).not.toHaveBeenCalled();
  const post=(body:unknown)=>handler(new Request("https://example.com/api/play/admin/work-queues/id/command",{method:"POST",body:JSON.stringify(body)}),{} as Env);
  expect((await post({action:"start",expectedVersion:0,idempotencyKey:"request-start"})).status).toBe(202);
  expect(action).toHaveBeenCalledWith("id","start",{expectedVersion:0,idempotencyKey:"request-start"},"admin");
  expect((await post({action:"publish",expectedVersion:0,idempotencyKey:"request-start"})).status).toBe(400);
  expect((await post({action:"start",expectedVersion:-1,idempotencyKey:"request-start"})).status).toBe(400);
  expect((await post({action:"start",expectedVersion:0,idempotencyKey:"request-start",candidates:["other"]})).status).toBe(400);
  const patch=await handler(new Request("https://example.com/api/play/admin/work-items/item",{method:"PATCH",body:JSON.stringify({expectedVersion:0,disposition:"converted",reason:null})}),{} as Env);
  expect(patch.status).toBe(400);expect(disposition).not.toHaveBeenCalled();
});
it("scopes deferred reads to a validated playlist without starting work",async()=>{
  const overview=vi.fn().mockResolvedValue({queues:[]});
  const handler=createWorkQueueHandler(()=>({overview}) as unknown as WorkQueueService);
  const response=await handler(new Request("https://example.com/api/play/admin/work-queues?queueId=queue-id&deferredCursor=cursor-id"),{} as Env);
  expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(overview).toHaveBeenCalledWith("cursor-id","queue-id");
  expect((await handler(new Request("https://example.com/api/play/admin/work-queues?queueId=one&queueId=two"),{} as Env)).status).toBe(400);
});
