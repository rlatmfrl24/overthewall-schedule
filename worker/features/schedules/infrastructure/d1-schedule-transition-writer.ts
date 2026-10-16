import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type { ScheduleCommand } from "../domain/schedule-command";
import type { ScheduleActor } from "../domain/schedule";
import type {SaveScheduleResult} from "../../../../contracts/schedules";
import type {TransitionOperationMessage} from "../../../../contracts/content-transition-queue";
import {parseScheduleCommand} from "../domain/schedule-command";

export class D1ScheduleTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",resume?:TransitionOperationMessage) {this.repository=repository;this.site=site;this.resume=resume;}
  private async original(operationId:string,actor:ScheduleActor,command:ScheduleCommand) {
    try {
      const native=await this.repository.readNativeScheduleReceipt(operationId);
      if(native) {
        if(native.actor.actorId!==actor.actorId || JSON.stringify(native.command)!==JSON.stringify(command)) throw new Error("Schedule receipt identity conflict");
        if(native.operation.outcome?.outcome==="conflicted") throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return native.operation.outcome?.outcome==="committed"?native.result:null;
      }
      return await this.repository.readLocalScheduleReceipt(operationId,actor.actorId,command);
    }
    catch(error) {if(String(error).includes("receipt identity conflict")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site);throw error;}
  }

  async write(command: ScheduleCommand, statements: D1PreparedStatement[],actor:ScheduleActor,receipt:{action:SaveScheduleResult["action"];scheduleId:number|null;deletedIdsSql:string;deletedIdsBindings:unknown[]}): Promise<{results:D1Result[];receipt:SaveScheduleResult|null} | null> {
    if(this.resume) {
      const {transitionId,operationId,payloadHash}=this.resume;
      const original=await this.repository.exportOperation(transitionId,operationId);
      if(original.payloadHash!==payloadHash) throw new Error("Resume receipt hash mismatch");
      const executable=await this.repository.readExecutableCommand(transitionId,operationId);
      const expected=parseScheduleCommand(executable.payload);
      if(JSON.stringify(command)!==JSON.stringify(expected)) throw new Error("Resume command mismatch");
      const owner=await this.repository.readTransition(transitionId),native=await this.repository.readNativeScheduleReceipt(operationId);
      const result=native?await this.repository.commitNativeSchedule(transitionId,operationId,owner.generation,statements,receipt):await this.repository.commit(transitionId,operationId,owner.generation,statements);
      if(!result) throw new Error("Missing resumed mutation result");
      return {results:result.businessResults,receipt:(await this.repository.readNativeScheduleReceipt(operationId))?.result??null};
    }
    const operationId=actor.requestId?`schedule-${[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([this.site,actor.requestId]))))].map(value=>value.toString(16).padStart(2,"0")).join("")}`:crypto.randomUUID();
    if(actor.requestId) {
      const previous=await this.original(operationId,actor,command);
      if(previous) return {results:[],receipt:previous};
    }
    const id=command.action==="delete"?command.id:command.input.id;
    const transition=await this.repository.findScheduleTransition(id,command.action==="delete"?null:command.input.member_uid);
    if(!transition) return null;
    const source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    const now=Date.now();
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,
      codec:{id:source?"schedules.local":"schedules.mutate",version:1},kind:command.action==="delete"?"intentional_removal" as const:"content_edit" as const,
      subject:{table:"schedules",key:JSON.stringify([id])},expectedVersion:null,validation:{contract:1,validatedAt:now},payload:command,admittedAt:now};
    try {
      if(!source) {
        await this.repository.admitNativeSchedule(input,{actorId:actor.actorId,actorName:actor.actorName,actorIp:actor.actorIp});
      }
      const result=source?await this.repository.commitLocalSchedule(input,statements,{...receipt,actorId:actor.actorId}):await this.repository.commitNativeSchedule(transition.id,operationId,transition.generation,statements,receipt);
      if(!result) throw new Error("Missing schedule mutation result");
      return {results:result.businessResults,receipt:await this.original(operationId,actor,command)};
    } catch(error) {
      {
        const previous=await this.original(operationId,actor,command);
        if(previous) return {results:[],receipt:previous};
      }
      const current=await this.repository.readTransition(transition.id);
      if(source && ["source_fenced","target_owned","complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      if(String(error).includes("Expected version conflict")) throw new TransitionWriteError("CONTENT_CONFLICT",transition.targetSite);
      throw error;
    }
  }
}
