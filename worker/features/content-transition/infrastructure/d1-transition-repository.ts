import type { SiteId } from "../../../../contracts/site-definition";
import type {
  AcceptedOperation, CommittedStateInstallation, FileIntent, FileIntentEnvelope, IngressReadiness,
  OperationEnvelope, OperationOutcome, SideEffectAttempt, SourceCheckpoint, SourceFence,
  TransitionIdentity, TransitionPhase, TransitionPlan,
  SourceArchiveReceipt,
  SideEffectEvidence,
  OutcomeReceipt,
  ManifestRevision,
  FileObservation,FileReferenceCommit,
} from "../../../../contracts/content-transition";
import { assertActivation, assertReadiness, assertSameTransition, canAdmit, canCommit, resolveManagedMembers } from "../domain/transition";
import type { TransitionControlPort } from "../application/ports/transition-repository";
import { captureStatements, seedScopeStatements } from "./capture-statements";
import { assertProjectedCommit, projectCommit, type ProjectedCommit } from "../domain/projected-commit";
import { groupedProjectedStatements } from "./projected-statements";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { ownedRootTables, matchKey } from "./capture-graph";
import { D1BaselineStore,digestText, type BaselineHeader, type BaselinePage } from "./d1-baseline-store";
import { manifestResolvedSql,validateClassifications } from "./manifest-statements";
import {sourceJsonValidSql} from "./source-json-validation";
import {parseTransitionCommand,assertOperationMetadata,assertOperationEvidence,assertScheduleExpectedState,type TransitionCommand} from "./command-codecs";
import {readProjectionContext} from "./d1-projection-context";
import {identityProjectionValidSql,validateIdentityProjection} from "./identity-projection";
import {projectCapturedRecord,type ProjectionContext} from "../domain/projected-content";

type Row = {
  id: string; source_site: SiteId; target_site: SiteId; source_resource: string; target_resource: string;
  local_site: SiteId; local_resource: string; generation: number; protocol: number; manifest_digest: string; manifest_revision:number;
  plan_json: string; phase: TransitionPhase; readiness_json: string | null; readiness_expires_at: number | null;
  protection_receipt_json: string | null; fence_json: string | null; installation_json: string | null;
  checkpoint_revision: number; checkpoints_json: string;
};
type OperationRow = { seq:number;source_seq:number|null; envelope_json: string; generation: number; attempt_json: string | null; outcome_json: string | null };
const identity = (row: Row): TransitionIdentity => ({ id: row.id, sourceSite: row.source_site, targetSite: row.target_site, sourceResource: row.source_resource, targetResource: row.target_resource, generation: row.generation, protocol: row.protocol, manifestDigest: row.manifest_digest });
const decodeOperation = (row: OperationRow,source:boolean,fence:string|null=null): OperationEnvelope => {
  const wire=JSON.parse(row.envelope_json);
  delete wire.sourceCommand;
  delete wire.sourceExpectedState;
  return {...wire,sourceFence:source?(fence?JSON.parse(fence):null):(wire.sourceFence??null),generation:row.generation,sourceSequence:source?row.seq:row.source_seq,attempt:row.attempt_json?JSON.parse(row.attempt_json):null,outcome:row.outcome_json?JSON.parse(row.outcome_json):null};
};
const encoded=(value:unknown)=>value===null?null:JSON.stringify(value);
function mergeProgress(current:Pick<OperationEnvelope,"attempt"|"outcome">,incoming:Pick<OperationEnvelope,"attempt"|"outcome">) {
  let attempt=current.attempt??incoming.attempt,outcome=current.outcome??incoming.outcome;
  if(current.attempt && incoming.attempt) {
    if(current.attempt.identity!==incoming.attempt.identity) throw new Error("Conflicting transfer attempt identity");
    const rank={attempted:0,unknown:1,completed:2,failed:2};
    if(rank[current.attempt.status]===2 && rank[incoming.attempt.status]===2 && current.attempt.status!==incoming.attempt.status) throw new Error("Conflicting terminal attempt");
    if(rank[incoming.attempt.status]>rank[current.attempt.status]) attempt=incoming.attempt;
  }
  if(current.outcome && incoming.outcome) {
    if(current.outcome.outcome!==incoming.outcome.outcome || current.outcome.detail!==incoming.outcome.detail) throw new Error("Conflicting terminal outcome");
    if(incoming.outcome.sideEffectReconciled) outcome=incoming.outcome;
  }
  if(outcome?.sideEffectReconciled && attempt && !["completed","failed"].includes(attempt.status)) throw new Error("Transferred outcome has an uncertain attempt");
  return {attempt,outcome};
}
function finalTransfer(row:Row,fence:SourceFence|null,sequence:number|null,kind:"operation"|"file") {
  if(fence===null) return false;
  if(!row.fence_json || JSON.stringify(fence)!==row.fence_json || !sequence || sequence>(kind==="operation"?fence.operationBoundary:fence.fileIntentBoundary)) throw new Error("Transfer does not match the persisted source fence");
  return true;
}

export class D1TransitionRepository implements TransitionControlPort {
  private readonly db: D1Database;
  private readonly site: SiteId;
  private readonly resource: string;
  private readonly fileResource:string|null;
  constructor(db: D1Database, site: SiteId, resource: string, fileResource:string|null=null) { this.db=db; this.site=site; this.resource=resource; this.fileResource=fileResource; }

