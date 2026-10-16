import { D1TransitionRepository, TransitionWriteError } from "../../content-transition";
import type { TransitionOperationMessage } from "../../../../contracts/content-transition-queue";
import type { DDayCommand, DDayRequestIdentity } from "../domain/dday-command";

export class D1DDayTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";
  private readonly identity:DDayRequestIdentity;

  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:"otw"|"luvdia",identity:DDayRequestIdentity,resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.identity=identity;this.resume=resume;
  }
  private async original(operationId:string,command:DDayCommand) {
    const receipt=await this.repository.readDDayReceipt(operationId);
    if(!receipt) return null;
    if(receipt.actorId!==this.identity.actorId || JSON.stringify(receipt.command)!==JSON.stringify(command)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
    if(receipt.operation.outcome && receipt.operation.outcome.outcome!=="committed") throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
    return receipt;
  }
  async write(command:DDayCommand,statements:D1PreparedStatement[]):Promise<boolean|null> {
    const operationId=this.resume?.operationId??(this.identity.requestId?`dday-${[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([this.site,this.identity.requestId]))))].map(value=>value.toString(16).padStart(2,"0")).join("")}`:crypto.randomUUID());
    const original=await this.original(operationId,command);
    if(original?.operation.outcome?.outcome==="committed") return original.result?.success??false;
    if(this.resume) {
      if(!original || original.operation.transitionId!==this.resume.transitionId || original.operation.payloadHash!==this.resume.payloadHash) throw new Error("D-day resume identity conflict");
      const owner=await this.repository.readTransition(this.resume.transitionId);
      await this.repository.commitDDay(owner.id,operationId,owner.generation,command,statements);
      return (await this.original(operationId,command))?.result?.success??false;
    }
    const prepared=await this.repository.prepareDDayMutation(command),transition=prepared.transition;
    if(!transition) return null;
    const source=transition.sourceSite===this.site;
    if(source && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
    const now=Date.now(),input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?"ddays.local":command.action==="create"?"ddays.create":"ddays.mutate",version:1},
      kind:command.action==="delete"?"intentional_removal" as const:"content_edit" as const,subject:{table:"ddays",key:JSON.stringify([command.action==="create"?null:command.id])},expectedVersion:null,
      validation:{contract:1,validatedAt:now},admittedAt:now,payload:source?command:{...command,expectedRows:prepared.expectedRows}};
    try {
      if(!source) {
        await this.repository.admitNativeDDay(input,this.identity.actorId,command);
      }
      await this.repository.commitDDay(transition.id,operationId,source?transition.generation-1:transition.generation,command,statements,source?{input,actorId:this.identity.actorId,expectedRows:prepared.expectedRows}:undefined);
      return (await this.original(operationId,command))?.result?.success??false;
    } catch(error) {
      if((await this.original(operationId,command))?.operation.outcome?.outcome==="committed") return true;
      const current=await this.repository.readTransition(transition.id);
      if(source && ["source_fenced","target_owned","complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      if(String(error).includes("Expected version conflict") || String(error).includes("malformed JSON") || String(error).includes("receipt identity conflict")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      throw error;
    }
  }
}
