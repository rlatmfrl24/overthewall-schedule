import {D1TransitionRepository,TransitionWriteError} from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import {parseProposalRejection,type ProposalRejectionCommand} from "../domain/proposal-rejection-command";
import {catalogBatchError} from "./catalog-batch-error";

type Acceptance={transition:NonNullable<Awaited<ReturnType<D1TransitionRepository["prepareProposalRejection"]>>>;operationId:string;source:boolean;command:ProposalRejectionCommand};
export class D1ProposalRejectionWriter {
  private readonly repository:D1TransitionRepository;private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;
  }
  async accept(command:ProposalRejectionCommand) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`proposal-reject-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const receipt=await this.repository.readProposalRejectionReceipt(operationId);
    if(receipt) {
      if(receipt.command.actor.userId!==command.actor.userId || JSON.stringify(parseProposalRejection(receipt.command))!==JSON.stringify(parseProposalRejection(command)) || this.resume && (receipt.operation.transitionId!==this.resume.transitionId || receipt.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(receipt.operation.outcome) {
        if(receipt.operation.outcome.outcome==="failed" && receipt.failure) throw catalogBatchError(receipt.failure.message)??new Error(receipt.failure.message);
        if(receipt.operation.outcome.outcome!=="committed" || !receipt.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:receipt.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(receipt.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileNativeProposalRejection(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,operationId,source:false,command:receipt.command}};
    }
    if(this.resume) throw new Error("Missing original proposal rejection receipt");
    const transition=await this.repository.prepareProposalRejection(command.id);
    if(!transition) return {result:null,acceptance:null};
    const source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    return {result:null,acceptance:{transition,operationId,source,command}};
  }
  private input(acceptance:Acceptance) {
    const {transition,operationId,source,command}=acceptance;
    return {transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"otw-play.proposal.reject_local":"otw-play.proposal.reject",version:1},kind:"content_edit" as const,
      subject:{table:"music_cover_proposals",key:JSON.stringify([command.id])},expectedVersion:command.input.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,
      payload:source?{id:command.id,expectedVersion:command.input.expectedVersion}:{...parseProposalRejection(command)!}};
  }
  async write(acceptance:Acceptance,statements:D1PreparedStatement[]) {
    const {transition,operationId,source,command}=acceptance;
    try {
      if(!source) {
        await this.repository.admitNativeProposalRejection(this.input(acceptance),command);
      }
      await this.repository.commitProposalRejection(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input:this.input(acceptance),command}:undefined);
    } catch(error) {
      const terminal=await this.repository.readProposalRejectionReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        if(source && ["source_fenced","target_owned","complete"].includes((await this.repository.readTransition(transition.id)).phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite,operationId);
        if(terminal?.operation.outcome?.outcome==="conflicted" || /Expected version conflict|proposal_rejection_state_conflict/.test(String(error))) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const receipt=await this.repository.readProposalRejectionReceipt(operationId);
    if(!receipt?.result || receipt.operation.outcome?.outcome!=="committed") throw new Error("Missing original proposal rejection result");
    return receipt.result;
  }
}
