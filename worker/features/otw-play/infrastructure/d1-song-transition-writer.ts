import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {AdminUpdateSongCommand,AdminCreateSongCommand} from "../application/ports/admin-catalog-repository";
import {catalogBatchError} from "./catalog-batch-error";

type Preparation = Awaited<ReturnType<D1TransitionRepository["prepareSongMutation"]>>;
export type SongMutationAcceptance = Preparation & {operationId:string;source:boolean;command:AdminUpdateSongCommand};
type SongCreationAcceptance=Awaited<ReturnType<D1TransitionRepository["prepareSongCreation"]>> & {operationId:string;command:AdminCreateSongCommand};

export class D1SongTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;
  }

  async acceptCreate(command:AdminCreateSongCommand) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`song-create-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const existing=await this.repository.readSongCreationReceipt(operationId);
    if(existing) {
      if(existing.command.actor.userId!==command.actor.userId || JSON.stringify(existing.command.input)!==JSON.stringify(command.input) || this.resume && (existing.operation.transitionId!==this.resume.transitionId || existing.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(existing.operation.outcome) {
        if(existing.operation.outcome.outcome==="failed" && existing.failure) throw catalogBatchError(existing.failure.message)??new Error(existing.failure.message);
        if(existing.operation.outcome.outcome!=="committed" || !existing.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:existing.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(existing.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileSongCreation(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,expectedState:String(existing.operation.payload.expectedState),operationId,command:existing.command}};
    }
    if(this.resume) throw new Error("Missing original song creation receipt");
    const preparation=await this.repository.prepareSongCreation(command);
    return {result:null,acceptance:preparation.transition?{...preparation,operationId,command}:null};
  }

  async writeCreate(acceptance:SongCreationAcceptance,statements:D1PreparedStatement[]) {
    const {transition,operationId,command,expectedState}=acceptance;
    if(!transition) throw new Error("Missing song creation owner");
    await this.repository.admitSongCreation({transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:"otw-play.song.create",version:1},kind:"content_edit",
      subject:{table:"music_songs",key:JSON.stringify([command.ids.songId])},expectedVersion:null,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,
      payload:{id:command.ids.songId,input:command.input,expectedVersion:null,expectedState}},command);
    try {await this.repository.commitSongCreation(transition.id,operationId,transition.generation,statements);}
    catch(error) {
      const terminal=await this.repository.readSongCreationReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        if(terminal?.operation.outcome?.outcome==="conflicted") throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const result=await this.repository.readSongCreationReceipt(operationId);
    if(!result?.result || result.operation.outcome?.outcome!=="committed") throw new Error("Missing original song creation result");
    return result.result;
  }

  async accept(command:AdminUpdateSongCommand) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`song-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    const existing=await this.repository.readSongReceipt(operationId);
    if(existing) {
      if(existing.command.actor.userId!==command.actor.userId || JSON.stringify(existing.command.input)!==JSON.stringify(command.input) || this.resume && (existing.operation.transitionId!==this.resume.transitionId || existing.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      if(existing.operation.outcome) {
        if(existing.operation.outcome.outcome==="failed" && existing.failure) throw catalogBatchError(existing.failure.message)??new Error(existing.failure.message);
        if(existing.operation.outcome.outcome!=="committed" || !existing.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return {result:existing.result,acceptance:null};
      }
      const transition=await this.repository.readTransition(existing.operation.transitionId);
      if(!["target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operationId);
      if(!await this.repository.reconcileNativeSongPrecondition(transition.id,operationId)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return {result:null,acceptance:{transition,expectedState:String(existing.operation.payload.expectedState),operationId,source:false,command:existing.command}};
    }
    if(this.resume) throw new Error("Missing original song receipt");
    const preparation=await this.repository.prepareSongMutation(command.input);
    if(!preparation.transition) return {result:null,acceptance:null};
    const source=preparation.transition.sourceSite===this.site;
    const acceptance={...preparation,operationId,source,command};
    return {result:null,acceptance};
  }

  private input(acceptance:SongMutationAcceptance) {
    const {command,source,operationId,transition,expectedState}=acceptance;
    if(!transition) throw new Error("Missing song owner");
    return {transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"otw-play.song.local_update":"otw-play.song.mutate",version:1},kind:"content_edit" as const,
      subject:{table:"music_songs",key:JSON.stringify([command.input.id])},expectedVersion:command.input.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,
      payload:source?{id:command.input.id,expectedVersion:command.input.expectedVersion}:{...command.input,expectedState}};
  }

  async write(acceptance:SongMutationAcceptance,statements:D1PreparedStatement[]) {
    const {transition,source,operationId,command,expectedState}=acceptance;
    if(!transition) throw new Error("Missing song owner");
    // The repository has now completed its original relation/identity checks
    // and compiled the full batch. Nothing external or business-mutating ran.
    try {
      if(!source) {
        await this.repository.admitNativeSong(this.input(acceptance),command);
      }
      await this.repository.commitSong(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input:this.input(acceptance),command,expectedState}:undefined);
    } catch(error) {
      const terminal=await this.repository.readSongReceipt(operationId);
      if(terminal?.operation.outcome?.outcome!=="committed") {
        // Source admission and the complete business batch are one transaction.
        // If the fence wins, no receipt means that transaction did not commit.
        // This generic dictionary remains source-editable after the fence; the
        // original catalog/version guards still apply to its ordinary retry.
        if(source && !terminal && ["source_fenced","target_owned","complete"].includes((await this.repository.readTransition(transition.id)).phase) && !(await this.repository.prepareSongMutation(command.input)).transition) return null;
        if(terminal?.operation.outcome?.outcome==="conflicted" || /Expected version conflict|song_original_state_conflict/.test(String(error))) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        throw error;
      }
    }
    const receipt=await this.repository.readSongReceipt(operationId);
    if(!receipt?.result || receipt.operation.outcome?.outcome!=="committed") throw new Error("Missing original song result");
    return receipt.result;
  }
}
