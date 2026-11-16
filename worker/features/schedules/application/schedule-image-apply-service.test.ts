import { expect, it, vi } from "vitest";
import { ScheduleImageApplyService, type ScheduleImageWriter } from "./schedule-image-apply-service";
import type { ApplyScheduleImageGroup } from "../../../../contracts/schedule-image-import";
it("rechecks an already committed receipt after a retry's authorization check changes",async()=>{
  const group:ApplyScheduleImageGroup={operationId:`${Date.now()}_${crypto.randomUUID()}`,memberUid:1,date:"2026-11-12",expected:"[]",changes:[{clientId:"a",id:null,startTime:null,title:"방송",status:"방송"}],confirmedDeletedIds:[]};
  const receipt={operationId:group.operationId,state:"applied" as const,scheduleIds:[1],expiresAt:Date.now()+86400000};
  const writer:ScheduleImageWriter={imageContext:vi.fn(),imageResult:vi.fn().mockResolvedValueOnce(null).mockResolvedValue(receipt),applyImageGroup:vi.fn().mockResolvedValue(receipt)};
  const service=new ScheduleImageApplyService(writer,{canWrite:()=>false});
  expect(await service.apply(group,{actorId:"user",actorName:null,actorIp:null})).toEqual(receipt);
  expect(writer.imageResult).toHaveBeenCalledTimes(2);expect(writer.applyImageGroup).toHaveBeenCalledOnce();
});
