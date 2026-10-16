import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {CatalogDeleteCommand} from "../domain/catalog-delete-command";
import {parseCatalogDeleteCommand} from "../domain/catalog-delete-command";
import type {AdminCatalogActor} from "../application/ports/admin-catalog-repository";
import {catalogBatchError} from "./catalog-batch-error";

type Command=CatalogDeleteCommand & {actor:AdminCatalogActor;eventId:string;now:number};
type Acceptance=Awaited<ReturnType<D1TransitionRepository["prepareCatalogDelete"]>> & {operationId:string;source:boolean;command:Command};
export class D1CatalogDeleteWriter {
  private readonly repository:D1TransitionRepository;private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;
  }
  async accept(command:Command) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`catalog-delete-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const existing=await this.repository.readCatalogDeleteReceipt(operationId);
    if(existing) {
      if(existing.command.actor.userId!==command.actor.userId || JSON.stringify(parseCatalogDeleteCommand(existing.command))!==JSON.stringify(parseCatalogDeleteCommand(command)) || this.resume && (existing.operation.transitionId!==this.resume.transitionId || existing.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(existing.operation.outcome) {
        if(existing.operation.outcome.outcome==="failed" && existing.failure) throw catalogBatchError(existing.failure.message)??new Error(existing.failure.message);
        if(existing.operation.outcome.outcome!=="committed" || !existing.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:existing.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(existing.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileNativeCatalogDelete(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,expectedState:String(existing.operation.payload.expectedState),operationId,source:false,command:existing.command}};
    }
    if(this.resume) throw new Error("Missing original catalog deletion receipt");
    const preparation=await this.repository.prepareCatalogDelete(command);
    if(!preparation.transition) return {result:null,acceptance:null};
    const source=preparation.transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(preparation.transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",preparation.transition.targetSite);
    return {result:null,acceptance:{...preparation,operationId,source,command}};
  }
  private input(acceptance:Acceptance) {
    const {command,source,operationId,transition,expectedState}=acceptance;
    if(!transition) throw new Error("Missing catalog deletion owner");
    const payload=parseCatalogDeleteCommand(command)!;
    const table={entity:"music_entities",song:"music_songs",performance:"music_performances",channel:"music_channels"}[command.kind];
    return {transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"otw-play.delete.local":"otw-play.delete.mutate",version:1},kind:"content_edit" as const,
      subject:{table,key:JSON.stringify([command.id])},expectedVersion:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:source?{...payload}:{...payload,expectedState}};
  }
  async write(acceptance:Acceptance,statements:D1PreparedStatement[]) {
    const {transition,source,operationId,command,expectedState}=acceptance;
    if(!transition) throw new Error("Missing catalog deletion owner");
    try {
      if(!source) {
        await this.repository.admitNativeCatalogDelete(this.input(acceptance),command);
      }
      await this.repository.commitCatalogDelete(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input:this.input(acceptance),command,expectedState}:undefined);
    } catch(error) {
      const terminal=await this.repository.readCatalogDeleteReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        if(source && ["source_fenced","target_owned","complete"].includes((await this.repository.readTransition(transition.id)).phase)) {
          if(!terminal && !(await this.repository.prepareCatalogDelete(command)).transition) return null;
          throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite,operationId);
        }
        if(terminal?.operation.outcome?.outcome==="conflicted" || /Expected version conflict|catalog_delete_original_state_conflict/.test(String(error))) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const receipt=await this.repository.readCatalogDeleteReceipt(operationId);
    if(!receipt?.result || receipt.operation.outcome?.outcome!=="committed") throw new Error("Missing original deletion result");
    return receipt.result;
  }
}
