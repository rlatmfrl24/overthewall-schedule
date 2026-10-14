import {describe,expect,it} from "vitest";
import {parseTransitionCommand} from "./command-codecs";
const context={sourceSite:"otw" as const,members:[{uid:1,targetUid:10,name:"Bing",externalEntityId:null}]};
describe("registered transition command wire contract",()=>{
  it("uses the owning schedule validator and the shared member projector",async()=>{
    const command=await parseTransitionCommand({codec:{id:"schedules.save",version:1},payload:{id:7,member_uid:1,date:"2026-10-14",status:"방송",title:"Held save",actorUserId:"private-source-actor"}},context,"source");
    expect(command.payload).toEqual({id:7,member_uid:10,date:"2026-10-14",start_time:null,title:"Held save",status:"방송"});
    expect(JSON.stringify(command)).not.toContain("private-source-actor");
    const target={...context,members:[{uid:10,targetUid:10,name:"Bing",externalEntityId:null}]};
    expect(await parseTransitionCommand(command,target,"target")).toEqual(command);
    await expect(parseTransitionCommand({...command,payload:{...command.payload,actorUserId:"forged"}},target,"target")).rejects.toThrow(/allowlist/);
    await expect(parseTransitionCommand({codec:{id:"arbitrary",version:1},payload:{}},target,"target")).rejects.toThrow(/registered/);
    await expect(parseTransitionCommand({codec:{id:"schedules.save",version:1},payload:{member_uid:10,date:"2026-02-30",status:"방송"}},target,"target")).rejects.toThrow(/schedule/);
  });
});
