import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type {TransitionOperationMessage} from "../../../../contracts/content-transition-queue";
import {parsePendingCommand,type PendingCommand} from "../domain/pending-command";
import type {ScheduleActor} from "../domain/schedule";

export type PendingNativeBatch=(statements:D1PreparedStatement[])=>Promise<D1Result[]>;
export class D1PendingTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.resume=resume;
  }
  async run<T>(command:PendingCommand,item:Record<string,unknown>,actor:ScheduleActor,execute:(batch:PendingNativeBatch|null)=>Promise<T>):Promise<T> {
    if(this.resume) {
      const {transitionId,operationId,payloadHash}=this.resume;
      const operation=await this.repository.exportOperation(transitionId,operationId);
      if(operation.payloadHash!==payloadHash || JSON.stringify(parsePendingCommand(operation.payload))!==JSON.stringify(command)) throw new Error("Pending resume identity conflict");
      const owner=await this.repository.readTransition(transitionId);
      return execute(async statements=>{
        const results=await this.repository.commitPending(transitionId,operationId,owner.generation,statements);
        if(!results) throw new Error("Pending operation already completed");
        return results;
      });
    }
    const prepared=await this.repository.preparePendingMutation(command,item);
    if(!prepared) return execute(null);
    const {transition,memberUid,date,holiday,expectedState}=prepared;
    const source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    const operationId=crypto.randomUUID(),now=Date.now();
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"pending.local":"pending.mutate",version:1},kind:"content_edit" as const,
      subject:{table:command.action==="reopen_rejection"?"schedule_candidate_rejections":"pending_schedules",key:JSON.stringify([command.id])},expectedVersion:null,
      validation:{contract:1,validatedAt:now},admittedAt:now,payload:source?{action:command.action,id:command.id,memberUid}:{...command,memberUid,date,holiday,expectedState}};
    try {
      return await execute(async statements=>{
        if(!source) {
          await this.repository.admitNativePending(input,{actorId:actor.actorId,actorName:actor.actorName,actorIp:actor.actorIp});
        }
        const result=await this.repository.commitPending(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input,actorId:actor.actorId,command,memberUid,date,holiday,expectedState}:undefined);
        if(!result) throw new Error("Pending mutation has no original batch result");
        return result;
      });
    } catch(error) {
      const current=await this.repository.readTransition(transition.id);
      if(source && ["source_fenced","target_owned","complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      if(String(error).includes("Expected version conflict") || String(error).includes("malformed JSON")) throw new TransitionWriteError("CONTENT_CONFLICT",transition.targetSite,operationId);
      throw error;
    }
  }
}
