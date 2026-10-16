import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type {TransitionOperationMessage} from "../../../../contracts/content-transition-queue";
import type {LiveScheduleCommand} from "../domain/live-schedule-command";

export class D1LiveScheduleTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.resume=resume;
  }
  async write(command:LiveScheduleCommand,statements:D1PreparedStatement[]):Promise<D1Result[]|null> {
    if(this.resume) {
      const {transitionId,operationId,payloadHash}=this.resume,original=await this.repository.exportOperation(transitionId,operationId);
      if(original.payloadHash!==payloadHash || JSON.stringify(original.payload)!==JSON.stringify(command)) throw new Error("Live-fill resume identity conflict");
      const owner=await this.repository.readTransition(transitionId);
      const result=await this.repository.commitLiveSchedule(transitionId,operationId,owner.generation,statements);
      if(!result) throw new Error("Live-fill operation is already complete");return result;
    }
    const {plan}=command,transition=await this.repository.findScheduleTransition(plan.scheduleId,plan.memberUid);
    if(!transition) return this.repository.commitPublicationBatch([plan.memberUid],statements);
    const source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    const operationId=crypto.randomUUID(),now=Date.now();
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"schedules.live_local":"schedules.live_fill",version:1},kind:"content_edit" as const,
      subject:{table:"schedules",key:JSON.stringify([plan.scheduleId])},expectedVersion:null,validation:{contract:1,validatedAt:now},admittedAt:now,
      payload:source?{action:plan.action,memberUid:plan.memberUid,date:plan.scheduleDate,scheduleId:plan.scheduleId}:command};
    try {
      if(!source) {
        await this.repository.admit(input);
      }
      const results=await this.repository.commitLiveSchedule(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input,command}:undefined);
      if(!results) throw new Error("Missing original live-fill result");return results;
    } catch(error) {
      const owner=await this.repository.readTransition(transition.id);
      if(source && ["source_fenced","target_owned","complete"].includes(owner.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      if(String(error).includes("Expected version conflict") || String(error).includes("malformed JSON")) throw new TransitionWriteError("CONTENT_CONFLICT",transition.targetSite,operationId);
      throw error;
    }
  }
}
