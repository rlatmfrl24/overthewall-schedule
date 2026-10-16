import {D1TransitionRepository,TransitionWriteError} from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import {parseCollectorCommand,type CollectorCommand} from "../domain/collector-command";

export class D1CollectorTransitionWriter {
  get siteId() { return this.site; }
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.resume=resume;
  }
  async write(raw:CollectorCommand,statements:D1PreparedStatement[]):Promise<D1Result[]|null> {
    const command=parseCollectorCommand(raw);if(!command) throw new Error("Invalid original collector batch");
    if(this.resume) {
      const {transitionId,operationId,payloadHash}=this.resume,operation=await this.repository.exportOperation(transitionId,operationId);
      if(operation.payloadHash!==payloadHash || JSON.stringify(parseCollectorCommand(operation.payload))!==JSON.stringify(command)) throw new Error("Collector resume identity mismatch");
      const owner=await this.repository.readTransition(transitionId);
      return this.repository.commitCollector(transitionId,operationId,owner.generation,statements,command);
    }
    const prepared=await this.repository.prepareCollectorMutation(command);
    if(!prepared) {
      const uid=command.action==="insert_candidate"?Number(command.item.member_uid):command.action==="obsolete_candidate"?command.pending.member_uid:command.target?.memberUid;
      return this.repository.commitPublicationBatch(uid?[uid]:[],statements);
    }
    const {transition,memberUids,expectedState}=prepared,source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    const operationId=crypto.randomUUID(),now=Date.now();
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"schedules.collector_local":"schedules.collector",version:1},kind:"content_edit" as const,subject:{table:"pending_schedules",key:JSON.stringify([operationId])},expectedVersion:null,validation:{contract:1,validatedAt:now},admittedAt:now,payload:source?{action:command.action,memberUids}:{...command,expectedState}};
    try {
      if(!source) {
        await this.repository.admit(input);
      }
      const result=await this.repository.commitCollector(transition.id,operationId,source?transition.generation-1:transition.generation,statements,command,source?{input,expectedState}:undefined);
      if(!result) throw new Error("Missing original collector result");return result;
    } catch(error) {
      if(source && (await this.repository.readTransition(transition.id)).phase==="source_fenced") {
        if(command.action==="holiday_obsolete" || command.action==="holiday_create") return null;
        throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      }
      if(String(error).includes("Expected version conflict") || String(error).includes("malformed JSON")) throw new TransitionWriteError("CONTENT_CONFLICT",transition.targetSite,operationId);
      throw error;
    }
  }
}
