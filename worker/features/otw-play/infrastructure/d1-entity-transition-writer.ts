import {D1TransitionRepository,TransitionWriteError} from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {AdminEntityMutationCommand} from "../application/ports/admin-catalog-repository";
import {catalogBatchError} from "./catalog-batch-error";

export type EntityMutationAcceptance=Awaited<ReturnType<D1TransitionRepository["prepareEntityMutation"]>> & {operationId:string;source:boolean;command:AdminEntityMutationCommand};
export class D1EntityTransitionWriter {
  private readonly repository:D1TransitionRepository;private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;
  }
  async accept(command:AdminEntityMutationCommand) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`entity-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const existing=await this.repository.readEntityReceipt(operationId);
    if(existing) {
      if(existing.command.actor.userId!==command.actor.userId || existing.command.action!==command.action || JSON.stringify(existing.command.input)!==JSON.stringify(command.input) || this.resume && (existing.operation.transitionId!==this.resume.transitionId || existing.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(existing.operation.outcome) {
        if(existing.operation.outcome.outcome==="failed" && existing.failure) throw catalogBatchError(existing.failure.message)??new Error(existing.failure.message);
        if(existing.operation.outcome.outcome!=="committed" || !existing.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:existing.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(existing.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileNativeEntityPrecondition(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,expectedState:String(existing.operation.payload.expectedState),operationId,source:false,command:existing.command}};
    }
    if(this.resume) throw new Error("Missing original entity receipt");
    const preparation=await this.repository.prepareEntityMutation(command);
    if(!preparation.transition) return {result:null,acceptance:null};
    return {result:null,acceptance:{...preparation,operationId,source:preparation.transition.sourceSite===this.site,command}};
  }
  private input(acceptance:EntityMutationAcceptance) {
    const {command,source,operationId,transition,expectedState}=acceptance;
    if(!transition) throw new Error("Missing entity owner");
    const expectedVersion=command.action==="update"?command.input.expectedVersion:null;
    return {transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"otw-play.entity.local":"otw-play.entity.mutate",version:1},kind:"content_edit" as const,
      subject:{table:"music_entities",key:JSON.stringify([command.id])},expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,
      payload:source?{action:command.action,id:command.id,expectedVersion}:{action:command.action,id:command.id,input:command.input,expectedState}};
  }
  async write(acceptance:EntityMutationAcceptance,statements:D1PreparedStatement[]) {
    const {transition,source,operationId,command,expectedState}=acceptance;
    if(!transition) throw new Error("Missing entity owner");
    try {
      if(!source) {
        await this.repository.admitNativeEntity(this.input(acceptance),command);
      }
      await this.repository.commitEntity(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input:this.input(acceptance),command,expectedState}:undefined);
    } catch(error) {
      const terminal=await this.repository.readEntityReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        if(source && !terminal && ["source_fenced","target_owned","complete"].includes((await this.repository.readTransition(transition.id)).phase) && !(await this.repository.prepareEntityMutation(command)).transition) return null;
        if(terminal?.operation.outcome?.outcome==="conflicted" || /Expected version conflict|entity_original_state_conflict/.test(String(error))) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const receipt=await this.repository.readEntityReceipt(operationId);
    if(!receipt?.result || receipt.operation.outcome?.outcome!=="committed") throw new Error("Missing original entity result");
    return receipt.result;
  }
}
