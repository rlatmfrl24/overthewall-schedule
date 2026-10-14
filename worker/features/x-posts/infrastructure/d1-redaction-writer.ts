import type { D1TransitionRepository } from "../../content-transition";
import { parseXRedaction } from "../domain/post-identity";
import { redactStoredXPosts } from "./x-api";

export class D1RedactionWriter {
  private readonly db:D1Database;
  private readonly transition:D1TransitionRepository;
  constructor(db:D1Database,transition:D1TransitionRepository) { this.db=db;this.transition=transition; }
  async redact(postId:string) {
    if(!parseXRedaction({postId})) throw new Error("Invalid X redaction identity");
    const result=await redactStoredXPosts(this.db,[postId],async(id,statements)=>{
      const owner=await this.transition.findRedactionTransition(id);
      if(!owner) return this.db.batch(statements);
      const operationId=crypto.randomUUID(),now=Date.now();
      const operation=await this.transition.admit({transitionId:owner.id,operationId,idempotencyKey:operationId,kind:"redaction",codec:{id:"x-posts.redact",version:1},subject:{table:"x_posts",key:JSON.stringify([id])},expectedVersion:null,validation:{contract:1,validatedAt:now},payload:{postId:id},admittedAt:now});
      const receipt=await this.transition.commit(owner.id,operationId,operation.generation,statements);
      if(!receipt) throw new Error("Missing redaction commit receipt");
      return receipt.businessResults;
    });
    return {found:result.found>0,changed:result.redacted>0};
  }
}
