import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {AdminPublicationCommand} from "../application/ports/admin-catalog-repository";
import {parsePublicationCommand} from "../domain/publication-command";
import {catalogBatchError} from "./catalog-batch-error";

export type PublicationAcceptance=Awaited<ReturnType<D1TransitionRepository["preparePublication"]>> & {operationId:string;source:boolean;command:AdminPublicationCommand};
export class D1PublicationTransitionWriter {
  private readonly repository:D1TransitionRepository;private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;
  }
  async accept(command:AdminPublicationCommand) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`publication-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const existing=await this.repository.readPublicationReceipt(operationId);
    if(existing) {
      if(existing.command.actor.userId!==command.actor.userId || JSON.stringify(parsePublicationCommand(existing.command))!==JSON.stringify(parsePublicationCommand(command)) || this.resume && (existing.operation.transitionId!==this.resume.transitionId || existing.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(existing.operation.outcome) {
        if(existing.operation.outcome.outcome==="failed" && existing.failure) throw catalogBatchError(existing.failure.message)??new Error(existing.failure.message);
        if(existing.operation.outcome.outcome!=="committed" || !existing.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:existing.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(existing.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileNativePublicationPrecondition(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,expectedState:String(existing.operation.payload.expectedState),operationId,source:false,command:existing.command}};
    }
    if(this.resume) throw new Error("Missing original publication receipt");
    const preparation=await this.repository.preparePublication(command.id);
    if(!preparation.transition) return {result:null,acceptance:null};
    const source=preparation.transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(preparation.transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",preparation.transition.targetSite);
    return {result:null,acceptance:{...preparation,operationId,source,command}};
  }
  private input(acceptance:PublicationAcceptance) {
    const {command,source,operationId,transition,expectedState}=acceptance;
    if(!transition) throw new Error("Missing publication owner");
    const payload=parsePublicationCommand(command)!;
    return {transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"otw-play.publication.local":"otw-play.publication.mutate",version:1},kind:"content_edit" as const,
      subject:{table:"music_performances",key:JSON.stringify([command.id])},expectedVersion:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:source?{...payload}:{...payload,expectedState}};
  }
  async write(acceptance:PublicationAcceptance,statements:D1PreparedStatement[]) {
    const {transition,source,operationId,command,expectedState}=acceptance;
    if(!transition) throw new Error("Missing publication owner");
    try {
      if(!source) {
        await this.repository.admitNativePublication(this.input(acceptance),command);
      }
      await this.repository.commitPublication(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input:this.input(acceptance),command,expectedState}:undefined);
    } catch(error) {
      const terminal=await this.repository.readPublicationReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        if(source && ["source_fenced","target_owned","complete"].includes((await this.repository.readTransition(transition.id)).phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite,operationId);
        if(terminal?.operation.outcome?.outcome==="conflicted" || /Expected version conflict|publication_original_state_conflict/.test(String(error))) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const receipt=await this.repository.readPublicationReceipt(operationId);
    if(!receipt?.result || receipt.operation.outcome?.outcome!=="committed") throw new Error("Missing original publication result");
    return receipt.result;
  }
}