  private async row(id: string): Promise<Row> {
    const row = await this.db.prepare("SELECT * FROM content_transitions WHERE id=? AND local_site=? AND local_resource=?").bind(id, this.site, this.resource).first<Row>();
    if (!row) throw new Error("Transition not found on the selected resource");
    return row;
  }
  private side(row: Row) { return row.source_site === this.site ? "source" : "target"; }
  async readTransition(id: string) { const row = await this.row(id); return { ...identity(row), phase: row.phase }; }
  async prepare(plan: TransitionPlan): Promise<void> {
    validateClassifications(plan);
    const members = resolveManagedMembers(plan.members);
    if (!plan.id || !plan.manifestDigest || plan.protocol !== 1 || plan.generation < 2 || !Number.isSafeInteger(plan.generation)) throw new Error("Invalid transition plan");
    resolveManagedMembers(plan.members.map(member=>({code:member.code,uid:member.targetUid})));
    const targetRosterGuard=`NOT EXISTS(SELECT 1 FROM members m WHERE NOT EXISTS(SELECT 1 FROM content_transitions t JOIN json_each(t.plan_json,'$.members') approved WHERE t.id=? AND t.local_site=t.target_site AND json_extract(approved.value,'$.targetUid')=m.uid AND json_extract(approved.value,'$.code')=m.code AND (EXISTS(SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=t.id AND b.row_table='members' AND b.row_key=json_array(m.uid) AND b.installed=1) OR EXISTS(SELECT 1 FROM content_transition_materialized_rows r WHERE r.transition_id=t.id AND r.row_table='members' AND r.row_key=json_array(m.uid)))))`;
    if(this.site===plan.targetSite && !await this.db.prepare(`SELECT ${targetRosterGuard} owned`).bind(plan.id).first<number>("owned")) throw new Error("Unowned target roster conflicts with approved identity bootstrap");
    if(this.site===plan.sourceSite) {
      const rows = (await this.db.prepare("SELECT uid,code FROM members WHERE code IN ('bing_hayu','u_lili','yang_mei')").all<{ uid: number; code: string }>()).results;
      if (JSON.stringify(resolveManagedMembers(rows)) !== JSON.stringify(members)) throw new Error("Manifest member identity mismatch");
      const resolved=await this.db.prepare(`WITH t AS (SELECT ? plan_json,? local_site,? source_site) SELECT ${manifestResolvedSql(false)} resolved FROM t`).bind(JSON.stringify(plan),this.site,plan.sourceSite).first<number>("resolved");
      if(!resolved) throw new Error("Unresolved source manifest classification");
    }
    const prepare=this.db.prepare(`INSERT OR IGNORE INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${this.site===plan.targetSite?targetRosterGuard:"1"}`).bind(plan.id, plan.sourceSite, plan.targetSite, plan.sourceResource, plan.targetResource, this.site, this.resource, plan.generation, plan.protocol, plan.manifestDigest, JSON.stringify(plan),...(this.site===plan.targetSite?[plan.id]:[]));
    try { await this.db.batch([prepare,...(this.site===plan.sourceSite?[this.db.prepare(`UPDATE content_transitions AS t SET plan_json=iif(${sourceJsonValidSql("t.id")},plan_json,NULL) WHERE id=?`).bind(plan.id)]:[])]); }
    catch(error) { throw new Error("Manifest source JSON/identity validation failed",{cause:error}); }
    const row = await this.row(plan.id);
    assertSameTransition(plan, identity(row));
    if (row.plan_json !== JSON.stringify(plan)) throw new Error("Existing transition needs explicit repair");
  }
  async appendClassifications(id:string,parent:ManifestRevision["parent"],additions:TransitionPlan["classifications"],digest:string,protection:ManifestRevision["protection"]):Promise<ManifestRevision> {
    const row=await this.row(id);
    if(this.side(row)!=="source") throw new Error("Only source proposes a manifest revision");
    const duplicate=await this.db.prepare("SELECT receipt_json FROM content_transition_manifest_revisions WHERE transition_id=? AND revision=?").bind(id,parent.revision+1).first<string>("receipt_json");
    if(duplicate) {
      const existing:ManifestRevision=JSON.parse(duplicate);
      const priorCount=existing.plan.classifications.length-additions.length;
      if(existing.parent.digest!==parent.digest || existing.plan.manifestDigest!==digest || JSON.stringify(existing.plan.classifications.slice(priorCount))!==JSON.stringify(additions) || JSON.stringify(existing.protection)!==JSON.stringify(protection)) throw new Error("Conflicting manifest revision");
      if(row.fence_json) throw new Error("Manifest is frozen");
      return existing;
    }
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const revision:ManifestRevision={plan:{...plan,manifestDigest:digest,classifications:[...plan.classifications,...additions]},parent,revision:parent.revision+1,protection};
    await this.persistManifestRevision(revision);
    return revision;
  }
  async acceptManifestRevision(revision:ManifestRevision):Promise<void> {
    const row=await this.row(revision.plan.id);
    if(this.side(row)!=="target") throw new Error("Only target accepts source manifest lineage");
    await this.persistManifestRevision(revision);
  }
  private async persistManifestRevision(revision:ManifestRevision):Promise<void> {
    const row=await this.row(revision.plan.id),plan:TransitionPlan=JSON.parse(row.plan_json);
    if(row.fence_json || !["prepared","protected","copying","replaying","target_ingress_ready"].includes(row.phase)) throw new Error("Manifest is frozen");
    const existing=await this.db.prepare("SELECT receipt_json FROM content_transition_manifest_revisions WHERE transition_id=? AND revision=?").bind(row.id,revision.revision).first<string>("receipt_json");
    if(existing) { if(existing!==JSON.stringify(revision)) throw new Error("Conflicting manifest revision"); return; }
    assertSameTransition(identity(row),{...revision.plan,manifestDigest:row.manifest_digest});
    validateClassifications(revision.plan);
    if(revision.parent.revision!==row.manifest_revision || revision.parent.digest!==row.manifest_digest || revision.revision!==row.manifest_revision+1 || !revision.plan.manifestDigest || revision.plan.manifestDigest===row.manifest_digest || JSON.stringify(revision.plan.members)!==JSON.stringify(plan.members) || JSON.stringify(revision.plan.classifications.slice(0,plan.classifications.length))!==JSON.stringify(plan.classifications) || revision.plan.classifications.length<=plan.classifications.length) throw new Error("Manifest parent or append-only classification conflict");
    if(!revision.protection.receiptId || revision.protection.protocol!==row.protocol || revision.protection.manifestDigest!==revision.plan.manifestDigest) throw new Error("Manifest protection receipt mismatch");
    const additions=revision.plan.classifications.slice(plan.classifications.length);
    for(const entry of additions) {
      const captured=await this.db.prepare("SELECT EXISTS(SELECT 1 FROM content_transition_images WHERE transition_id=? AND row_table=? AND row_key=?) OR EXISTS(SELECT 1 FROM content_transition_baseline_rows WHERE transition_id=? AND row_table=? AND row_key=?) captured").bind(row.id,entry.table,entry.key,row.id,entry.table,entry.key).first<number>("captured");
      if(captured) throw new Error("Revision cannot reinterpret already captured or staged baseline rows");
    }
    const source=this.side(row)==="source",capture=source && row.phase!=="prepared",op=`manifest:${revision.revision}`;
    const statements=[
      this.db.prepare("UPDATE content_transitions SET manifest_revision=iif(manifest_revision=? AND manifest_digest=? AND fence_json IS NULL AND phase IN ('prepared','protected','copying','replaying','target_ingress_ready'),manifest_revision,NULL) WHERE id=?").bind(revision.parent.revision,revision.parent.digest,row.id),
      this.db.prepare("UPDATE content_transitions SET manifest_revision=?,manifest_digest=?,plan_json=?,protection_receipt_json=?,readiness_json=NULL,readiness_expires_at=NULL,phase=iif(local_site=source_site AND phase='target_ingress_ready','replaying',phase) WHERE id=?").bind(revision.revision,revision.plan.manifestDigest,JSON.stringify(revision.plan),JSON.stringify(revision.protection),row.id),
    ];
    if(capture) statements.push(
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(row.id,op),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,id,?,generation-1,(${manifestResolvedSql()}),(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions t WHERE id=?`).bind(op,row.id,op,row.id),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots(transition_id,root_table,root_key) SELECT ?,json_extract(value,'$.table'),json_extract(value,'$.key') FROM json_each(?) WHERE json_extract(value,'$.disposition')='include'").bind(row.id,JSON.stringify(additions)),
      ...captureStatements(this.db,row.id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql("content_transition_permits.transition_id")} WHERE transition_id=?`).bind(row.id),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?").bind(row.id,op),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(row.id),
    );
    statements.push(this.db.prepare("INSERT INTO content_transition_manifest_revisions(transition_id,revision,parent_digest,manifest_digest,receipt_json) VALUES(?,?,?,?,?)").bind(row.id,revision.revision,revision.parent.digest,revision.plan.manifestDigest,JSON.stringify(revision)));
    await this.db.batch(statements);
    const readback=await this.db.prepare("SELECT receipt_json FROM content_transition_manifest_revisions WHERE transition_id=? AND revision=?").bind(row.id,revision.revision).first<string>("receipt_json");
    if(readback!==JSON.stringify(revision)) throw new Error("Manifest revision readback mismatch");
  }
  async protect(id: string, receipt: { receiptId: string; protocol: number; manifestDigest: string }) {
    const row = await this.row(id);
    if (this.side(row) !== "source" || receipt.protocol !== row.protocol || receipt.manifestDigest !== row.manifest_digest || !receipt.receiptId) throw new Error("Invalid protection receipt");
    if (row.protection_receipt_json === JSON.stringify(receipt) && row.phase !== "prepared") return;
    if (row.phase !== "prepared") throw new Error("Protection cannot replace an active transition");
    let result:D1Result[];
    try { result=await this.db.batch([
      this.db.prepare("UPDATE content_transitions SET phase='protected',protection_receipt_json=? WHERE id=? AND phase='prepared'").bind(JSON.stringify(receipt), id),
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,'baseline')").bind(id),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,id,'baseline',generation-1,(phase='protected' AND ${manifestResolvedSql()}),(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline') FROM content_transitions t WHERE id=?`).bind(id, id),
      ...seedScopeStatements(this.db, id), ...captureStatements(this.db, id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql("content_transition_permits.transition_id")} WHERE transition_id=?`).bind(id),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id='baseline'").bind(id),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
    ]); } catch(error) { throw new Error("Protection failed; verify current manifest classification and source state",{cause:error}); }
    return {statements:result.length,rowsRead:result.reduce((n,r)=>n+r.meta.rows_read,0),rowsWritten:result.reduce((n,r)=>n+r.meta.rows_written,0),duration:result.reduce((n,r)=>n+r.meta.duration,0)};
  }
  private async advance(id: string, from: TransitionPhase, to: TransitionPhase): Promise<void> {
    const row = await this.row(id);
    if (row.phase === to) return;
    const result = await this.db.prepare("UPDATE content_transitions SET phase=? WHERE id=? AND phase=?").bind(to, id, from).run();
    if (result.meta.changes !== 1) throw new Error("Transition phase conflict");
  }
  beginCopy(id: string) { return this.advance(id, "protected", "copying"); }
  beginReplay(id: string) { return this.advance(id, "copying", "replaying"); }
  async openIngress(id: string, receiptId: string, expiresAt: number): Promise<IngressReadiness> {
    const row = await this.row(id);
    if (this.side(row) !== "target" || !receiptId || !Number.isSafeInteger(expiresAt)) throw new Error("Invalid target ingress");
    const receipt = { ...identity(row), receiptId, expiresAt };
    const previous:IngressReadiness|null=row.readiness_json?JSON.parse(row.readiness_json):null;
    if(row.fence_json || !["prepared","target_ingress_ready"].includes(row.phase)) throw new Error("Ingress readiness is frozen");
    if(row.readiness_json===JSON.stringify(receipt)) return receipt;
    if(previous && (receiptId===previous.receiptId || expiresAt<=previous.expiresAt)) throw new Error("Readiness renewal must preserve receipt identity and advance expiry");
    const result = await this.db.prepare("UPDATE content_transitions SET phase='target_ingress_ready',readiness_json=?,readiness_expires_at=? WHERE id=? AND phase IN ('prepared','target_ingress_ready') AND fence_json IS NULL AND readiness_json IS ? AND manifest_digest=? AND manifest_revision=?").bind(JSON.stringify(receipt), expiresAt, id,row.readiness_json,row.manifest_digest,row.manifest_revision).run();
    if (result.meta.changes !== 1) throw new Error("Ingress readiness race; retry from persisted state");
    const actual=await this.readReadiness(id);
    if(JSON.stringify(actual)!==JSON.stringify(receipt)) throw new Error("Readiness changed before readback; retry");
    return actual!;
  }
  async readReadiness(id: string): Promise<IngressReadiness | null> { const row = await this.row(id); return row.readiness_json ? JSON.parse(row.readiness_json) : null; }
  async acknowledgeIngress(receipt: IngressReadiness, now: number): Promise<void> {
    const row = await this.row(receipt.id);
    if (this.side(row) !== "source") throw new Error("Only source records target readiness");
    assertReadiness(identity(row), receipt, now);
    if(row.fence_json || !["replaying","target_ingress_ready"].includes(row.phase)) throw new Error("Source readiness phase conflict");
    if (row.readiness_json === JSON.stringify(receipt) && row.phase === "target_ingress_ready") return;
    const previous:IngressReadiness|null=row.readiness_json?JSON.parse(row.readiness_json):null;
    if(previous && (receipt.receiptId===previous.receiptId || receipt.expiresAt<=previous.expiresAt)) throw new Error("Stale readiness renewal");
    const result = await this.db.prepare("UPDATE content_transitions SET phase='target_ingress_ready',readiness_json=?,readiness_expires_at=? WHERE id=? AND phase IN ('replaying','target_ingress_ready') AND fence_json IS NULL AND readiness_json IS ? AND manifest_digest=? AND manifest_revision=?").bind(JSON.stringify(receipt), receipt.expiresAt, receipt.id,row.readiness_json,row.manifest_digest,row.manifest_revision).run();
    if (result.meta.changes !== 1) throw new Error("Source readiness phase conflict");
    if(JSON.stringify(await this.readReadiness(receipt.id))!==JSON.stringify(receipt)) throw new Error("Source readiness changed before readback; retry");
  }
  async admit(input: Omit<AcceptedOperation,"payloadHash"|"expectedState">): Promise<OperationEnvelope> {
    let operation:AcceptedOperation={...input,payloadHash:"",expectedState:null};
    const row = await this.row(operation.transitionId);
    if (!canAdmit(this.side(row), row.phase)) throw new Error("Admission moved to the target site");
    if (!operation.operationId || !operation.idempotencyKey || operation.validation.contract !== row.protocol) throw new Error("Invalid admitted operation");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const boundary=this.side(row)==="source" && operation.codec.id==="otw-play.song.update"?await this.db.prepare("SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1").bind(plan.id).first<number>("n"):null;
    const context=boundary?await readProjectionContext(this.db,plan,boundary):{sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:this.side(row)==="source"?member.uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))};
    const command=await parseTransitionCommand(operation,context,this.side(row));
    const sourceCommand=this.side(row)==="source"?await parseTransitionCommand(operation,{...context,entities:[],members:context.members.map(member=>({...member,targetUid:member.uid}))},"source"):null;
    const prior=await this.readOperation(row.id,operation.operationId);
    const sourceExpectedState=!prior && operation.codec.id==="schedules.save"?await this.db.prepare(`SELECT ${contentDispositionRegistry.schedules.values.join(",")} FROM schedules WHERE id=?`).bind(command.payload.id).first<Record<string,string|number|null>>():null;
    let expectedContext:ProjectionContext=context;
    if(sourceExpectedState) {
      assertScheduleExpectedState(sourceExpectedState,command.payload.id);
      if(this.side(row)==="source" && !context.members.some(member=>member.uid===sourceExpectedState.member_uid)) {
        const member=await this.db.prepare("SELECT uid,name FROM members WHERE uid=?").bind(sourceExpectedState.member_uid).first<{uid:number;name:string}>();
        if(!member) throw new Error("Unknown original schedule member");
        // An existing nonselected source row has no prior target image. Let the
        // same projector decide exclusion; no projection exception is absence.
        expectedContext={...context,members:[...context.members,{...member,targetUid:null,externalEntityId:null}]};
      }
    }
    const projected=sourceExpectedState?await projectCapturedRecord("schedules",operation.subject.key,sourceExpectedState,expectedContext):null;
    const expectedState=prior?prior.expectedState:projected?Object.fromEntries(contentDispositionRegistry.schedules.values.map(key=>[key,projected.value[key]])) as AcceptedOperation["expectedState"]:null;
    operation={transitionId:operation.transitionId,operationId:operation.operationId,idempotencyKey:operation.idempotencyKey,kind:operation.kind,subject:{table:operation.subject.table,key:operation.subject.key},expectedVersion:operation.expectedVersion,expectedState,validation:{contract:operation.validation.contract,validatedAt:operation.validation.validatedAt},admittedAt:operation.admittedAt,...command,payloadHash:await digestText(JSON.stringify({...command,expectedState}))};
    assertOperationMetadata(operation);
    const phases = this.side(row) === "source" ? "'prepared','protected','copying','replaying','target_ingress_ready'" : "'target_ingress_ready','source_fenced','target_owned','complete'";
    await this.db.prepare(`INSERT OR IGNORE INTO content_transition_operations(transition_id,operation_id,idempotency_key,payload_hash,generation,admitted_at,envelope_json)
      SELECT id,?,?,?,${this.side(row) === "source" ? "generation-1" : "generation"},?,? FROM content_transitions WHERE id=? AND phase IN (${phases})`)
      .bind(operation.operationId, operation.idempotencyKey, operation.payloadHash, operation.admittedAt, JSON.stringify(sourceCommand?{...operation,sourceCommand,sourceExpectedState}:operation), operation.transitionId).run();
    const received = await this.readOperation(operation.transitionId, operation.operationId);
    if (!received) throw new Error("Admission conflict or fence race");
    const actualAdmission=Object.fromEntries(Object.entries(received).filter(([key])=>!["generation","sourceSequence","sourceFence","attempt","outcome"].includes(key)));
    if(JSON.stringify(actualAdmission)!==JSON.stringify(operation)) throw new Error("Admission identity conflict");
    return received;
  }
  async readOperation(id: string, operationId: string): Promise<OperationEnvelope | null> {
    const transition=await this.row(id);
    const row = await this.db.prepare("SELECT seq,source_seq,envelope_json,generation,attempt_json,outcome_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id, operationId).first<OperationRow>();
    return row ? decodeOperation(row,this.side(transition)==="source",transition.fence_json) : null;
  }
  async exportOperation(id: string, operationId: string): Promise<OperationEnvelope> {
    const operation = await this.readOperation(id, operationId);
    if (!operation) throw new Error("Missing admitted operation");
    return operation;
  }
  /** Selects coordinates under current business ownership. Original source
   * command is source-local and never included in any transport envelope. */
  async readExecutableCommand(id:string,operationId:string):Promise<TransitionCommand> {
    const row=await this.row(id),side=this.side(row);
    if(!canCommit(side,row.phase,side==="source"?row.generation-1:row.generation,row.generation)) throw new Error("Business command execution is fenced");
    const operation=await this.exportOperation(id,operationId);
    if(operation.outcome) throw new Error("Operation already has a terminal disposition");
    if(side==="target") return {codec:operation.codec,payload:operation.payload};
    const local=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceCommand') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("value");
    if(!local) throw new Error("Missing validated source-local command");
    return JSON.parse(local);
  }
  async receiveOperation(envelope: OperationEnvelope): Promise<{ operationId: string; payloadHash: string }> {
    const row = await this.row(envelope.transitionId);
    if (this.side(row) !== "target" || !canAdmit("target", row.phase) || envelope.generation !== row.generation-1) throw new Error("Transfer receiver is not ready for this generation");
    if(Object.keys(envelope).sort().join(",")!=="admittedAt,attempt,codec,expectedState,expectedVersion,generation,idempotencyKey,kind,operationId,outcome,payload,payloadHash,sourceFence,sourceSequence,subject,transitionId,validation") throw new Error("Unknown operation envelope field");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const context={sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))};
    const command=await parseTransitionCommand(envelope,context,"target");
    assertOperationMetadata(envelope);
    assertOperationEvidence(envelope);
    if(envelope.expectedState && !plan.members.some(member=>member.targetUid===envelope.expectedState!.member_uid)) throw new Error("Unapproved expected-state member");
    if(await digestText(JSON.stringify({...command,expectedState:envelope.expectedState}))!==envelope.payloadHash) throw new Error("Command payload hash conflict");
    const { generation,sourceSequence,sourceFence, attempt, outcome, ...admission } = envelope;
    if(!Number.isSafeInteger(sourceSequence) || sourceSequence!<1) throw new Error("Missing source sequence");
    const final=finalTransfer(row,sourceFence,sourceSequence,"operation");
    mergeProgress({attempt:null,outcome:null},{attempt,outcome});
    await this.db.prepare(`INSERT OR IGNORE INTO content_transition_operations(transition_id,operation_id,idempotency_key,payload_hash,generation,admitted_at,envelope_json,attempt_json,outcome_json,source_seq,transferred)
      SELECT ?,?,?,?,?,?,?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced','target_owned','complete') AND fence_json IS ?)`)
      .bind(envelope.transitionId, envelope.operationId, envelope.idempotencyKey, envelope.payloadHash, generation, envelope.admittedAt, JSON.stringify(admission),encoded(attempt),encoded(outcome),sourceSequence,row.id,row.fence_json).run();
    const actual = await this.exportOperation(envelope.transitionId, envelope.operationId);
    const actualIdentity=Object.fromEntries(Object.entries(actual).filter(([key])=>!["attempt","outcome","sourceFence"].includes(key)));
    const incomingIdentity=Object.fromEntries(Object.entries(envelope).filter(([key])=>!["attempt","outcome","sourceFence"].includes(key)));
    if (JSON.stringify(actualIdentity)!==JSON.stringify(incomingIdentity)) throw new Error("Conflicting transfer identity");
    const progress=mergeProgress(actual,envelope);
    const result=await this.db.prepare(`UPDATE content_transition_operations SET attempt_json=?,outcome_json=?,transferred=max(transferred,?),envelope_json=json_set(envelope_json,'$.sourceFence',json(?))
      WHERE transition_id=? AND operation_id=? AND attempt_json IS ? AND outcome_json IS ? AND json_extract(envelope_json,'$.sourceFence') IS ?
      AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced','target_owned','complete') AND fence_json IS ?)`)
      .bind(encoded(progress.attempt),encoded(progress.outcome),final?1:0,JSON.stringify(sourceFence??actual.sourceFence),row.id,envelope.operationId,encoded(actual.attempt),encoded(actual.outcome),encoded(actual.sourceFence),row.id,row.fence_json).run();
    if(result.meta.changes!==1) throw new Error("Transfer progress race; retry authoritative state");
    const persisted=await this.exportOperation(row.id,envelope.operationId);
    mergeProgress(persisted,progress);
    return { operationId: actual.operationId, payloadHash: actual.payloadHash };
  }
  async recordAttempt(id: string, operationId: string, attempt: SideEffectAttempt): Promise<void> {
    assertOperationEvidence({attempt,outcome:null});
    const row=await this.row(id);
    const phases=this.side(row)==="source"?"'prepared','protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    const existing = await this.exportOperation(id, operationId);
    if (existing.attempt && existing.attempt.identity !== attempt.identity) throw new Error("Reconcile the existing side-effect identity before any new execution");
    if(existing.attempt && ["completed","failed"].includes(existing.attempt.status) && existing.attempt.status!==attempt.status) throw new Error("Terminal attempt evidence cannot be overwritten");
    const result=await this.db.prepare(`UPDATE content_transition_operations SET attempt_json=? WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL AND attempt_json IS ? AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))`).bind(JSON.stringify(attempt), id, operationId, existing.attempt?JSON.stringify(existing.attempt):null,id).run();
    if(result.meta.changes!==1) throw new Error("Attempt owner moved; preserve late result as evidence");
  }
  async recordEvidence(id:string,operationId:string,evidence:SideEffectEvidence):Promise<void> {
    await this.row(id);
    if(!evidence.evidenceId || !Number.isSafeInteger(evidence.observedAt) || !["completed","failed","unknown"].includes(evidence.result)) throw new Error("Invalid side-effect evidence");
    await this.db.prepare("INSERT OR IGNORE INTO content_transition_evidence(transition_id,operation_id,evidence_id,attempt_identity,evidence_json) SELECT transition_id,operation_id,?,?,? FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND json_extract(attempt_json,'$.identity')=?")
      .bind(evidence.evidenceId,evidence.attemptIdentity,JSON.stringify(evidence),id,operationId,evidence.attemptIdentity).run();
    const actual=await this.db.prepare("SELECT evidence_json FROM content_transition_evidence WHERE transition_id=? AND operation_id=? AND evidence_id=?").bind(id,operationId,evidence.evidenceId).first<string>("evidence_json");
    if(actual!==JSON.stringify(evidence)) throw new Error("Side-effect evidence is immutable or attempt identity is unknown");
  }
  async reconcileEvidence(id:string,operationId:string,evidenceId:string):Promise<void> {
    const row=await this.row(id),generation=this.side(row)==="source"?row.generation-1:row.generation;
    if(!canCommit(this.side(row),row.phase,generation,row.generation)) throw new Error("Only final owner reconciles operation state");
    const raw=await this.db.prepare("SELECT evidence_json FROM content_transition_evidence WHERE transition_id=? AND operation_id=? AND evidence_id=?").bind(id,operationId,evidenceId).first<string>("evidence_json");
    if(!raw) throw new Error("Missing immutable reconciliation evidence");
    const evidence:SideEffectEvidence=JSON.parse(raw);
    if(evidence.result==="unknown") throw new Error("Side effect remains uncertain");
    const phases=this.side(row)==="source"?"'prepared','protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    const result=await this.db.prepare(`UPDATE content_transition_operations SET attempt_json=json_set(attempt_json,'$.status',?),
      outcome_json=iif(outcome_json IS NULL,NULL,json_set(outcome_json,'$.sideEffectReconciled',json('true')))
      WHERE transition_id=? AND operation_id=? AND json_extract(attempt_json,'$.identity')=?
        AND (json_extract(attempt_json,'$.status') IN ('attempted','unknown') OR json_extract(attempt_json,'$.status')=?)
        AND EXISTS(SELECT 1 FROM content_transition_evidence e WHERE e.transition_id=? AND e.operation_id=? AND e.evidence_id=? AND e.evidence_json=?)
        AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))`)
      .bind(evidence.result,id,operationId,evidence.attemptIdentity,evidence.result,id,operationId,evidenceId,raw,id).run();
    if(result.meta.changes!==1 || (await this.exportOperation(id,operationId)).attempt?.status!==evidence.result) throw new Error("Reconciliation identity/owner conflict");
  }
  async recordFileIntent(id: string, operationId: string, intent: FileIntent): Promise<void> {
    const row = await this.row(id);
    if (!canAdmit(this.side(row), row.phase)) throw new Error("New file intent moved to target");
    if(!intent.intentId || !intent.versionKey || !intent.logicalKey || !["intent","unknown","put_verified","reference_committed"].includes(intent.status) || intent.hash!==null && !/^[a-f0-9]{64}$/.test(intent.hash) || intent.size!==null && (!Number.isSafeInteger(intent.size) || intent.size<0) || ["put_verified","reference_committed"].includes(intent.status) && (intent.hash===null || intent.size===null)) throw new Error("Invalid file intent identity/hash/size");
    const operation = await this.exportOperation(id, operationId);
    const envelope: FileIntentEnvelope = { ...intent, transitionId: id, operationId, generation: operation.generation,sourceSequence:null,sourceFence:null, outcome: null };
    const phases=this.side(row)==="source"?"'prepared','protected','copying','replaying','target_ingress_ready'":"'target_ingress_ready','source_fenced','target_owned','complete'";
    await this.db.prepare(`INSERT OR IGNORE INTO content_transition_file_intents(transition_id,intent_id,operation_id,generation,version_key,envelope_json) SELECT id,?,?,?,?,? FROM content_transitions WHERE id=? AND phase IN (${phases})`).bind(intent.intentId,operationId,operation.generation,intent.versionKey,JSON.stringify(envelope),id).run();
    const actual=await this.exportFileIntent(id,intent.intentId);
    if(JSON.stringify({...actual,sourceSequence:null})!==JSON.stringify(envelope)) throw new Error("File intent identity conflict");
  }
  async exportFileIntent(id: string, intentId: string): Promise<FileIntentEnvelope> {
    const transition=await this.row(id);
    const row = await this.db.prepare("SELECT seq,source_seq,envelope_json,outcome_json FROM content_transition_file_intents WHERE transition_id=? AND intent_id=?").bind(id, intentId).first<{seq:number;source_seq:number|null; envelope_json: string; outcome_json: string | null }>();
    if (!row) throw new Error("Missing file intent");
    const wire=JSON.parse(row.envelope_json);
    return { ...wire,sourceFence:this.side(transition)==="source"?(transition.fence_json?JSON.parse(transition.fence_json):null):(wire.sourceFence??null),sourceSequence:this.side(transition)==="source"?row.seq:row.source_seq, outcome: row.outcome_json ? JSON.parse(row.outcome_json) : null };
  }
  async receiveFileIntent(envelope: FileIntentEnvelope): Promise<{ intentId: string; versionKey: string }> {
    const row = await this.row(envelope.transitionId);
    if (this.side(row) !== "target" || !canAdmit("target", row.phase) || envelope.generation !== row.generation-1) throw new Error("File receiver is not ready");
    if(!Number.isSafeInteger(envelope.sourceSequence) || envelope.sourceSequence!<1) throw new Error("Missing source file sequence");
    const final=finalTransfer(row,envelope.sourceFence,envelope.sourceSequence,"file");
    assertOperationEvidence({attempt:null,outcome:envelope.outcome});
    await this.db.prepare("INSERT OR IGNORE INTO content_transition_file_intents(transition_id,intent_id,operation_id,generation,version_key,envelope_json,outcome_json,source_seq,transferred) SELECT ?,?,?,?,?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced','target_owned','complete') AND fence_json IS ?)")
      .bind(envelope.transitionId, envelope.intentId, envelope.operationId, envelope.generation, envelope.versionKey, JSON.stringify({...envelope,sourceFence:null}), encoded(envelope.outcome),envelope.sourceSequence,row.id,row.fence_json).run();
    const actual = await this.exportFileIntent(envelope.transitionId, envelope.intentId);
    const actualIdentity=Object.fromEntries(Object.entries(actual).filter(([key])=>!["outcome","sourceFence"].includes(key)));
    const incomingIdentity=Object.fromEntries(Object.entries(envelope).filter(([key])=>!["outcome","sourceFence"].includes(key)));
    if (JSON.stringify(actualIdentity) !== JSON.stringify(incomingIdentity)) throw new Error("Conflicting file-intent transfer");
    const {outcome}=mergeProgress({attempt:null,outcome:actual.outcome},{attempt:null,outcome:envelope.outcome});
    const result=await this.db.prepare(`UPDATE content_transition_file_intents SET outcome_json=?,transferred=max(transferred,?),envelope_json=json_set(envelope_json,'$.sourceFence',json(?))
      WHERE transition_id=? AND intent_id=? AND outcome_json IS ? AND json_extract(envelope_json,'$.sourceFence') IS ?
      AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced','target_owned','complete') AND fence_json IS ?)`)
      .bind(encoded(outcome),final?1:0,JSON.stringify(envelope.sourceFence??actual.sourceFence),row.id,envelope.intentId,encoded(actual.outcome),encoded(actual.sourceFence),row.id,row.fence_json).run();
    if(result.meta.changes!==1) throw new Error("File transfer progress race; retry authoritative state");
    mergeProgress({attempt:null,outcome:(await this.exportFileIntent(row.id,envelope.intentId)).outcome},{attempt:null,outcome});
    return { intentId: actual.intentId, versionKey: actual.versionKey };
  }
  async recordFileObservation(id:string,intentId:string,observation:FileObservation):Promise<void> {
    const transition=await this.row(id);
    const intent=await this.exportFileIntent(id,intentId);
    if(observation.transitionId!==id || observation.intentId!==intentId || observation.generation!==intent.generation || observation.versionKey!==intent.versionKey || !observation.evidenceId || !Number.isSafeInteger(observation.observedAt) || ![transition.source_site,transition.target_site].includes(observation.site) || !observation.resource || observation.site===this.site && observation.resource!==this.fileResource) throw new Error("File observation identity mismatch");
    if(!["present","absent","unknown"].includes(observation.result) || observation.result==="present" && (typeof observation.hash!=="string" || !/^[a-f0-9]{64}$/.test(observation.hash) || !Number.isSafeInteger(observation.size) || observation.size!<0 || !observation.objectVersion) || observation.result!=="present" && (observation.hash!==null || observation.size!==null || observation.objectVersion!==null)) throw new Error("Invalid file observation hash/size/version");
    if(observation.result==="present" && (intent.hash!==null && intent.hash!==observation.hash || intent.size!==null && intent.size!==observation.size)) throw new Error("File observation expected hash/size mismatch");
    if(observation.copiedFromEvidenceId!==null) {
      const origin=await this.db.prepare("SELECT observation_json FROM content_transition_file_evidence WHERE transition_id=? AND intent_id=? AND evidence_id=?").bind(id,intentId,observation.copiedFromEvidenceId).first<string>("observation_json");
      const source:FileObservation|null=origin?JSON.parse(origin):null;
      if(!source || source.site!==transition.source_site || observation.site!==transition.target_site || source.result!=="present" || observation.result!=="present" || source.hash!==observation.hash || source.size!==observation.size || source.versionKey!==observation.versionKey) throw new Error("Copied file observation byte identity mismatch");
      // R2 upload versions identify each bucket's own upload. They deliberately
      // differ across a copy; the immutable key and byte hash/size connect it.
    }
    await this.db.prepare("INSERT OR IGNORE INTO content_transition_file_evidence(transition_id,intent_id,evidence_id,observation_json) VALUES(?,?,?,?)").bind(id,intentId,observation.evidenceId,JSON.stringify(observation)).run();
    const actual=await this.db.prepare("SELECT observation_json FROM content_transition_file_evidence WHERE transition_id=? AND intent_id=? AND evidence_id=?").bind(id,intentId,observation.evidenceId).first<string>("observation_json");
    if(actual!==JSON.stringify(observation)) throw new Error("File observation is immutable");
  }
  async recordFileOutcome(id:string,intentId:string,evidenceId:string,outcome:"failed"|"conflicted",detail:string):Promise<void> {
    const row=await this.row(id);
    if(!canCommit(this.side(row),row.phase,this.side(row)==="source"?row.generation-1:row.generation,row.generation) || !["failed","conflicted"].includes(outcome)) throw new Error("Only final owner records file disposition");
    const phases=this.side(row)==="source"?"'prepared','protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    const receipt:OperationOutcome={outcome,detail,sideEffectReconciled:true};
    await this.db.prepare(`UPDATE content_transition_file_intents SET outcome_json=? WHERE transition_id=? AND intent_id=? AND outcome_json IS NULL
      AND EXISTS(SELECT 1 FROM content_transition_file_evidence e WHERE e.transition_id=? AND e.intent_id=? AND e.evidence_id=? AND json_extract(e.observation_json,'$.result') IN ('present','absent'))
      AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))`).bind(JSON.stringify(receipt),id,intentId,id,intentId,evidenceId,id).run();
    if(JSON.stringify((await this.exportFileIntent(id,intentId)).outcome)!==JSON.stringify(receipt)) throw new Error("Missing terminal file evidence or conflicting disposition");
  }
  async saveCheckpoint(id: string, checkpoint: SourceCheckpoint): Promise<void> {
    const row = await this.row(id);
    if (this.side(row) !== "source" || !canAdmit("source", row.phase)) throw new Error("Checkpoint owner moved");
    const checkpoints: SourceCheckpoint[] = JSON.parse(row.checkpoints_json);
    const previous = checkpoints.find(item => item.sourceKey === checkpoint.sourceKey);
    if (previous && previous.revision > checkpoint.revision) throw new Error("Stale checkpoint");
    if (previous && previous.revision === checkpoint.revision && JSON.stringify(previous) !== JSON.stringify(checkpoint)) throw new Error("Checkpoint identity conflict");
    const next = [...checkpoints.filter(item => item.sourceKey !== checkpoint.sourceKey), checkpoint].sort((a,b) => a.sourceKey.localeCompare(b.sourceKey));
    const result = await this.db.prepare("UPDATE content_transitions SET checkpoints_json=?,checkpoint_revision=checkpoint_revision+1 WHERE id=? AND checkpoint_revision=? AND phase IN ('prepared','protected','copying','replaying','target_ingress_ready')").bind(JSON.stringify(next), id, row.checkpoint_revision).run();
    if (result.meta.changes !== 1) throw new Error("Checkpoint fence/version conflict");
  }
  async freeze(id: string, now: number): Promise<SourceFence> {
    const row = await this.row(id);
    if (this.side(row) !== "source") throw new Error("Only the source may fence");
    if (row.fence_json) return JSON.parse(row.fence_json);
    assertReadiness(identity(row), row.readiness_json ? JSON.parse(row.readiness_json) : null, now);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.checkpoints_json));
    const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,"0")).join("");
    const result = await this.db.prepare(`UPDATE content_transitions SET phase='source_fenced',fence_json=json_patch(?,json_object(
      'boundary',coalesce((SELECT max(seq) FROM content_transition_commits WHERE transition_id=? AND sealed=1),0),
      'checkpointDigest',?,'checkpoints',json(checkpoints_json),
      'operationBoundary',(SELECT coalesce(max(seq),0) FROM content_transition_operations WHERE transition_id=?),
      'operationCount',(SELECT count(*) FROM content_transition_operations WHERE transition_id=?),
      'fileIntentBoundary',(SELECT coalesce(max(seq),0) FROM content_transition_file_intents WHERE transition_id=?),
      'fileIntentCount',(SELECT count(*) FROM content_transition_file_intents WHERE transition_id=?)))
      WHERE id=? AND phase='target_ingress_ready' AND fence_json IS NULL AND readiness_expires_at>? AND checkpoint_revision=? AND manifest_digest=? AND manifest_revision=? AND readiness_json=? AND ${manifestResolvedSql()} AND ${identityProjectionValidSql()}`.replace("UPDATE content_transitions SET","UPDATE content_transitions AS t SET"))
      .bind(JSON.stringify(identity(row)), id, digest, id,id,id,id,id, now, row.checkpoint_revision,row.manifest_digest,row.manifest_revision,row.readiness_json).run();
    if (result.meta.changes !== 1) {
      const invalid=await this.db.prepare("SELECT commit_seq,row_table,row_key,column_name,reason FROM content_transition_invalid_json WHERE transition_id=? ORDER BY commit_seq LIMIT 1").bind(id).first();
      if(invalid) throw new Error(`Manifest immutable JSON conflict: ${JSON.stringify(invalid)}`);
      const identityConflict=await this.db.prepare("SELECT commit_seq,row_key,reason FROM content_transition_identity_conflicts WHERE transition_id=? ORDER BY commit_seq LIMIT 1").bind(id).first();
      if(identityConflict) throw new Error(`Manifest immutable identity conflict: music_entities ${JSON.stringify(identityConflict)}`);
      const missing=await this.db.prepare("SELECT commit_seq,row_key FROM content_transition_identity_missing WHERE transition_id=? ORDER BY commit_seq LIMIT 1").bind(id).first();
      if(missing) throw new Error(`Manifest missing/stale identity proof: members ${JSON.stringify(missing)}`);
      throw new Error("Fence readiness/checkpoint/manifest race; read back and retry");
    }
    return JSON.parse((await this.row(id)).fence_json!);
  }
  async validateIdentityProjection(id:string):Promise<void> {
    const row=await this.row(id);
    if(this.side(row)!=="source" || row.fence_json) throw new Error("Only an unfenced source can mint identity proof");
    return validateIdentityProjection(this.db,JSON.parse(row.plan_json),row.manifest_revision);
  }
  async exportFrozenOperations(id:string,after=0):Promise<OperationEnvelope[]> {
    const row=await this.row(id);
    if(this.side(row)!=="source" || !row.fence_json) throw new Error("Source is not frozen");
    const fence:SourceFence=JSON.parse(row.fence_json);
    const rows=(await this.db.prepare("SELECT seq,source_seq,envelope_json,generation,attempt_json,outcome_json FROM content_transition_operations WHERE transition_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT 50").bind(id,after,fence.operationBoundary).all<OperationRow>()).results;
    return rows.map(value=>decodeOperation(value,true,row.fence_json));
  }
  async exportFrozenFileIntents(id:string,after=0):Promise<FileIntentEnvelope[]> {
    const row=await this.row(id);
    if(this.side(row)!=="source" || !row.fence_json) throw new Error("Source is not frozen");
    const fence:SourceFence=JSON.parse(row.fence_json);
    const rows=(await this.db.prepare("SELECT intent_id FROM content_transition_file_intents WHERE transition_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT 50").bind(id,after,fence.fileIntentBoundary).all<{intent_id:string}>()).results;
    return Promise.all(rows.map(value=>this.exportFileIntent(id,value.intent_id)));
  }
  async installFence(fence: SourceFence): Promise<void> {
    const row = await this.row(fence.id);
    assertSameTransition(identity(row), fence);
    if (this.side(row) !== "target") throw new Error("Only target installs source proof");
    if (row.fence_json === JSON.stringify(fence)) return;
    const result = await this.db.prepare("UPDATE content_transitions SET phase='source_fenced',fence_json=?,checkpoints_json=? WHERE id=? AND phase='target_ingress_ready' AND fence_json IS NULL")
      .bind(JSON.stringify(fence), JSON.stringify(fence.checkpoints), fence.id).run();
    if (result.meta.changes !== 1) throw new Error("Conflicting source fence");
  }
  async exportProjectedCommits(id:string, after:number):Promise<ProjectedCommit[]> {
    const row=await this.row(id);
    if(this.side(row)!=="source") throw new Error("Only source exports committed capture");
    const commits=(await this.db.prepare("SELECT seq FROM content_transition_commits WHERE transition_id=? AND sealed=1 AND seq>? ORDER BY seq LIMIT 25").bind(id,after).all<{seq:number}>()).results;
    const projected=[];
    for(const commit of commits) {
      const previous=await this.db.prepare("SELECT coalesce(max(seq),0) previous FROM content_transition_commits WHERE transition_id=? AND sealed=1 AND seq<?").bind(id,commit.seq).first<number>("previous");
      const rows=(await this.db.prepare("SELECT row_table AS 'table',row_key,before_json,after_json FROM content_transition_journal WHERE transition_id=? AND commit_seq=? ORDER BY seq").bind(id,commit.seq).all<{table:string;row_key:string;before_json:string|null;after_json:string|null}>()).results;
      const context=await readProjectionContext(this.db,JSON.parse(row.plan_json),commit.seq);
      const before=await readProjectionContext(this.db,JSON.parse(row.plan_json),previous!);
      projected.push(await projectCommit(identity(row),commit.seq,previous!,rows,context,before));
    }
    return projected;
  }
  private async baseline(id:string,side:"source"|"target") {
    const row=await this.row(id);
    if(this.side(row)!==side) throw new Error("Wrong baseline resource");
    return new D1BaselineStore(this.db,identity(row),JSON.parse(row.plan_json));
  }
  async describeBaseline(id:string) { const row=await this.row(id);const boundary=await this.db.prepare("SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline' AND sealed=1").bind(id).first<number>("seq");const context=await readProjectionContext(this.db,JSON.parse(row.plan_json),boundary??0);return (await this.baseline(id,"source")).describe(context); }
  async exportBaselinePage(header:BaselineHeader,cursor:BaselinePage["next"]|0) { const row=await this.row(header.identity.id);const context=await readProjectionContext(this.db,JSON.parse(row.plan_json),header.boundary);return (await this.baseline(header.identity.id,"source")).exportPage(header,cursor,context); }
  async beginBaseline(header:BaselineHeader) { return (await this.baseline(header.identity.id,"target")).begin(header); }
  async stageBaselinePage(page:BaselinePage) { return (await this.baseline(page.header.identity.id,"target")).stage(page); }
  async materializeBaselinePage(id:string) { return (await this.baseline(id,"target")).materialize(); }
  async finalizeBaseline(id:string) { return (await this.baseline(id,"target")).finalize(); }
  async installProjectedCommit(commit:ProjectedCommit) {
    assertProjectedCommit(commit);
    if(commit.previous===0) throw new Error("Baseline requires bounded inactive page staging");
    const row=await this.row(commit.identity.id);
    assertSameTransition(identity(row),commit.identity);
    if(this.side(row)!=="target" || !["target_ingress_ready","source_fenced"].includes(row.phase)) throw new Error("Target replay is fenced from active business ownership");
    const existing=await this.db.prepare("SELECT digest FROM content_transition_replay WHERE transition_id=? AND commit_seq=?").bind(row.id,commit.sequence).first<string>("digest");
    if(existing) { if(existing!==commit.digest) throw new Error("Conflicting replay identity"); return; }
    const mutations=[
      ...groupedProjectedStatements(this.db,row.id,commit.changes.flatMap(change=>change.before && (!change.after || change.before.key!==change.after.key)?[change.before]:[]),true),
      ...groupedProjectedStatements(this.db,row.id,commit.changes.flatMap(change=>change.after?[change.after]:[])),
    ];
    const result=await this.db.batch([
      this.db.prepare("PRAGMA defer_foreign_keys=ON"),
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(row.id,`replay:${commit.sequence}`),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,version_matches,commit_seq) SELECT 1,id,?,generation,'baseline',coalesce((SELECT max(commit_seq) FROM content_transition_replay WHERE transition_id=?),(SELECT source_boundary FROM content_transition_baselines WHERE transition_id=? AND receipt_json IS NOT NULL),0)=?,(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced')")
        .bind(`replay:${commit.sequence}`,row.id,row.id,commit.previous,row.id,`replay:${commit.sequence}`,row.id),
      ...mutations,
      this.db.prepare("INSERT INTO content_transition_replay(transition_id,commit_seq,previous_commit,digest,projected_json) VALUES(?,?,?,?,?)").bind(row.id,commit.sequence,commit.previous,commit.digest,JSON.stringify([{rows:commit.changes.length,digest:commit.digest}])),
      this.db.prepare("DELETE FROM content_transition_dirty_rows WHERE transition_id=?").bind(row.id),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(row.id),
      this.db.prepare("PRAGMA defer_foreign_keys=OFF"),
    ]);
    return {statements:result.length,rowsRead:result.reduce((n,r)=>n+r.meta.rows_read,0),rowsWritten:result.reduce((n,r)=>n+r.meta.rows_written,0),duration:result.reduce((n,r)=>n+r.meta.duration,0)};
  }
  async installCommittedState(id: string): Promise<void> {
    const row = await this.row(id);
    if (this.side(row) !== "target" || row.phase !== "source_fenced") throw new Error("Target fence is not installed");
    const fence: SourceFence = JSON.parse(row.fence_json!);
    const tail=await this.db.prepare("SELECT coalesce((SELECT max(commit_seq) FROM content_transition_replay WHERE transition_id=?),(SELECT source_boundary FROM content_transition_baselines WHERE transition_id=? AND receipt_json IS NOT NULL),0) boundary").bind(id,id).first<number>("boundary");
    if(tail!==fence.boundary) throw new Error("Incomplete committed tail");
    const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(row.checkpoints_json)))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
    if(hash!==fence.checkpointDigest) throw new Error("Checkpoint installation mismatch");
    // File-owning adapter is connected in 4.3. Until its immutable version/hash
    // readback exists, file-bearing manifests cannot claim readiness.
    const files=await this.db.prepare("SELECT (SELECT count(*) FROM content_transition_materialized_rows WHERE transition_id=? AND row_table IN ('member_profile_images','naver_cafe_posts','notices'))+(SELECT count(*) FROM content_transition_baseline_rows WHERE transition_id=? AND row_table IN ('member_profile_images','naver_cafe_posts','notices')) n").bind(id,id).first<number>("n");
    if(files) throw new Error("Required committed-file availability adapter is not connected");
    const installation:CommittedStateInstallation={boundary:tail!,checkpointDigest:hash,committedFilesAvailable:true};
    await this.db.prepare("UPDATE content_transitions SET installation_json=? WHERE id=? AND phase='source_fenced'").bind(JSON.stringify(installation), id).run();
  }
  async activate(id: string): Promise<void> {
    const row = await this.row(id);
    if (this.side(row) !== "target") throw new Error("Only target activates");
    if (row.phase === "target_owned") return;
    if (!row.fence_json || !row.installation_json) throw new Error("Missing durable installation");
    const fence:SourceFence=JSON.parse(row.fence_json);
    const operations=await this.db.prepare("SELECT count(*) n FROM content_transition_operations WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=?").bind(id,fence.operationBoundary,row.generation-1).first<number>("n");
    const files=await this.db.prepare("SELECT count(*) n FROM content_transition_file_intents WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=?").bind(id,fence.fileIntentBoundary,row.generation-1).first<number>("n");
    assertActivation(identity(row), { ...JSON.parse(row.installation_json), fence, transferredOperations:operations!,transferredFileIntents:files! });
    await this.advance(id, "source_fenced", "target_owned");
  }
  async commit(id: string, operationId: string, generation: number, statements: D1PreparedStatement[],fileReferences:readonly FileReferenceCommit[]=[]) {
    const row = await this.row(id);
    if (!canCommit(this.side(row), row.phase, generation, row.generation)) throw new Error("Final mutation owner/generation mismatch");
    const operation = await this.exportOperation(id, operationId);
    if (operation.outcome) { if (operation.outcome.outcome === "committed") return; throw new Error("Operation already has a terminal outcome"); }
    const phases = this.side(row) === "source" ? "'protected','copying','replaying','target_ingress_ready'" : "'target_owned','complete'";
    let versionSql="1";
    const versionBinds:Array<string|number|null>=[];
    if(operation.codec.id==="schedules.save") {
      const expected=this.side(row)==="source"?JSON.parse((await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("envelope_json"))!).sourceExpectedState as AcceptedOperation["expectedState"]:operation.expectedState;
      versionSql=expected?`EXISTS(SELECT 1 FROM schedules WHERE ${contentDispositionRegistry.schedules.values.map(key=>`"${key}" IS ?`).join(" AND ")})`:"NOT EXISTS(SELECT 1 FROM schedules WHERE id=?)";
      versionBinds.push(...(expected?contentDispositionRegistry.schedules.values.map(key=>expected[key]):[operation.payload.id as number]));
    } else if(operation.expectedVersion!==null) {
      const table=operation.subject.table;
      if(!Object.hasOwn(contentDispositionRegistry,table)) throw new Error("Unknown versioned subject");
      const disposition=contentDispositionRegistry[table as keyof typeof contentDispositionRegistry];
      if(!(disposition.values as readonly string[]).includes("version")) throw new Error("Subject has no optimistic version contract");
      const keys:unknown=JSON.parse(operation.subject.key);
      if(!Array.isArray(keys) || keys.length!==disposition.primaryKey.length || keys.some(key=>typeof key!=="string" && typeof key!=="number")) throw new Error("Invalid versioned subject key");
      versionSql=`EXISTS(SELECT 1 FROM "${table}" WHERE ${disposition.primaryKey.map(column=>`"${column}"=?`).join(" AND ")} AND version=?)`;
      versionBinds.push(...keys,operation.expectedVersion);
    }
    let result:D1Result[];
    try { result = await this.db.batch([
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(id, operationId),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq)
        SELECT 1,id,?,CASE WHEN phase IN (${phases}) AND ?=${this.side(row)==="source"?"generation-1":"generation"} THEN ? ELSE NULL END,
        ${versionSql} AND EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL),
        (SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions WHERE id=?`)
        .bind(operationId, generation, generation, ...versionBinds,id,operationId,id, operationId, id),
      ...fileReferences.map(file=>this.db.prepare(`UPDATE content_transition_permits SET version_matches=EXISTS(
        SELECT 1 FROM content_transition_file_intents i JOIN content_transition_file_evidence e ON e.transition_id=i.transition_id AND e.intent_id=i.intent_id
        WHERE i.transition_id=? AND i.operation_id=? AND i.intent_id=? AND i.outcome_json IS NULL AND e.evidence_id=?
          AND json_extract(e.observation_json,'$.transitionId')=i.transition_id AND json_extract(e.observation_json,'$.intentId')=i.intent_id
          AND json_extract(e.observation_json,'$.generation')=i.generation AND json_extract(e.observation_json,'$.versionKey')=i.version_key
          AND json_extract(e.observation_json,'$.result')='present'
          AND json_extract(e.observation_json,'$.site')=? AND json_extract(e.observation_json,'$.resource')=?
          AND length(json_extract(e.observation_json,'$.objectVersion'))>0
          AND (json_extract(i.envelope_json,'$.hash') IS NULL OR json_extract(i.envelope_json,'$.hash')=json_extract(e.observation_json,'$.hash'))
          AND (json_extract(i.envelope_json,'$.size') IS NULL OR json_extract(i.envelope_json,'$.size')=json_extract(e.observation_json,'$.size'))
        ) WHERE transition_id=?`).bind(id,operationId,file.intentId,file.evidenceId,this.site,this.fileResource,id)),
      ...statements, ...captureStatements(this.db, id),
      ...fileReferences.map(file=>this.db.prepare("UPDATE content_transition_file_intents SET outcome_json=? WHERE transition_id=? AND operation_id=? AND intent_id=? AND outcome_json IS NULL").bind(JSON.stringify({outcome:"committed",sideEffectReconciled:true,detail:"Reference committed in business batch"}),id,operationId,file.intentId)),
      this.db.prepare("UPDATE content_transition_operations SET outcome_json=json_object('outcome','committed','sideEffectReconciled',json(iif(attempt_json IS NULL OR json_extract(attempt_json,'$.status') IN ('completed','failed'),'true','false')),'detail','Business batch committed') WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL").bind(id, operationId),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?").bind(id, operationId),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
    ]); } catch(error) {
      if(String(error).includes("content_transition_version_conflict") && versionSql!=="1" && !await this.db.prepare(`SELECT ${versionSql} matches`).bind(...versionBinds).first<number>("matches")) {
        await this.recordOutcome(id,operationId,{outcome:"conflicted",sideEffectReconciled:!operation.attempt || operation.attempt.status==="completed",detail:"Expected version no longer matches"});
        throw new Error("Expected version conflict",{cause:error});
      }
      throw error;
    }
    return { statements: result.length, rowsRead: result.reduce((n,r)=>n+r.meta.rows_read,0), rowsWritten: result.reduce((n,r)=>n+r.meta.rows_written,0), duration: result.reduce((n,r)=>n+r.meta.duration,0) };
  }
  async readJournal(id: string) {
    await this.row(id);
    return (await this.db.prepare("SELECT j.seq,j.commit_seq,j.row_table AS 'table',j.row_key,j.before_json,j.after_json FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=? AND c.sealed=1 ORDER BY j.seq").bind(id).all<{ seq: number; commit_seq: number; table: string; row_key: string; before_json: string | null; after_json: string | null }>()).results;
  }
  async recordOutcome(id: string, operationId: string, outcome: OperationOutcome): Promise<void> {
    assertOperationEvidence({attempt:null,outcome});
    const row = await this.row(id);
    if (!canCommit(this.side(row), row.phase, this.side(row)==="source"?row.generation-1:row.generation, row.generation)) throw new Error("Only final owner records business outcome");
    const actual = await this.exportOperation(id, operationId);
    if(outcome.outcome==="committed" && actual.outcome?.outcome!=="committed") throw new Error("Committed outcome requires the actual final business batch");
    if (actual.outcome && JSON.stringify(actual.outcome) !== JSON.stringify(outcome)) throw new Error("Terminal outcome is immutable");
    if(!["committed","conflicted","failed"].includes(outcome.outcome)) throw new Error("Invalid terminal outcome");
    if(outcome.sideEffectReconciled && actual.attempt && !["completed","failed"].includes(actual.attempt.status)) throw new Error("Existing side effect must reconcile before terminal acknowledgement");
    const phases=this.side(row)==="source"?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL AND (?=0 OR attempt_json IS NULL OR json_extract(attempt_json,'$.status') IN ('completed','failed')) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))`).bind(JSON.stringify(outcome), id, operationId,outcome.sideEffectReconciled?1:0,id).run();
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error("Outcome owner moved or immutable outcome conflicts");
  }
  async archiveSource(id:string):Promise<SourceArchiveReceipt> {
    const row=await this.row(id);
    if(this.side(row)!=="source" || row.phase!=="source_fenced" || !row.fence_json) throw new Error("Only fenced source can archive selected roots");
    const tables=ownedRootTables.filter(table=>(contentDispositionRegistry[table].excluded as readonly string[]).includes("content_access"));
    const archiveTables=tables.map(table=>`'${table}'`).join(",");
    const statements=tables.map(table=>this.db.prepare(`UPDATE "${table}" AS a SET content_access='admin_archive' WHERE content_access='normal' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=? AND m.row_table=m.root_table AND m.row_key=m.root_key AND ${matchKey(table,"a","m.root_key")})`).bind(id,table));
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO content_transition_commits(transition_id,operation_id) VALUES(?,'archive')").bind(id),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,id,'archive',generation-1,'archive',(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='archive') FROM content_transitions WHERE id=? AND local_site=source_site AND phase='source_fenced'").bind(id,id),
      ...statements,
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=NOT EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=m.row_table AND m.root_key=m.row_key AND m.root_table IN (${archiveTables}) AND NOT CASE m.root_table ${tables.map(table=>`WHEN '${table}' THEN EXISTS(SELECT 1 FROM "${table}" a WHERE ${matchKey(table,"a","m.root_key")} AND a.content_access='admin_archive')`).join(" ")} ELSE 0 END) WHERE transition_id=?`).bind(id,id),
      this.db.prepare(`UPDATE content_transitions SET archive_receipt_json=json_patch(?,json_object('boundary',json_extract(fence_json,'$.boundary'),'archivedRoots',(SELECT count(*) FROM content_transition_membership WHERE transition_id=? AND root_table=row_table AND root_key=row_key AND root_table IN (${archiveTables})))) WHERE id=? AND phase='source_fenced'`).bind(JSON.stringify(identity(row)),id,id),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
    ]);
    return JSON.parse((await this.db.prepare("SELECT archive_receipt_json FROM content_transitions WHERE id=?").bind(id).first<string>("archive_receipt_json"))!);
  }
  async acknowledgeSourceArchive(receipt:SourceArchiveReceipt):Promise<void> {
    const row=await this.row(receipt.id);
    assertSameTransition(identity(row),receipt);
    if(this.side(row)!=="target" || !row.fence_json || receipt.boundary!==JSON.parse(row.fence_json).boundary || !Number.isSafeInteger(receipt.archivedRoots)) throw new Error("Wrong source archive receipt");
    await this.db.prepare("UPDATE content_transitions SET archive_receipt_json=? WHERE id=? AND phase IN ('source_fenced','target_owned','complete')").bind(JSON.stringify(receipt),row.id).run();
  }
  async readOutcomeReceipt(id:string,kind:"operation"|"file",recordId:string):Promise<OutcomeReceipt> {
    const row=await this.row(id);
    if(this.side(row)!=="target") throw new Error("Only final target produces outcome acknowledgement");
    const value=kind==="operation"?await this.exportOperation(id,recordId):await this.exportFileIntent(id,recordId);
    if(value.sourceSequence===null || !value.outcome || !value.outcome.sideEffectReconciled) throw new Error("No terminal reconciled outcome receipt");
    const fingerprint="payloadHash" in value?value.payloadHash:value.versionKey;
    return {...identity(row),kind,recordId,sourceSequence:value.sourceSequence,fingerprint,outcome:value.outcome,outcomeDigest:await digestText(JSON.stringify(value.outcome))};
  }
  async acknowledgeOutcome(receipt:OutcomeReceipt):Promise<OutcomeReceipt> {
    const row=await this.row(receipt.id);
    assertSameTransition(identity(row),receipt);
    if(this.side(row)!=="source" || !row.fence_json || await digestText(JSON.stringify(receipt.outcome))!==receipt.outcomeDigest || !receipt.outcome.sideEffectReconciled) throw new Error("Invalid final outcome receipt");
    const value=receipt.kind==="operation"?await this.exportOperation(row.id,receipt.recordId):await this.exportFileIntent(row.id,receipt.recordId);
    const fingerprint="payloadHash" in value?value.payloadHash:value.versionKey;
    if(value.sourceSequence!==receipt.sourceSequence || fingerprint!==receipt.fingerprint || value.outcome && (value.outcome.outcome!==receipt.outcome.outcome || value.outcome.detail!==receipt.outcome.detail || value.outcome.sideEffectReconciled && !receipt.outcome.sideEffectReconciled)) throw new Error("Outcome identity conflict");
    const table=receipt.kind==="operation"?"content_transition_operations":"content_transition_file_intents";
    const key=receipt.kind==="operation"?"operation_id":"intent_id";
    await this.db.prepare(`UPDATE ${table} SET outcome_json=?,outcome_acknowledged=1 WHERE transition_id=? AND ${key}=? AND seq=? AND (outcome_json IS NULL OR outcome_json=?)`).bind(JSON.stringify(receipt.outcome),row.id,receipt.recordId,receipt.sourceSequence,value.outcome?JSON.stringify(value.outcome):null).run();
    const stored=await this.db.prepare(`SELECT outcome_json FROM ${table} WHERE transition_id=? AND ${key}=? AND outcome_acknowledged=1`).bind(row.id,receipt.recordId).first<string>("outcome_json");
    if(stored!==JSON.stringify(receipt.outcome)) throw new Error("Outcome acknowledgement conflict");
    return receipt;
  }
  async confirmOutcomeAcknowledgement(receipt:OutcomeReceipt):Promise<void> {
    const actual=await this.readOutcomeReceipt(receipt.id,receipt.kind,receipt.recordId);
    if(JSON.stringify(actual)!==JSON.stringify(receipt)) throw new Error("Wrong outcome acknowledgement");
    const table=receipt.kind==="operation"?"content_transition_operations":"content_transition_file_intents";
    const key=receipt.kind==="operation"?"operation_id":"intent_id";
    await this.db.prepare(`UPDATE ${table} SET outcome_acknowledged=1 WHERE transition_id=? AND ${key}=? AND source_seq=? AND outcome_json=?`).bind(receipt.id,receipt.recordId,receipt.sourceSequence,JSON.stringify(receipt.outcome)).run();
  }
  async complete(id: string): Promise<void> {
    const row = await this.row(id);
    if (this.side(row) !== "target" || !["target_owned","complete"].includes(row.phase)) throw new Error("Target does not own transition");
    const fence:SourceFence=JSON.parse(row.fence_json!);
    const remaining=async(table:"content_transition_operations"|"content_transition_file_intents",boundary:number)=>this.db.prepare(`SELECT count(*) n FROM ${table} WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=? AND outcome_acknowledged=1 AND json_extract(outcome_json,'$.outcome') IN ('committed','conflicted','failed') AND json_extract(outcome_json,'$.sideEffectReconciled')=1`).bind(id,boundary,row.generation-1).first<number>("n");
    const operations=await remaining("content_transition_operations",fence.operationBoundary);
    const files=await remaining("content_transition_file_intents",fence.fileIntentBoundary);
    const archive=await this.db.prepare("SELECT archive_receipt_json FROM content_transitions WHERE id=?").bind(id).first<string>("archive_receipt_json");
    if (!archive || operations!==fence.operationCount || files!==fence.fileIntentCount) throw new Error("Frozen work or source archive proof is incomplete");
    await this.advance(id, "target_owned", "complete");
  }
}
