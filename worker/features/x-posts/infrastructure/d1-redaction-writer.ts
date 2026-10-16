import {D1TransitionRepository,TransitionWriteError} from "../../content-transition";
import type {TransitionOperationMessage} from "../../../../contracts/content-transition-queue";
import type {XActor} from "../application/x-posts-service";
import {parseXRedaction} from "../domain/post-identity";
import {redactStoredXPosts} from "./x-api";

export class D1RedactionWriter {
  private readonly db:D1Database;
  private readonly transition:D1TransitionRepository;
  private readonly site:"otw"|"luvdia";

  private readonly resume?:TransitionOperationMessage;
  constructor(db:D1Database,transition:D1TransitionRepository,site:"otw"|"luvdia",resume?:TransitionOperationMessage) {
    this.db=db;this.transition=transition;this.site=site;this.resume=resume;
  }
  async redact(postId:string,actor:XActor) {
    if(!parseXRedaction({postId})) throw new Error("Invalid X redaction identity");
    let auditWritten=false;
    const result=await redactStoredXPosts(this.db,[postId],async(id,statements)=>{
      const resumed=this.resume?await this.transition.readXRedactionReceipt(this.resume.transitionId,this.resume.operationId):null;
      if(this.resume && (!resumed || resumed.operation.payloadHash!==this.resume.payloadHash || resumed.operation.payload.postId!==id || resumed.operation.codec.id!=="x-posts.redact")) throw new Error("X redaction resume identity conflict");
      if(resumed?.operation.outcome?.outcome==="committed" && resumed.result) {auditWritten=true;return {redacted:Number(resumed.result.changed)};}
      const prepared=await this.transition.prepareXRedaction(id),owner=this.resume?await this.transition.readTransition(this.resume.transitionId):prepared.transition;
      if(!owner) {
        try {return await this.db.batch(statements);}
        catch(error) {
          const current=await this.transition.findRedactionTransition(id);
          if(current?.sourceSite===this.site && ["source_fenced","target_owned","complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED",current.targetSite);
          throw error;
        }
      }
      const source=owner.sourceSite===this.site;
      if(source && ["source_fenced","target_owned","complete"].includes(owner.phase)) throw new TransitionWriteError("CONTENT_MOVED",owner.targetSite);
      const operationId=this.resume?.operationId??crypto.randomUUID(),now=Date.now(),originalActor=resumed?.actor??{actorId:actor.actorId??null,actorName:actor.actorName??null,actorIp:actor.actorIp??null};
      const input={transitionId:owner.id,operationId,idempotencyKey:operationId,kind:"redaction" as const,codec:{id:source?"x-posts.local_redaction":"x-posts.redact",version:1},subject:{table:"x_posts",key:JSON.stringify([id])},expectedVersion:null,validation:{contract:1,validatedAt:now},payload:source?{postId:id}:{postId:id,expectedState:prepared.expectedState},admittedAt:now};
      try {
        if(!source && !this.resume) {
          await this.transition.admitNativeXRedaction(input,originalActor);
        }
        await this.transition.commitXRedaction(owner.id,operationId,source?owner.generation-1:owner.generation,statements,source?{input,actor:originalActor}:undefined);
      } catch(error) {
        const actual=await this.transition.readXRedactionReceipt(owner.id,operationId);
        if(actual?.operation.outcome?.outcome!=="committed") {
          const current=await this.transition.readTransition(owner.id);
          if(source && ["source_fenced","target_owned","complete"].includes(current.phase)) throw new TransitionWriteError("CONTENT_MOVED",owner.targetSite);
          if(String(error).includes("Expected version conflict")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
          throw error;
        }
      }
      const committed=await this.transition.readXRedactionReceipt(owner.id,operationId);
      if(committed?.operation.outcome?.outcome!=="committed" || !committed.result) throw new Error("Missing original X redaction outcome");
      auditWritten=true;return {redacted:Number(committed.result.changed)};
    });
    if(this.resume && !result.found) await this.transition.recordOutcome(this.resume.transitionId,this.resume.operationId,{outcome:"conflicted",sideEffectReconciled:true,detail:"Original redaction post no longer exists"});
    return {found:result.found>0,changed:result.redacted>0,auditWritten};
  }
}
