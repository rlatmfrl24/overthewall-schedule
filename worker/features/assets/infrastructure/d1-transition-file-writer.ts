import type { SiteId } from "@contracts/site-definition";
import type { D1TransitionRepository } from "../../content-transition";
import type { DurableFileIntent, FileTransitionWriter, VerifiedFile } from "./d1-r2-file-store";

/** Consumes the fixed transition admission, observation and atomic business commit ports. */
export class D1TransitionFileWriter implements FileTransitionWriter {
  private readonly repository:D1TransitionRepository;
  private readonly site:SiteId;
  private readonly fileResource:string;
  constructor(repository:D1TransitionRepository, site:SiteId, fileResource:string) { this.repository=repository;this.site=site;this.fileResource=fileResource; }
  async admit(intent:DurableFileIntent) {
    const transition=await this.repository.findFileTransition(intent.logicalKey);
    if(!transition) return null;
    const existing=await this.repository.readOperation(transition.id,intent.operationId);
    if(existing) {
      const command=await this.repository.readExecutableCommand(transition.id,intent.operationId);
      if(command.codec.id!=="assets.replace" || command.payload.logicalKey!==intent.logicalKey || command.payload.hash!==intent.hash || command.payload.size!==intent.size || command.payload.contentType!==intent.contentType || command.payload.memberUid!==intent.memberUid || command.payload.memberCode!==intent.memberCode) throw new Error("Transferred file operation identity conflict");
      if(transition.sourceSite===this.site) await this.repository.recordFileIntent(transition.id,intent.operationId,{intentId:intent.operationId,logicalKey:intent.logicalKey,versionKey:String(command.payload.versionKey),previousVersion:command.payload.previousVersion as string|null,hash:intent.hash,size:intent.size,status:"intent"});
      const file=await this.repository.exportFileIntent(transition.id,intent.operationId);
      return {transitionId:transition.id,generation:existing.generation,versionKey:file.versionKey,previousVersion:file.previousVersion};
    }
    const now=Date.now();
    const operation=existing??await this.repository.admit({transitionId:transition.id,operationId:intent.operationId,idempotencyKey:intent.operationId,
      codec:{id:"assets.replace",version:1},kind:"content_edit",subject:{table:"asset_file_references",key:JSON.stringify([intent.logicalKey])},expectedVersion:null,
      payload:{logicalKey:intent.logicalKey,versionKey:intent.versionKey,previousVersion:intent.previousVersion,hash:intent.hash,size:intent.size,contentType:intent.contentType,memberUid:intent.memberUid,memberCode:intent.memberCode},validation:{contract:1,validatedAt:now},admittedAt:now});
    await this.repository.recordFileIntent(transition.id,intent.operationId,{intentId:intent.operationId,logicalKey:intent.logicalKey,versionKey:intent.versionKey,previousVersion:intent.previousVersion,hash:intent.hash,size:intent.size,status:"intent"});
    return {transitionId:transition.id,generation:operation.generation,versionKey:intent.versionKey,previousVersion:intent.previousVersion};
  }
  async observe(intent:DurableFileIntent, observed:VerifiedFile) {
    const evidenceId=crypto.randomUUID();
    await this.repository.recordFileObservation(intent.transitionId!,intent.operationId,{transitionId:intent.transitionId!,intentId:intent.operationId,generation:intent.generation,
      site:this.site,resource:this.fileResource,objectVersion:observed.objectVersion,copiedFromEvidenceId:null,evidenceId,versionKey:intent.versionKey,result:"present",hash:observed.hash,size:observed.size,observedAt:Date.now()});
    return evidenceId;
  }
  async commit(intent:DurableFileIntent,evidenceId:string,statements:D1PreparedStatement[]) {
    const owner=await this.repository.readTransition(intent.transitionId!);
    const generation=owner.sourceSite===this.site?owner.generation-1:owner.generation;
    await this.repository.commit(intent.transitionId!,intent.operationId,generation,statements,[{intentId:intent.operationId,evidenceId}]);
  }
}
