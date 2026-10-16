import {describe,expect,it} from "vitest";
import {parseTransitionCommand} from "./command-codecs";
const context={sourceSite:"otw" as const,members:[{uid:1,targetUid:10,name:"Bing",externalEntityId:null}]};
describe("registered transition command wire contract",()=>{
  it("uses the owning schedule validator and the shared member projector",async()=>{
    const command=await parseTransitionCommand({codec:{id:"schedules.mutate",version:1},payload:{action:"update",input:{id:7,member_uid:1,date:"2026-10-14",status:"방송",title:"Held save"},expectedRows:[],actorUserId:"private-source-actor"}},context,"source");
    expect(command.payload).toEqual({action:"update",input:{id:7,member_uid:10,date:"2026-10-14",start_time:null,title:"Held save",status:"방송"},expectedRows:[]});
    expect(JSON.stringify(command)).not.toContain("private-source-actor");
    const target={...context,members:[{uid:10,targetUid:10,name:"Bing",externalEntityId:null}]};
    expect(await parseTransitionCommand(command,target,"target")).toEqual(command);
    await expect(parseTransitionCommand({...command,payload:{...command.payload,actorUserId:"forged"}},target,"target")).rejects.toThrow(/allowlist/);
    await expect(parseTransitionCommand({codec:{id:"arbitrary",version:1},payload:{}},target,"target")).rejects.toThrow(/registered/);
    await expect(parseTransitionCommand({codec:{id:"schedules.mutate",version:1},payload:{action:"update",input:{id:7,member_uid:10,date:"2026-02-30",status:"방송"},expectedRows:[]}},target,"target")).rejects.toThrow(/schedule/);
    for(const id of ["schedules.save","otw-play.song.update","source.checkpoint_due"]) await expect(parseTransitionCommand({codec:{id,version:1},payload:{}},target,"target")).rejects.toThrow(/registered/);
  });
});
