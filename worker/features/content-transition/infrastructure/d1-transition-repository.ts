import {parseCandidateChannelMutation,type CandidateChannelCommand} from '../../otw-play/commands';
import {D1CandidateChannelStages,emptyCandidateChannelStages,parseCandidateChannelStages} from './d1-candidate-channel-stages';
import {aiReviewSnapshotSql,aiAttemptSnapshotSql,preparedAiScopeSql,installedSourceAiHandoffSql,type AiUnknownSnapshot,type AiReviewAdoption} from './ai-review-adoption';
import {D1AiUnknownControl} from './d1-ai-unknown-control';
import {maintenanceBlockersSql,maintenanceQuiescentSql,TransitionMaintenanceError} from './maintenance';
import {parseUnknownAiReviewCommand,parseResumeAiReviewCommand} from '../../otw-play/commands';
import type {CandidateChannelApprovalStages,CandidateChannelApprovalSnapshot} from '@contracts/content-transition-youtube';
import {parseReviewDeletion,type ReviewDeletionCommand,type ReviewDeletion} from '../../otw-play/commands';
import {parseCandidateReviewMutation,type CandidateReviewCommand} from '../../otw-play/commands';
import {parseConversionOutcome,type ConversionOutcomeCommand} from '../../otw-play/commands';
import {parseCandidateMetadataMutation,type CandidateMetadataCommand} from '../../otw-play/commands';
import type {CandidateMetadataFacts,CandidateMetadataStage} from '@contracts/content-transition-youtube';
import type {OtwPlayIngestionReviewCandidateDto} from '@contracts/otw-play';
import {reviewDeletionTable,reviewDeletionPredicate} from './play-review-deletion';
import type {CatalogImportProjection} from "./catalog-import-projection";
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
import {importCatalogEffects} from "./import-catalog-effects";
import {historicalStatements} from "./historical-statements";
import {historicalMaterial} from "../domain/historical-material";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { ownedRootTables, matchKey } from "./capture-graph";
import { D1BaselineStore,digestText,nativeIngressBaselineSql, type BaselineHeader, type BaselinePage } from "./d1-baseline-store";
import { manifestResolvedSql,validateClassifications } from "./manifest-statements";
import {sourceJsonValidSql} from "./source-json-validation";
import {parseTransitionCommand,assertOperationMetadata,assertOperationEvidence,type TransitionCommand} from "./command-codecs";
import {readProjectionContext} from "./d1-projection-context";
import {identityProjectionValidSql,validateIdentityProjection} from "./identity-projection";
import {projectCapturedRecord,decodeProjectedRecord,historicalRecordId,type ProjectionContext} from "../domain/projected-content";
import type { CommittedFileAvailability } from "../application/ports/file-availability";
import {currentFileIndexSql,sealedFileReferencesResolvedSql} from "./file-reference-index";
import {inventoryReferencesSql,inventorySealValidSql} from "./file-inventory-statements";
import {parseScheduleCommand,parsePendingCommand,parseLiveSchedulePlan,parseChzzkScanCommand,parseCollectorCommand,parseChzzkMatchInput,parseChzzkChildResult,type PendingCommand,type LiveScheduleCommand,type CollectorCommand} from "../../schedules/commands";
import {collectorState,collectorMemberUid,assertCollectorState} from "./collector-mutation";
import {D1ChzzkReadJournal} from "./d1-chzzk-read-journal";
import {D1ChzzkContinuationStore} from "./d1-chzzk-continuation-store";
import {chzzkCollectorBatchKey,collectorPendingIdsSql,collectorBatchResultSql,assertChzzkBatchResults} from "./chzzk-collector-batch";
import {chzzkMatchInputSql} from "./chzzk-match-input";
import {chzzkScanState} from "./chzzk-scan-state";
import {pendingMutationState,assertPendingState} from "./pending-mutation";
import type {ScheduleCommand} from "../../schedules/commands";
import type {SaveScheduleResult} from "../../../../contracts/schedules";
import type {TransitionPeerDescription} from "../application/ports/transition-peer";
import { parseNoticeCommand, type NoticeCommand } from "../../notices/commands";
import { editableNoticeSql, noticeMutationState } from "./notice-mutation";
import { contentRowMovedSql } from "./content-retention";
import { publicationHiddenSql,isPublicationCutoffSqlError } from "./publication-access";
import { getHiddenMemberCodes } from "@contracts/site-publication";
import {playSongState,playSongCreateState,playSongResultSql} from "./play-song-mutation";
import {playChannelState,playChannelStateFor,playChannelResultSql,playChannelSourceScope} from "./play-channel-mutation";
import {parseVideoCatalogFailure} from "./youtube-video-read";
import {D1YouTubeVideoReadJournal} from "./d1-youtube-video-read-journal";
import {playVideoSourceScope,playVideoSubject,playVideoPredicate,playVideoResult,playVideoProposalResultSql,type VideoResultCapture} from "./play-video-mutation";
import {videoDependencies} from "./video-dependencies";
import {parseVideoCatalogMutation,parseVideoReadCommand,type VideoCatalogCommand,type VideoCatalogMutation} from "../../otw-play/commands";
import type {YouTubeVideoCompletion,YouTubeVideoDependency,YouTubeVideoFailure,YouTubeVideoNoopPreparation,CandidateConversionPreflightStage} from "@contracts/content-transition-youtube";
import {D1YouTubeChannelReadJournal} from "./d1-youtube-channel-read-journal";
import {parseChannelMutation,type ChannelMutation,type ChannelMutationCommand} from "../../otw-play/commands";
import type {YouTubeChannelCompletion} from "@contracts/content-transition-youtube";
import {parseUpdateSong,parseCreateSong,parseEntityMutation,type EntityMutation,parsePublicationCommand,type PublicationCommand,readBroadcastMetadata} from "../../otw-play/commands";
import type {AdminCreateSongCommand} from "../../otw-play/commands";
import {playEntityState,playEntityResultSql} from "./play-entity-mutation";
import {playPublicationState,playPublicationResultSql} from "./play-publication-mutation";
import {playDeleteState,catalogDeleteTable} from "./play-delete-mutation";
import {parseCatalogDeleteCommand,type CatalogDeleteCommand} from "../../otw-play/commands";
import {parseProposalRejection,type ProposalRejectionCommand} from "../../otw-play/commands";
import {proposalRejectionPredicate,proposalRejectionResultSql} from "./play-proposal-rejection";
import {parseMemberSubmissionMutation,memberSubmissionVersion,type MemberSubmissionCommand} from "../../otw-play/commands";
import {memberSubmissionPredicate,memberSubmissionResultSql} from "./play-member-submission";
import type {OtwPlayMemberSubmissionDto} from "@contracts/otw-play";
import type {OtwPlayAdminProposalDto} from "@contracts/otw-play";
import type {OtwPlayAdminUpdateSongRequest,OtwPlayAdminCommandResponse,OtwPlayAdminSongDto,OtwPlayAdminEntityDto,OtwPlayAdminPerformanceDto,OtwPlayAdminChannelDto,OtwPlayAdminCatalogEntryResultDto} from "@contracts/otw-play";
import { TransitionWriteError } from "../domain/write-error";
import { parseDDayCommand, type DDayCommand } from "../../ddays/commands";
import { ddayMutationState, editableDDaySql } from "./dday-mutation";
import { TRANSITION_RECEIVER_CONTRACT } from "../domain/receiver-contract";
import {xRedactionState} from "./x-redaction-mutation";
import type {ChzzkScanCompletion,ChzzkScanCommand,ChzzkScanStage,ChzzkChildResult,ChzzkChildTransfer,ChzzkFinalizerReceipt} from "@contracts/content-transition-chzzk";

type Row = {
  id: string; source_site: SiteId; target_site: SiteId; source_resource: string; target_resource: string;
  local_site: SiteId; local_resource: string; generation: number; protocol: number; manifest_digest: string; manifest_revision:number;
  plan_json: string; phase: TransitionPhase; readiness_json: string | null; readiness_expires_at: number | null;
  protection_receipt_json: string | null; fence_json: string | null; installation_json: string | null;
  checkpoint_revision: number; checkpoints_json: string;
  maintenance_state:'open'|'draining'|'stopped';maintenance_started_at:number|null;
  maintenance_stopped_at:number|null;maintenance_proof_json:string|null;
  aborted_at:number|null;
};
type OperationRow = { seq:number;source_seq:number|null; envelope_json: string; generation: number; attempt_json: string | null; outcome_json: string | null };
type PreparedAdmission={row:Row;operation:AcceptedOperation;sourceCommand:TransitionCommand|null;insert:D1PreparedStatement};
type ScheduleReceiptDefinition={action:SaveScheduleResult["action"];scheduleId:number|null;deletedIdsSql:string;deletedIdsBindings:unknown[]};
type ScheduleReceiptActor={actorId:string|null;actorName:string|null;actorIp:string|null};
const identity = (row: Row): TransitionIdentity => ({ id: row.id, sourceSite: row.source_site, targetSite: row.target_site, sourceResource: row.source_resource, targetResource: row.target_resource, generation: row.generation, protocol: row.protocol, manifestDigest: row.manifest_digest });
const chzzkCompletionOutcome=(stage:ChzzkScanStage,children:ChzzkChildResult[]):OperationOutcome=>{
  const scanFailed=stage.completion.result.channelResults.some(channel=>channel.status!=="complete"),conflict=children.some(child=>child.status!=="succeeded");
  return {outcome:scanFailed?"failed":conflict?"conflicted":"committed",sideEffectReconciled:true,detail:scanFailed||conflict?"Original scan finalized with partial or conflicted work":"Original scan, children and finalizer committed",chzzkScan:stage.completion};
};
const decodeOperation = (row: OperationRow,source:boolean,fence:string|null=null): OperationEnvelope => {
  const wire=JSON.parse(row.envelope_json);
  delete wire.sourceCommand;
  delete wire.sourceExpectedState;
  delete wire.sourceReceipt;
  delete wire.nativeReceipt;
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
    if(current.outcome.outcome!==incoming.outcome.outcome || current.outcome.detail!==incoming.outcome.detail || JSON.stringify(current.outcome.chzzkScan)!==JSON.stringify(incoming.outcome.chzzkScan) || JSON.stringify(current.outcome.youtubeChannel)!==JSON.stringify(incoming.outcome.youtubeChannel) || JSON.stringify(current.outcome.youtubeVideo)!==JSON.stringify(incoming.outcome.youtubeVideo) || JSON.stringify(current.outcome.aiReview)!==JSON.stringify(incoming.outcome.aiReview) || JSON.stringify(current.outcome.aiReviewResult)!==JSON.stringify(incoming.outcome.aiReviewResult) || JSON.stringify(current.outcome.aiResume)!==JSON.stringify(incoming.outcome.aiResume)) throw new Error("Conflicting terminal outcome");
    if(incoming.outcome.sideEffectReconciled) outcome=incoming.outcome;
  }
  if(outcome?.sideEffectReconciled && attempt && !["completed","failed"].includes(attempt.status) && !(outcome.outcome==='administratively_closed'&&outcome.aiReview?.attemptId===attempt.identity&&attempt.status==='unknown')) throw new Error("Transferred outcome has an uncertain attempt");
  return {attempt,outcome};
}
function finalTransfer(row:Row,fence:SourceFence|null,sequence:number|null,kind:"operation"|"file") {
  if(fence===null) return false;
  if(!row.fence_json || JSON.stringify(fence)!==row.fence_json || !sequence || sequence>(kind==="operation"?fence.operationBoundary:fence.fileIntentBoundary)) throw new Error("Transfer does not match the persisted source fence");
  return true;
}

export class D1TransitionRepository implements TransitionControlPort {
  private readonly db: D1Database;
  private readonly catalogProjection:CatalogImportProjection|null;
  private readonly site: SiteId;
  get siteId() { return this.site; }
  async publicationMemberHidden(uid: number): Promise<boolean> {
    if (!getHiddenMemberCodes(this.site, Date.now()).length) return false;
    return Boolean(await this.db.prepare(`SELECT 1 FROM members m WHERE m.uid=? AND ${publicationHiddenSql("members","m",this.site)}`).bind(uid).first());
  }
  async commitPublicationBatch(memberUids: readonly number[], statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (!statements.length) return [];
    const guards = this.publicationGuards(memberUids);
    return (await this.db.batch([...guards,...statements])).slice(guards.length);
  }
  private publicationGuards(memberUids: readonly number[]): D1PreparedStatement[] {
    if (this.site !== "otw" || !memberUids.length) return [];
    return [this.db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM members m WHERE m.uid IN (SELECT value FROM json_each(?)) AND ${publicationHiddenSql("members","m",this.site)}),1,json('site_member_cutover'))`).bind(JSON.stringify(memberUids))];
  }
  private readonly resource: string;
  private readonly fileResource:string|null;
  private readonly fileAvailability:CommittedFileAvailability|null;
  private readonly aiAdoption:AiReviewAdoption|null;
  constructor(db: D1Database, site: SiteId, resource: string, fileResource:string|null=null,fileAvailability:CommittedFileAvailability|null=null,catalogProjection:CatalogImportProjection|null=null,aiAdoption:AiReviewAdoption|null=null) { this.db=db;this.catalogProjection=catalogProjection; this.site=site; this.resource=resource; this.fileResource=fileResource;this.fileAvailability=fileAvailability;this.aiAdoption=aiAdoption; }

  private async row(id: string,allowAborted=false): Promise<Row> {
    const row = await this.db.prepare("SELECT * FROM content_transitions WHERE id=? AND local_site=? AND local_resource=?").bind(id, this.site, this.resource).first<Row>();
    if (!row) throw new Error("Transition not found on the selected resource");
    if(row.aborted_at!==null&&!allowAborted)throw new Error('This transition was aborted; its retained evidence grants no work authority');
    return row;
  }
  private side(row: Row) { return row.source_site === this.site ? "source" : "target"; }
  async readTransition(id: string) { const row = await this.row(id,true); return { ...identity(row), phase: row.phase,...(row.aborted_at!==null?{abortedAt:row.aborted_at}:{}) }; }
  async beginMaintenance(id:string,now:number,peer:TransitionPeerDescription) {
    const row=await this.row(id);
    if(this.side(row)!=='source'||row.phase!=='prepared'||row.fence_json||!Number.isSafeInteger(now)||now<0) throw new Error('Maintenance requires the prepared original source');
    const own=await this.describePeer(id);
    assertSameTransition(identity(row),peer.identity);
    if(peer.role!=='target'||peer.site!==row.target_site||peer.resource!==row.target_resource||peer.phase!=='prepared'||peer.maintenanceState!=='open'||peer.schema!==own.schema||peer.schemaDigest!==own.schemaDigest||peer.approvalDigest!==own.approvalDigest||peer.receiverContract!==own.receiverContract) throw new Error('Maintenance target preflight mismatch');
    const proof=JSON.stringify({preflight:{source:own,target:peer,checkedAt:now}});
    await this.db.prepare("UPDATE content_transitions SET maintenance_state='draining',maintenance_started_at=?,maintenance_proof_json=? WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND plan_json=? AND phase='prepared' AND maintenance_state='open' AND fence_json IS NULL").bind(now,proof,id,this.site,this.resource,row.generation,row.plan_json).run();
    const state=await this.db.prepare('SELECT maintenance_state state,maintenance_started_at startedAt FROM content_transitions WHERE id=?').bind(id).first<{state:string;startedAt:number|null}>();
    if(state?.state!=='draining'||state.startedAt===null) throw new Error('Maintenance state changed');
    return state;
  }
  async readMaintenanceBlockers(id:string):Promise<Record<string,number>> {
    const row=await this.row(id);
    if(this.side(row)!=='source') throw new Error('Only source inspects original maintenance work');
    const json=await this.db.prepare(`SELECT ${maintenanceBlockersSql} value`).first<string>('value');
    return JSON.parse(json!);
  }
  async stopMaintenance(id:string,now:number) {
    const row=await this.row(id);
    if(this.side(row)!=='source'||row.phase!=='prepared'||!Number.isSafeInteger(now)||row.maintenance_started_at===null||now<row.maintenance_started_at||!row.maintenance_proof_json) throw new Error('Missing original maintenance preflight');
    if(row.maintenance_state==='stopped') return JSON.parse(row.maintenance_proof_json);
    const adoptions:D1PreparedStatement[]=[];
    await this.aiAdoption?.adoptPending(id,async reviewId=>{adoptions.push(...await this.preparePendingAiReview(id,reviewId));});
    const stop=this.db.prepare(`UPDATE content_transitions SET maintenance_state='stopped',maintenance_stopped_at=?,
      maintenance_proof_json=json_set(maintenance_proof_json,'$.stop',json_object('stoppedAt',?,'generation',generation,'manifestDigest',manifest_digest,'blockers',json(${maintenanceBlockersSql})))
      WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND plan_json=? AND phase='prepared'
        AND maintenance_state='draining' AND maintenance_proof_json=? AND ${maintenanceQuiescentSql}`)
      .bind(now,now,id,this.site,this.resource,row.generation,row.plan_json,row.maintenance_proof_json);
    try {
      // Adoption is provisional until the same transaction proves every original
      // blocker is settled. A failed stop must not strand a source snapshot.
      await this.db.batch([...adoptions,stop,this.db.prepare("SELECT iif(changes()=1,1,json('maintenance_stop_has_unresolved_work'))")]);
    } catch(error) {
      throw new Error(`Maintenance has unresolved original work: ${JSON.stringify(await this.readMaintenanceBlockers(id))}`,{cause:error});
    }
    return JSON.parse((await this.row(id)).maintenance_proof_json!);
  }
  async cancelMaintenance(id:string,generation:number,now:number) {
    const row=await this.row(id);
    if(this.side(row)!=='source'||row.generation!==generation||row.phase!=='prepared'||row.fence_json||!Number.isSafeInteger(now)||row.maintenance_started_at===null||now<row.maintenance_started_at)throw new Error('Maintenance cancellation requires the original unfenced prepared source');
    if(row.maintenance_state==='open'&&JSON.parse(row.maintenance_proof_json??'{}').cancelledAt!==undefined)return;
    const result=await this.db.prepare(`UPDATE content_transitions SET maintenance_state='open',maintenance_proof_json=json_set(maintenance_proof_json,'$.cancelledAt',?)
      WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND plan_json=? AND phase='prepared' AND maintenance_state='draining' AND fence_json IS NULL AND aborted_at IS NULL AND maintenance_proof_json=?
        AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=content_transitions.id AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.ai.unknown','otw-play.ai.resume') AND o.outcome_json IS NULL)` )
      .bind(now,id,this.site,this.resource,generation,row.plan_json,row.maintenance_proof_json).run();
    if(result.meta.changes!==1)throw new Error('Maintenance cannot resume while an existing adopted responsibility or final stop remains');
  }
  async adoptPendingAiReview(id:string,reviewId:string):Promise<void> {
    const statements=await this.preparePendingAiReview(id,reviewId);
    if(statements.length)await this.db.batch(statements);
  }
  private async preparePendingAiReview(id:string,reviewId:string):Promise<D1PreparedStatement[]> {
    const row=await this.row(id);
    const preProtection=row.phase==='prepared'&&row.maintenance_state==='draining';
    if(this.side(row)!=='source'||!preProtection&&!['protected','copying','replaying','target_ingress_ready'].includes(row.phase)||row.fence_json) throw new Error('AI adoption requires the unfenced original source');
    if(await this.db.prepare('SELECT 1 FROM music_ai_review_batch_items WHERE review_id=?').bind(reviewId).first())throw new Error('Original AI batch must finish on its source');
    const operationId=`ai-review-${await digestText(JSON.stringify([row.source_site,reviewId]))}`;
    if(await this.readOperation(id,operationId)) return [];
    const raw=await this.db.prepare(aiReviewSnapshotSql).bind(reviewId).first<string>('value');
    const attempts=await this.db.prepare(aiAttemptSnapshotSql).bind(reviewId).first<string>('value');
    if(!raw||!attempts) throw new Error('Missing original AI attempt');
    const review=JSON.parse(raw),oldAttempts=JSON.parse(attempts) as Array<Record<string,unknown>>;
    const attempt=oldAttempts.find(a=>a.token===review.lease_token&&a.outcome==='running');
    const unissued=['queued','retry_wait'].includes(review.status)&&review.result_json===null&&review.lease_token===null&&review.lease_until===null&&Number.isSafeInteger(review.attempts)&&review.attempts<3&&oldAttempts.length===review.attempts&&oldAttempts.every(a=>a.finished_at!==null&&['provider_rate_limit','provider_unavailable'].includes(String(a.outcome)))&&(review.status==='queued'&&review.attempts===0||review.status==='retry_wait'&&['daily_limit','provider_rate_limit','provider_unavailable'].includes(review.error_code));
    if(!unissued&&(review.status!=='running'||review.result_json!==null||!attempt||!Number.isSafeInteger(review.lease_until)||review.lease_until<0)||typeof review.candidate_id!=='string') throw new Error('Original AI issuance cannot be classified safely');
    const selected=preProtection?preparedAiScopeSql('t.id','?'):"EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_ai_reviews' AND m.row_key=json_array(?))";
    const candidate=await this.db.prepare(`SELECT c.version FROM music_ingestion_candidates c JOIN content_transitions t ON t.id=? WHERE ${selected} AND c.id=? AND c.content_access='normal'`).bind(id,reviewId,review.candidate_id).first<{version:number}>();
    if(!candidate) throw new Error('AI review is outside the selected original scope');
    const command={action:unissued?'adopt_unissued' as const:'adopt_unknown' as const,reviewId,candidateId:review.candidate_id,expectedVersion:candidate.version,videoId:review.video_id,now:Date.now(),issuance:unissued?'unissued' as const:'issuance_unknown' as const,attemptId:unissued?`pending-${await digestText(JSON.stringify([reviewId,review.attempts]))}`:`attempt-${await digestText(String(attempt!.token))}`,requestHash:await digestText(JSON.stringify([review.input_hash,review.model,review.prompt_version,review.input_json])),evidenceHash:await digestText(JSON.stringify([raw,attempts]))};
    const parsed=unissued?parseResumeAiReviewCommand(command):parseUnknownAiReviewCommand(command);if(!parsed) throw new Error('Invalid original AI identity');
    const boundary=(await this.db.prepare('SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1').bind(id).first<number>('n'))!;
    const approved=JSON.parse(row.plan_json) as TransitionPlan;
    // A result-less original uncertainty needs no live catalog dependency.
    // Its private input/actor/lease are excluded by the existing projection.
    // Result projection still waits for the ordinary sealed capture boundary.
    const projectionContext=preProtection?{sourceSite:row.source_site,members:approved.members.map(m=>({uid:m.uid,targetUid:m.targetUid,name:m.code,externalEntityId:null}))}:await readProjectionContext(this.db,approved,boundary);
    const projected=await projectCapturedRecord('music_ai_reviews',JSON.stringify([reviewId]),review,projectionContext);
    if(!projected||projected.destination!=='historical') throw new Error('Missing approved AI history projection');
    const prepared=await this.prepareAdmission({transitionId:id,operationId,idempotencyKey:operationId,codec:{id:unissued?'otw-play.ai.resume':'otw-play.ai.unknown',version:1},kind:'content_edit',subject:{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])},expectedVersion:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parsed}},false,null,null,null,null,false,false,false,false,false,false,false,false,false,false,undefined,false,false,true);
    const snapshot:AiUnknownSnapshot={review:raw,attempts,projected,leaseUntil:unissued?(review.next_retry_at??command.now):review.lease_until,response:null,decision:null};
    return [
      this.db.prepare(`SELECT iif(((${aiReviewSnapshotSql}) IS ?) AND ((${aiAttemptSnapshotSql}) IS ?) AND EXISTS(SELECT 1 FROM content_transitions t JOIN music_ingestion_candidates c ON c.id=? AND c.version=? AND c.external_video_id=? AND c.content_access='normal' WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.plan_json=? AND t.generation=? AND t.fence_json IS NULL AND ${preProtection?"t.phase='prepared' AND t.maintenance_state='draining'":"t.phase IN ('protected','copying','replaying','target_ingress_ready')"}),1,json('ai_original_adoption_race'))`).bind(reviewId,raw,reviewId,attempts,command.candidateId,command.expectedVersion,command.videoId,id,this.site,this.resource,row.plan_json,row.generation),
      // Keep the recursive original-scope view out of the wide snapshot guard's
      // expression tree. Both predicates still run in this same atomic batch.
      this.db.prepare(`WITH scope AS MATERIALIZED(SELECT 1 valid FROM ${preProtection?'content_transition_prepared_validation_membership':'content_transition_membership'} WHERE transition_id=? AND row_table='music_ai_reviews' AND row_key=json_array(?)) SELECT iif(EXISTS(SELECT 1 FROM scope),1,json('ai_original_adoption_scope_race'))`).bind(id,reviewId),
      this.db.prepare("SELECT iif(NOT EXISTS(SELECT 1 FROM music_ai_review_batch_items WHERE review_id=?),1,json('ai_parent_adoption_race'))").bind(reviewId),
      prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)),attempt_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_type(envelope_json,'$.sourceReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({aiReview:snapshot}),unissued?null:JSON.stringify({identity:command.attemptId,status:'unknown'}),id,operationId,prepared.operation.payloadHash),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview.review')=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview.attempts')=?),1,json('ai_adoption_identity_conflict'))").bind(id,operationId,prepared.operation.payloadHash,raw,attempts),
    ];
  }
  async readInactiveTargetWorkspace():Promise<{nativeReady:boolean}|null> {
    const rows=(await this.db.prepare(`SELECT phase,readiness_json,aborted_at FROM content_transitions
      WHERE local_site=? AND local_resource=? AND local_site=target_site
      AND generation=(SELECT max(generation) FROM content_transitions WHERE local_site=target_site)
      AND NOT (aborted_at IS NULL AND phase IN ('target_owned','complete') AND fence_json IS NOT NULL AND installation_json IS NOT NULL
        AND json_extract(installation_json,'$.boundary')=json_extract(fence_json,'$.boundary')
        AND json_extract(installation_json,'$.checkpointDigest')=json_extract(fence_json,'$.checkpointDigest')
        AND json_extract(installation_json,'$.committedFilesAvailable')=1)`)
      .bind(this.site,this.resource).all<{phase:string;readiness_json:string|null;aborted_at:number|null}>()).results;
    return rows.length?{nativeReady:rows.every(row=>row.aborted_at===null && ["target_ingress_ready","source_fenced"].includes(row.phase) && row.readiness_json!==null && JSON.parse(row.readiness_json).receiverContract===TRANSITION_RECEIVER_CONTRACT)}:null;
  }
  async commitSourceAiResponse(id:string,operationId:string,payloadHash:string,statements:D1PreparedStatement[]) {
    const row=await this.row(id,true),operation=await this.exportOperation(id,operationId);
    if(this.side(row)!=='source'||operation.codec.id!=='otw-play.ai.unknown'||operation.payloadHash!==payloadHash) throw new Error('Wrong original source AI completion');
    if(row.aborted_at!==null) {
      await this.db.batch([
        this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=source_site AND local_site=? AND local_resource=? AND aborted_at=? AND maintenance_state='open' AND installation_json=? AND json_extract(installation_json,'$.kind')='target_aborted'),1,json('ai_aborted_source_authority_changed'))").bind(id,this.site,this.resource,row.aborted_at,row.installation_json),
        ...statements,
      ]);
      return;
    }
    return this.commitOperation(id,operationId,row.generation-1,statements,[]);
  }
  /** Only the original AI repository's local business batches. The live review,
   * request and attempt CAS remain their execution authority; this boundary
   * adds the current target owner/capture transaction, never a transferred lease. */
  async commitAiReviewBatch(action:'create'|'claim'|'finish'|'recover'|'prune'|'dead'|'resume'|'finish_resume'|'batch_create'|'batch_claim'|'batch_attach'|'batch_capture'|'batch_finish'|'batch_release'|'batch_pending'|'batch_retry'|'batch_dead',reviewId:string|null,statements:D1PreparedStatement[]):Promise<D1Result[]> {
    const counts={create:3,claim:3,finish:2,recover:2,prune:1,dead:1,resume:3,finish_resume:4,batch_create:2,batch_claim:1,batch_attach:1,batch_capture:1,batch_finish:1,batch_release:1,batch_pending:1,batch_retry:[2,3].includes(statements.length)?statements.length:0,batch_dead:1};
    if(statements.length!==counts[action]||(action==='batch_pending'?false:['recover','prune'].includes(action)?reviewId!==null:!reviewId)) throw new Error('Invalid original AI repository batch');
    const admission=['create','claim','resume','batch_create','batch_claim','batch_pending','batch_retry','batch_dead'].includes(action);
    const savedBatch=action==='batch_claim'?` AND NOT (t.local_site=t.source_site AND t.maintenance_state='draining' AND EXISTS(SELECT 1 FROM music_ai_review_batch_items i WHERE i.id=? AND (i.status IN ('saved','needs_selection','failed','changed') OR i.result_json IS NOT NULL OR EXISTS(SELECT 1 FROM music_ai_reviews r WHERE r.id=i.review_id AND r.status IN ('succeeded','partial','failed')))))`:'';
    return this.commitLocalRuntimeBatch(`ai-${action}`,reviewId,statements,admission,savedBatch,action==='batch_claim'?[reviewId!]:[]);
  }
  async commitIngestionBatch(action:'create'|'response'|'failure'|'dead'|'history'|'prune',id:string|null,statements:D1PreparedStatement[]):Promise<D1Result[]> {
    const fixed={create:3,failure:2,dead:2,history:1};
    if(!statements.length||action in fixed&&statements.length!==fixed[action as keyof typeof fixed]||action!=='prune'&&!id)throw new Error('Invalid original ingestion repository batch');
    return this.commitLocalRuntimeBatch(`ingestion-${action}`,id,statements,['create','dead','history','prune'].includes(action));
  }
  async commitPlaylistWorkBatch(action:'add'|'commandSource'|'saveSummary'|'observeSummary'|'reserve'|'snapshot'|'reviewed'|'disposition'|'beginCompletion'|'itemError'|'close'|'linkNext'|'claim'|'release'|'failed'|'retryBatch'|'dispatched'|'clearExpired',statements:D1PreparedStatement[]):Promise<D1Result[]> {
    const counts={add:1,commandSource:3,saveSummary:1,observeSummary:1,reserve:2,snapshot:1,reviewed:1,disposition:2,beginCompletion:1,itemError:1,close:2,linkNext:1,claim:1,release:1,failed:1,retryBatch:2,dispatched:1,clearExpired:1};
    if(statements.length!==counts[action])throw new Error('Invalid original playlist work repository batch');
    return this.commitLocalRuntimeBatch(`playlist-${action}`,null,statements,['add','commandSource','reserve','disposition','beginCompletion','claim','retryBatch','clearExpired'].includes(action));
  }
  async commitChannelMonitorBatch(action:'create'|'updateStatus'|'updateTarget'|'resetWatermark'|'revokeApproval'|'remove'|'claim'|'recordCandidates'|'complete'|'saveContinuation'|'completeSupplemental'|'markGapSuspected'|'fail',statements:D1PreparedStatement[]):Promise<D1Result[]> {
    const counts={create:4,updateStatus:2,updateTarget:2,resetWatermark:2,revokeApproval:4,remove:2,claim:1,complete:1,saveContinuation:1,completeSupplemental:1,markGapSuspected:1,fail:1};
    if(action==='recordCandidates'?statements.length<2||statements.length>100||statements.length%2!==0:statements.length!==counts[action])throw new Error('Invalid original monitor batch');
    return this.commitLocalRuntimeBatch(`monitor-${action}`,null,statements,['create','updateStatus','updateTarget','resetWatermark','revokeApproval','remove','claim'].includes(action));
  }
  // Only the composed repositories above reach this infrastructure helper.
  // Their original message/claim/version SQL remains the business authority.
  private async commitLocalRuntimeBatch(action:string,reviewId:string|null,statements:D1PreparedStatement[],admission:boolean,savedBatch='',gateBindings:Array<string|number|null>=[]):Promise<D1Result[]> {
    const row=await this.db.prepare("SELECT * FROM content_transitions WHERE aborted_at IS NULL AND local_site=? AND local_resource=? ORDER BY generation DESC LIMIT 1").bind(this.site,this.resource).first<Row>();
    const gate=this.db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM content_transitions t WHERE t.generation=(SELECT max(generation) FROM content_transitions)
      AND (t.maintenance_state${admission?"<>'open'":"='stopped'"}${savedBatch} OR (t.local_site=t.target_site AND t.phase NOT IN ('target_owned','complete')))),1,json('content_transition_maintenance_admission'))`).bind(...gateBindings);
    if(!row||this.side(row)==='source') {
      const result=await this.db.batch([gate,...statements]);
      return result.slice(1);
    }
    if(!['target_owned','complete'].includes(row.phase)||row.maintenance_state!=='open')throw new TransitionMaintenanceError();
    const commitId=`${action}-${reviewId??'maintenance'}-${crypto.randomUUID()}`;
    const result=await this.db.batch([
      gate,
      this.db.prepare('INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)').bind(row.id,commitId),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq)
        SELECT 1,id,?,generation,1,(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions
        WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase IN ('target_owned','complete') AND maintenance_state='open' AND aborted_at IS NULL AND plan_json=? AND fence_json=? AND installation_json=?`)
        .bind(commitId,row.id,commitId,row.id,this.site,this.resource,row.generation,row.plan_json,row.fence_json,row.installation_json),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_permits WHERE transition_id=? AND operation_id=?),1,json('ai_owner_changed'))").bind(row.id,commitId),
      ...statements,...captureStatements(this.db,row.id),
      this.db.prepare('UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?').bind(row.id,commitId),
      this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(row.id),
    ]);
    return result.slice(4,4+statements.length);
  }
  async recoveryTransitions(after=""):Promise<string[]> {
    const rows=await this.db.prepare(`SELECT id FROM content_transitions WHERE aborted_at IS NULL AND local_site=? AND local_resource=? AND id>?
      AND ((local_site=source_site AND (fence_json IS NOT NULL OR (phase IN ('protected','copying','replaying','target_ingress_ready') AND EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=content_transitions.id AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.codec.id') IN ('schedules.chzzk_scan','otw-play.channel.mutate','otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve','otw-play.ai.unknown'))))) OR (local_site=target_site AND phase IN ('target_ingress_ready','source_fenced','target_owned','complete')))
      ORDER BY id LIMIT 50`).bind(this.site,this.resource,after).all<{id:string}>();
    return rows.results.map(row=>row.id);
  }
  async recoveryPage(id:string,kind:"operation"|"file",after=0) {
    const owner=await this.row(id),source=this.side(owner)==="source";
    const table=kind==="operation"?"content_transition_operations":"content_transition_file_intents";
    const key=kind==="operation"?"operation_id":"intent_id",fingerprint=kind==="operation"?"payload_hash":"version_key";
    if(source && !owner.fence_json) {
      if(kind!=="operation") return [];
      return (await this.db.prepare(`SELECT seq,operation_id recordId,payload_hash fingerprint,0 terminal,NULL sourceSequence FROM content_transition_operations WHERE transition_id=? AND seq>? AND outcome_json IS NULL AND json_extract(envelope_json,'$.codec.id') IN ('schedules.chzzk_scan','otw-play.channel.mutate','otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve','otw-play.ai.unknown') ORDER BY seq LIMIT 50`).bind(id,after).all<{seq:number;recordId:string;fingerprint:string;terminal:number;sourceSequence:number|null}>()).results;
    }
    const boundary=source?JSON.parse(owner.fence_json!)[kind==="operation"?"operationBoundary":"fileIntentBoundary"]:null;
    const terminal="json_extract(outcome_json,'$.sideEffectReconciled')=1";
    const needed=source?"seq<=? AND outcome_acknowledged=0":kind==="operation"?`(coalesce(${terminal},0)=0 OR (source_seq IS NOT NULL AND transferred=1 AND outcome_acknowledged=0))`:`(${terminal} AND source_seq IS NOT NULL AND transferred=1 AND outcome_acknowledged=0)`;
    return (await this.db.prepare(`SELECT seq,${key} AS recordId,${fingerprint} AS fingerprint,coalesce(${terminal},0) AS terminal,source_seq AS sourceSequence FROM ${table}
      WHERE transition_id=? AND seq>? AND ${needed} ${source&&kind==='operation'?`AND NOT EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=content_transition_operations.transition_id AND ${installedSourceAiHandoffSql('content_transition_operations','t')})`:''} ORDER BY seq LIMIT 50`).bind(id,after,...(source?[boundary]:[])).all<{seq:number;recordId:string;fingerprint:string;terminal:number;sourceSequence:number|null}>()).results;
  }
  async describePeer(id:string):Promise<TransitionPeerDescription> {
    const row=await this.row(id,true);
    if(row.protocol!==1 || row.source_site===row.target_site) throw new Error("Unsupported relay protocol or site pair");
    // Probe the actual installed final-transfer columns, then fingerprint the
    // installed control schema. A runtime version label alone is not schema proof.
    await this.db.prepare("SELECT source_seq,transferred,outcome_acknowledged FROM content_transition_operations LIMIT 0").all();
    await this.db.prepare("SELECT source_seq,transferred,outcome_acknowledged FROM content_transition_file_intents LIMIT 0").all();
    const schema=(await this.db.prepare(`SELECT type,name,sql FROM sqlite_master AS schema
      WHERE (name GLOB 'content_transition_*' OR name GLOB 'ct_*' OR name GLOB 'maintenance_*') AND sql IS NOT NULL
        AND (type<>'index' OR EXISTS(SELECT 1 FROM pragma_index_list(schema.tbl_name) AS idx WHERE idx.name=schema.name AND idx."unique"=1))
      ORDER BY type,name`).all()).results;
    if(!schema.length) throw new Error("Missing installed transition schema");
    return {identity:identity(row),site:this.site,resource:this.resource,role:this.side(row),schema:1,schemaDigest:await digestText(JSON.stringify(schema)),approvalDigest:await digestText(row.plan_json),receiverContract:TRANSITION_RECEIVER_CONTRACT,phase:row.phase,maintenanceState:row.maintenance_state};
  }
  async readSourceFence(id:string):Promise<SourceFence> {
    const row=await this.row(id,true);
    if(this.side(row)!=="source" || !row.fence_json) throw new Error("Source has no persisted fence");
    return JSON.parse(row.fence_json);
  }
  async prepareSongMutation(input:OtwPlayAdminUpdateSongRequest) {
    const members=input.originalArtists.flatMap(artist=>artist.subject.kind==="member"?[artist.subject.memberUid]:[]);
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND
      ((t.local_site=t.source_site AND t.phase NOT IN ('prepared','source_fenced','target_owned','complete') AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_songs' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') m WHERE json_extract(m.value,'$.uid') IN (SELECT value FROM json_each(?)))
      )) OR (t.local_site=t.target_site AND EXISTS(SELECT 1 FROM music_songs WHERE id=?)))`).bind(this.site,this.resource,input.id,JSON.stringify(members),input.id).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Song has conflicting transition owners");
    const state=playSongState(input);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async prepareVideoMutation(command:VideoCatalogMutation) {
    const scope=playVideoSourceScope(command);
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (t.local_site=t.target_site OR (t.phase<>'prepared' AND ${scope.sql}))`).bind(this.site,this.resource,...scope.bindings).all<{id:string}>();
    if(owners.results.length>1) throw new Error('Video command has conflicting transition owners');
    return owners.results[0]?this.readTransition(owners.results[0].id):null;
  }
  async readVideoReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json,o.source_seq FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.video.mutate','otw-play.candidate.convert')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string;source_seq:number|null}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt,operation=(await this.readOperation(row.transition_id,operationId))!;
    const command=receipt?.command??(row.source_seq!==null?{...parseVideoCatalogMutation(operation.payload),actor:null}:null);
    if(!command||!parseVideoReadCommand(operation.codec.id,command)||row.source_seq===null&&(!command.actor?.userId||receipt.actorId!==command.actor.userId)||row.source_seq!==null&&command.actor!==null) throw new Error('Invalid original video actor/command');
    type Data=OtwPlayAdminPerformanceDto|OtwPlayAdminCatalogEntryResultDto|OtwPlayAdminProposalDto;
    const decode=(raw:unknown):OtwPlayAdminCommandResponse<Data>|null=>{
      if(!raw||typeof raw!=='object') return null;
      const result=raw as {data?:Record<string,unknown>};
      const performance=result.data?.performance;
      for(const data of [result.data,performance&&typeof performance==='object'?performance as Record<string,unknown>:null]) if(data&&Object.hasOwn(data,'broadcastJson')) {
        data.broadcast=typeof data.broadcastJson==='string'?readBroadcastMetadata(data.broadcastJson):null;delete data.broadcastJson;
      }
      return raw as OtwPlayAdminCommandResponse<Data>;
    };
    return {command:command as VideoCatalogCommand,result:decode(receipt?.result??null),entryResult:decode(receipt?.entryResult??null),conversionResult:(receipt?.conversionResult??null) as import('@contracts/otw-play').OtwPlayIngestionConversionResultDto|null,failure:receipt?.failure??null,operation};
  }

  async admitVideoMutation(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:VideoCatalogCommand) {
    if(!command.actor?.userId||input.codec.id!==(command.action==='candidate_convert'?'otw-play.candidate.convert':'otw-play.video.mutate')||JSON.stringify(parseVideoCatalogMutation(input.payload))!==JSON.stringify(parseVideoCatalogMutation(command))) throw new Error('Missing original video actor/command');
    const row=await this.row(input.transitionId),source=this.side(row)==='source',plan:TransitionPlan=JSON.parse(row.plan_json);
    const dependencies=source?await videoDependencies(this.db,plan,command):null;
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,true,dependencies?.context);
    const key=source?'sourceReceipt':'nativeReceipt',dependencyCapture=`video-dependencies:${input.operationId}`,scope=playVideoSourceScope(command);
    await this.db.batch([
      ...(dependencies?[dependencies.guard]:[]),
      ...(command.action==='candidate_convert'?[this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_candidates c JOIN music_channels ch ON ch.external_channel_id=c.channel_id AND ch.provider='youtube' WHERE c.id=? AND c.version=? AND c.status='ready' AND c.content_access='normal' AND c.external_video_id=? AND c.candidate_kind=? AND ch.id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM music_ingestion_candidate_origins origin WHERE origin.candidate_id=c.id AND origin.job_id=?))),1,json('conversion_admission_candidate_race'))`).bind(command.input.candidateId,command.input.expectedVersion,command.input.videoId,command.input.candidateKind,command.input.catalogChannelId,command.input.jobId,command.input.jobId)]:[]),prepared.insert,
      ...(source?[this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.plan_json=? AND t.phase IN ('protected','copying','replaying','target_ingress_ready') AND ${scope.sql}),1,json('video_source_admission_scope_conflict'))`).bind(input.transitionId,this.site,this.resource,row.plan_json,...scope.bindings)]:[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL AND outcome_json IS NULL`).bind(JSON.stringify({actorId:command.actor.userId,command,result:null,entryResult:null,...(source?{dependencyCapture,dependencyReferences:dependencies!.references,dependencyStage:(command.action==='catalog_create'||command.action==='proposal_approve')&&command.input.channel.kind!=='existing'?{status:'pending'}:null}:{})}),input.transitionId,input.operationId),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.${key}.actorId')=?),1,json('video_admission_conflict'))`).bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
      ...await D1YouTubeVideoReadJournal.registration(this.db,prepared.operation),
      ...(source?[
        this.db.prepare('INSERT OR IGNORE INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)').bind(input.transitionId,dependencyCapture),
        this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,t.id,?,t.generation-1,1,c.seq FROM content_transitions t JOIN content_transition_commits c ON c.transition_id=t.id AND c.operation_id=? AND c.sealed=0 WHERE t.id=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')`).bind(dependencyCapture,dependencyCapture,input.transitionId),
        this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(input.operationId,input.transitionId,dependencyCapture),
        ...captureStatements(this.db,input.transitionId),
        this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql('content_transition_permits.transition_id')} WHERE transition_id=?`).bind(input.transitionId),
        this.db.prepare('UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?').bind(input.transitionId,dependencyCapture),
        this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(input.transitionId),
      ]:[]),
    ]);
    return (await this.readVideoReceipt(input.operationId))!;
  }
  async videoDependency(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoDependency|null> {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(this.side(row)!=='source'||!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash) throw new Error('Wrong original video dependency authority');
    const command=receipt.command;
    if((command.action!=='catalog_create'&&command.action!=='proposal_approve')||command.input.channel.kind==='existing') return null;
    const raw=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.dependencyStage') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    const value=raw?JSON.parse(raw):null;
    if(value?.status!=='ready') return null;
    const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,value.requestKey);
    if(value.transitionId!==id||value.operationId!==operationId||value.payloadHash!==payloadHash||value.generation!==row.generation-1||value.requestHash!==read.requestHash||value.responseHash!==read.responseHash||read.response?.status!=='success'||!read.response.video||read.response.video.channelId!==value.externalChannelId||value.capture!==`video-channel:${operationId}`) throw new Error('Invalid original channel dependency witness');
    const projected=parseVideoCatalogMutation(receipt.operation.payload);
    const external=command.input.channel.kind==='recognized_member'&&projected&&(projected.action==='catalog_create'||projected.action==='proposal_approve')&&projected.input.channel.kind==='confirm'&&projected.input.channel.owners.length===1&&projected.input.channel.owners[0].kind==='entity'?projected.input.channel.owners[0].entityId:null;
    if(value.recognizedExternalEntityId!==external||(command.input.channel.kind==='recognized_member'?typeof value.recognizedChannelAllowed!=='boolean':value.recognizedChannelAllowed!==null)) throw new Error('Invalid original recognized-member dependency');
    return value;
  }
  async resolveVideoDependency(id:string,operationId:string,payloadHash:string,requestKey:string) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(this.side(row)!=='source'||!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash) throw new Error('Wrong original video dependency authority');
    const command=receipt.command;
    if((command.action!=='catalog_create'&&command.action!=='proposal_approve')||command.input.channel.kind==='existing') return null;
    const prior=await this.videoDependency(id,operationId,payloadHash);if(prior) return prior;
    if(!['protected','copying','replaying','target_ingress_ready'].includes(row.phase)) throw new Error('Original channel dependency was not resolved before fence');
    const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,requestKey);
    if(read.response?.status!=='success'||!read.response.video||!read.responseHash) return null;
    const externalChannelId=read.response.video.channelId;
    const matchedChannelId=await this.db.prepare("SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?").bind(externalChannelId).first<string>('id');
    const member=command.input.channel.kind==='recognized_member'?command.input.channel.memberUid:null;
    const recognizedSql="EXISTS(SELECT 1 FROM members m WHERE m.uid=? AND (m.is_deprecated IS NULL OR m.is_deprecated=0) AND (m.youtube_channel_id=? OR EXISTS(SELECT 1 FROM member_links l WHERE l.member_uid=m.uid AND l.youtube_channel_id=? AND l.enabled=1 AND l.type IN ('youtube_vod','youtube_sub'))))";
    const recognizedChannelAllowed=member===null?null:Boolean(await this.db.prepare(`SELECT ${recognizedSql} allowed`).bind(member,externalChannelId,externalChannelId).first('allowed'));
    const projected=parseVideoCatalogMutation(receipt.operation.payload);
    const recognizedExternalEntityId=member!==null&&projected&&(projected.action==='catalog_create'||projected.action==='proposal_approve')&&projected.input.channel.kind==='confirm'&&projected.input.channel.owners.length===1&&projected.input.channel.owners[0].kind==='entity'?projected.input.channel.owners[0].entityId:null;
    const capture=`video-channel:${operationId}`,witness:YouTubeVideoDependency={status:'ready',transitionId:id,operationId,payloadHash,generation:row.generation-1,requestKey,requestHash:read.requestHash,responseHash:read.responseHash,externalChannelId,matchedChannelId,recognizedChannelAllowed,recognizedExternalEntityId,capture};
    await this.db.batch([
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id JOIN content_transition_chzzk_requests r ON r.transition_id=o.transition_id AND r.operation_id=o.operation_id WHERE t.id=? AND t.local_site=t.source_site AND t.local_site=? AND t.local_resource=? AND t.plan_json=? AND t.generation=? AND t.phase IN ('protected','copying','replaying','target_ingress_ready') AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.status')='pending' AND r.request_key=? AND r.request_hash=? AND r.response_hash=?),1,json('video_dependency_boundary_race'))`).bind(id,this.site,this.resource,row.plan_json,row.generation,operationId,payloadHash,requestKey,read.requestHash,read.responseHash),
      this.db.prepare("SELECT iif((SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?) IS ?,1,json('video_matched_channel_race'))").bind(externalChannelId,matchedChannelId),
      ...(member===null?[]:[this.db.prepare(`SELECT iif(${recognizedSql}=?,1,json('video_recognized_channel_race'))`).bind(member,externalChannelId,externalChannelId,recognizedChannelAllowed?1:0)]),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.dependencyStage',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify(witness),id,operationId),
      ...(matchedChannelId?[this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_insert(envelope_json,'$.sourceReceipt.dependencyReferences[#]',json(?)) WHERE transition_id=? AND operation_id=? AND NOT EXISTS(SELECT 1 FROM json_each(envelope_json,'$.sourceReceipt.dependencyReferences') r WHERE json_extract(r.value,'$.table')='music_channels' AND json_extract(r.value,'$.key')=json_array(?))").bind(JSON.stringify({table:'music_channels',key:JSON.stringify([matchedChannelId])}),id,operationId,matchedChannelId)]:[]),
      this.db.prepare('INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)').bind(id,capture),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,t.id,?,t.generation-1,1,c.seq FROM content_transitions t JOIN content_transition_commits c ON c.transition_id=t.id AND c.operation_id=? AND c.sealed=0 WHERE t.id=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')`).bind(capture,capture,id),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(operationId,id,capture),
      ...captureStatements(this.db,id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql('content_transition_permits.transition_id')} WHERE transition_id=?`).bind(id),
      this.db.prepare('UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?').bind(id,capture),
      this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(id),
    ]);
    return this.videoDependency(id,operationId,payloadHash);
  }
  async checkVideoDependency(id:string,operationId:string,dependency:YouTubeVideoDependency|null) {
    const receipt=await this.readVideoReceipt(operationId),row=await this.row(id);
    if(!receipt||receipt.operation.transitionId!==id) throw new Error('Missing original video command');
    const command=receipt.command,required=(command.action==='catalog_create'||command.action==='proposal_approve')&&command.input.channel.kind!=='existing';
    if(!dependency) {
      if(required&&receipt.operation.sourceSequence!==null) throw new Error('Missing frozen original channel dependency');
      return [];
    }
    if(!required||dependency.transitionId!==id||dependency.operationId!==operationId||dependency.payloadHash!==receipt.operation.payloadHash||dependency.generation!==row.generation-1||receipt.operation.sourceSequence===null&&this.side(row)!=='source') throw new Error('Invalid original video dependency scope');
    const projected=parseVideoCatalogMutation(receipt.operation.payload)!;
    if(dependency.recognizedExternalEntityId!==null&&this.side(row)==='target'&&((projected.action!=='catalog_create'&&projected.action!=='proposal_approve')||projected.input.channel.kind!=='confirm'||projected.input.channel.owners.length!==1||projected.input.channel.owners[0].kind!=='entity'||projected.input.channel.owners[0].entityId!==dependency.recognizedExternalEntityId)) throw new Error('Original external channel credit mapping mismatch');
    return [this.db.prepare("SELECT iif((SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?) IS ?,1,json('video_frozen_channel_conflict'))").bind(dependency.externalChannelId,dependency.matchedChannelId)];
  }
  async videoExecutionCommand(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId),executable=await this.readExecutableCommand(id,operationId),parsed=parseVideoCatalogMutation(executable.payload);
    if(!receipt||receipt.operation.transitionId!==id||!parsed) throw new Error('Missing original video execution authority');
    let command:VideoCatalogCommand={...parsed,actor:receipt.command.actor},sourceRevisionValid=true;
    if(this.side(row)==='target'&&receipt.operation.sourceSequence!==null&&(parsed.action==='catalog_create'||parsed.action==='proposal_approve')) {
      const fence:SourceFence=JSON.parse(row.fence_json!),installation:CommittedStateInstallation=JSON.parse(row.installation_json!);
      if(!Number.isSafeInteger(fence.sourceCatalogRevision)||!Number.isSafeInteger(installation.catalogRevisionAnchor)) throw new Error('Missing frozen original catalog revision witness');
      sourceRevisionValid=parsed.input.expectedCatalogRevision===fence.sourceCatalogRevision;
      command=parsed.action==='catalog_create'?{...parsed,input:{...parsed.input,expectedCatalogRevision:installation.catalogRevisionAnchor!},actor:receipt.command.actor}:{...parsed,input:{...parsed.input,expectedCatalogRevision:installation.catalogRevisionAnchor!},actor:receipt.command.actor};
    }
    return {command,sourceRevisionValid};
  }
  async conversionPreflight(id:string,operationId:string,payloadHash:string):Promise<CandidateConversionPreflightStage|null> {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||receipt.command.action!=='candidate_convert') throw new Error('Missing original candidate conversion');
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt';
    const raw=await this.db.prepare(`SELECT json_extract(envelope_json,'$.${key}.conversionPreflight') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(id,operationId).first<string>('value');
    if(!raw) return null;
    const stage=JSON.parse(raw) as CandidateConversionPreflightStage;
    if(stage.transitionId!==id||stage.operationId!==operationId||stage.payloadHash!==payloadHash||stage.site!==row.source_site&&stage.site!==row.target_site||stage.generation!==(stage.site===row.source_site?row.generation-1:row.generation)||!Number.isSafeInteger(stage.result?.catalogRevision)||!stage.requestHash||!stage.responseHash) throw new Error('Invalid immutable conversion preflight');
    return stage;
  }
  async saveConversionPreflight(id:string,operationId:string,stage:CandidateConversionPreflightStage) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId),prior=await this.conversionPreflight(id,operationId,stage.payloadHash);
    if(prior) {if(JSON.stringify(prior)!==JSON.stringify(stage)) throw new Error('Conversion preflight changed');return prior;}
    if(!receipt||receipt.command.action!=='candidate_convert'||stage.transitionId!==id||stage.operationId!==operationId||stage.payloadHash!==receipt.operation.payloadHash) throw new Error('Wrong conversion preflight identity');
    const source=this.side(row)==='source',key=source?'sourceReceipt':'nativeReceipt',localStage=stage.site===this.site;
    if(source&&!localStage||!localStage&&receipt.operation.sourceSequence===null||stage.generation!==(stage.site===row.source_site?row.generation-1:row.generation)) throw new Error('Wrong original preflight owner');
    if(source||receipt.operation.sourceSequence===null) {
      const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,stage.payloadHash,`youtube:videos:0:${receipt.command.input.videoId}`);
      if(read.requestHash!==stage.requestHash||read.responseHash!==stage.responseHash||read.response?.status!=='success') throw new Error('Preflight lacks its original durable response');
    }
    await this.db.batch([
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'"}) AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL${localStage?' AND (SELECT revision FROM music_catalog_meta WHERE id=1)=?':''}),1,json('conversion_preflight_owner_race'))`).bind(id,this.site,this.resource,row.generation,operationId,stage.payloadHash,...(localStage?[stage.result.catalogRevision]:[])),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.conversionPreflight',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}.conversionPreflight') IS NULL`).bind(JSON.stringify(stage),id,operationId),
      this.db.prepare(`SELECT iif(json_extract(envelope_json,'$.${key}.conversionPreflight')=json(?),1,json('conversion_preflight_identity_race')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify(stage),id,operationId),
    ]);
    return (await this.conversionPreflight(id,operationId,stage.payloadHash))!;
  }
  async conversionRevision(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.command.action!=='candidate_convert') throw new Error('Missing conversion authority');
    const stage=await this.conversionPreflight(id,operationId,receipt.operation.payloadHash);
    if(!stage) throw new Error('Missing original conversion preflight');
    if(stage.site===this.site) return {revision:stage.result.catalogRevision,valid:true};
    if(this.side(row)!=='target'||receipt.operation.sourceSequence===null||!row.fence_json||!row.installation_json) throw new Error('Missing transferred conversion preflight');
    const fence:SourceFence=JSON.parse(row.fence_json),installation:CommittedStateInstallation=JSON.parse(row.installation_json);
    if(!Number.isSafeInteger(fence.sourceCatalogRevision)||!Number.isSafeInteger(installation.catalogRevisionAnchor)) throw new Error('Missing conversion revision witness');
    return {revision:installation.catalogRevisionAnchor!,valid:stage.result.catalogRevision===fence.sourceCatalogRevision};
  }
  async conversionJobScope(id:string,operationId:string,alias:'candidate'|'music_ingestion_candidates'='candidate') {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id||receipt.command.action!=='candidate_convert') throw new Error('Missing original conversion scope');
    const jobId=receipt.command.input.jobId,historical=receipt.operation.sourceSequence!==null&&this.side(row)==='target';
    if(!historical) return {historical:false,sql:`(? IS NULL OR EXISTS(SELECT 1 FROM music_ingestion_candidate_origins origin WHERE origin.candidate_id=${alias}.id AND origin.job_id=?))`,bindings:[jobId,jobId]};
    if(receipt.command.actor!==null) throw new Error('Transferred conversion cannot inherit an actor');
    if(jobId!==null&&!await this.db.prepare("SELECT 1 FROM content_historical_records origin JOIN content_historical_records job ON job.source_site=origin.source_site AND job.source_table='music_ingestion_jobs' AND job.source_key=json_extract(origin.record_json,'$.values.job_id') WHERE origin.source_site=? AND origin.source_table='music_ingestion_candidate_origins' AND json_extract(origin.record_json,'$.values.candidate_id')=? AND json_extract(origin.record_json,'$.values.job_id')=?").bind(row.source_site,receipt.command.input.candidateId,jobId).first()) throw new Error('Missing approved original conversion job origin');
    return {historical:true,sql:jobId===null?'1':`EXISTS(SELECT 1 FROM content_historical_records origin JOIN content_historical_records job ON job.source_site=origin.source_site AND job.source_table='music_ingestion_jobs' AND job.source_key=json_extract(origin.record_json,'$.values.job_id') WHERE origin.source_site=? AND origin.source_table='music_ingestion_candidate_origins' AND json_extract(origin.record_json,'$.values.candidate_id')=${alias}.id AND json_extract(origin.record_json,'$.values.job_id')=?)`,bindings:jobId===null?[]:[row.source_site,jobId]};
  }
  async transferredConversionEvent(id:string,operationId:string,event:{eventId:string;jobId:string|null;candidateId:string;eventType:string;detailJson:string;now:number;fromChanges?:boolean}) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(this.side(row)!=='target'||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence===null||receipt.command.actor!==null||receipt.command.action!=='candidate_convert') throw new Error('Missing imported conversion event authority');
    const command=receipt.command,created=event.eventType==='candidate.convert.created';
    if(event.jobId!==command.input.jobId||event.candidateId!==command.input.candidateId||event.now!==command.now||event.eventId!==(created?command.ids.candidateEventId:command.ids.outcomeEventId)||!['candidate.convert.created','candidate.convert.duplicate','candidate.convert.stale','candidate.convert.validation_failed','candidate.convert.retryable_failed'].includes(event.eventType)||Boolean(event.fromChanges)===created) throw new Error('Conversion event outside original identities');
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const projected=await projectCapturedRecord('music_ingestion_events',JSON.stringify([event.eventId]),{id:event.eventId,job_id:null,candidate_id:event.candidateId,event_type:event.eventType,detail_json:event.detailJson,created_at:event.now},{sourceSite:row.source_site,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))});
    if(!projected||projected.destination!=='historical') throw new Error('Missing approved ingestion event projection');
    // The command's job identity is already the approved historical identity;
    // projecting it as a source raw ID again would double-hash the reference.
    const record=decodeProjectedRecord({...projected,value:{...projected.value,job_id:event.jobId}},{sourceSite:row.source_site,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))});
    const statements=historicalStatements(this.db,record,[{table:'music_ingestion_candidates',key:JSON.stringify([event.candidateId])}]);
    if(event.fromChanges) {
      statements[0]=this.db.prepare(`INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) VALUES(?,?,?,json_set(?,'$.values.event_type',CASE WHEN changes()=1 THEN ? ELSE 'candidate.convert.stale' END),?) ON CONFLICT(source_site,source_table,source_key) DO UPDATE SET record_json=excluded.record_json WHERE content_historical_records.protocol=excluded.protocol`).bind(record.sourceSite,record.table,record.sourceRecordId,JSON.stringify(historicalMaterial(record)),event.eventType,record.version);
    }
    return statements;
  }
  /** Preserve the actual original approved/version+1 shortcut and its private
   * DTO before sealing any unused read. No target account fields leave this row. */
  async videoApprovalNoop(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoNoopPreparation|null> {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||receipt.command.action!=='proposal_approve') throw new Error('Missing original approved-result authority');
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt';
    const raw=await this.db.prepare(`SELECT json_extract(envelope_json,'$.${key}.videoApprovalNoop') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(id,operationId).first<string>('value');
    if(!raw) return null;
    const value=JSON.parse(raw);
    if(value.resultHash!==await digestText(JSON.stringify(value.result))||value.control.failure||value.control.reads.some((read:{disposition:string})=>read.disposition==='exhausted_unknown')) throw new Error('Invalid original approved-result preparation');
    return {control:value.control,resultHash:value.resultHash};
  }
  async prepareVideoApprovalNoop(id:string,operationId:string,control:YouTubeVideoCompletion) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id||receipt.command.action!=='proposal_approve'||control.failure||control.reads.some(read=>read.disposition==='exhausted_unknown')) throw new Error('Missing original already-approved result authority');
    const op=receipt.operation,prior=await this.videoApprovalNoop(id,operationId,op.payloadHash);
    if(prior) return prior;
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt',resultJson=await this.db.prepare(`SELECT ${playVideoProposalResultSql} result`).bind(receipt.command.proposalId).first<string>('result');
    if(!resultJson) throw new Error('Missing original already-approved result');
    const result=JSON.parse(resultJson),resultHash=await digestText(JSON.stringify(result)),proof={control,resultHash};
    await this.db.batch([
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${this.side(row)==='source'?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'"}) AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_type(o.envelope_json,'$.${key}.videoFailurePreparation') IS NULL),1,json('video_approval_preparation_owner_race'))`).bind(id,this.site,this.resource,row.generation,operationId,op.payloadHash),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=? AND status='approved' AND approved_performance_id IS NOT NULL AND version=? AND content_access='normal') AND ${playVideoProposalResultSql}=?,1,json('video_approval_noop_race'))`).bind(receipt.command.proposalId,receipt.command.input.expectedVersion+1,receipt.command.proposalId,resultJson),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL`).bind(JSON.stringify({actorId:receipt.command.actor?.userId??null,command:receipt.command,result:null,entryResult:null}),id,operationId),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.videoApprovalNoop',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}.videoApprovalNoop') IS NULL`).bind(JSON.stringify({...proof,result}),id,operationId),
    ]);
    const actual=await this.videoApprovalNoop(id,operationId,op.payloadHash);
    if(JSON.stringify(actual)!==JSON.stringify(proof)) throw new Error('Conflicting original approved-result preparation');
    return proof;
  }
  async completeVideoApprovalNoop(id:string,operationId:string,proof:YouTubeVideoNoopPreparation) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||(await this.videoApprovalNoop(id,operationId,receipt.operation.payloadHash))?.resultHash!==proof.resultHash) throw new Error('Missing original already-approved result preparation');
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt',op=receipt.operation,journal=new D1YouTubeVideoReadJournal(this.db,this.site,this.resource);
    if((this.side(row)==='source'||op.sourceSequence===null)&&JSON.stringify(await journal.approvalNoopPreparation(id,operationId,op.payloadHash))!==JSON.stringify(proof)) throw new Error('Original unused video reads are not sealed');
    const outcome:OperationOutcome={outcome:'committed',sideEffectReconciled:true,detail:'Original proposal already approved; no new catalog mutation',youtubeVideo:proof.control};
    await this.db.batch([
      ...(this.side(row)==='source'||op.sourceSequence===null?journal.completionGuard(id,operationId,proof.control):[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json_extract(envelope_json,'$.${key}.videoApprovalNoop.result'),'$.${key}.videoApprovalNoop.control',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.${key}.videoApprovalNoop.resultHash')=? AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=? AND c.operation_id=?) AND EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${this.side(row)==='source'?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'"}))`).bind(JSON.stringify(proof.control),JSON.stringify(outcome),id,operationId,op.payloadHash,proof.resultHash,id,operationId,id,this.site,this.resource,row.generation),
      this.db.prepare("SELECT iif(changes()=1,1,json('video_approval_noop_owner_race'))"),
    ]);
  }
  async commitVideo(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],control:YouTubeVideoCompletion,capture:VideoResultCapture,dependency:YouTubeVideoDependency|null) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id) throw new Error('Missing original video receipt');
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt',result=playVideoResult(capture);
    return this.commitOperation(id,operationId,generation,[
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL`).bind(JSON.stringify({actorId:receipt.command.actor?.userId??null,command:receipt.command,result:null,entryResult:null}),id,operationId),
      ...await this.checkVideoDependency(id,operationId,dependency),
      ...statements,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${capture.kind==='entry'&&capture.proposalId?playVideoProposalResultSql:result.sql})${capture.kind==='entry'?`, '$.${key}.entryResult',json(${result.sql})`:''}) WHERE transition_id=? AND operation_id=?`).bind(...(capture.kind==='entry'&&capture.proposalId?[capture.proposalId]:result.bindings),...(capture.kind==='entry'?result.bindings:[]),id,operationId),
      ...(receipt.command.action==='candidate_convert'?[this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.conversionResult',json(?)) WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify({candidateId:receipt.command.input.candidateId,outcome:'created',performanceId:receipt.command.ids.performanceId,errorCode:null}),id,operationId)]:[]),
    ],[],undefined,undefined,undefined,undefined,control);
  }
  async commitConversionOutcome(id:string,operationId:string,generation:number,command:{jobId:string|null;candidateId:string;expectedVersion:number;outcome:'duplicate'|'stale'|'validation_failed'|'retryable_failed';performanceId:string|null;errorCode:string|null;actorUserId:string|null;eventId:string;now:number},statements:D1PreparedStatement[],control:YouTubeVideoCompletion) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(!receipt||receipt.operation.transitionId!==id||receipt.command.action!=='candidate_convert') throw new Error('Missing original conversion outcome authority');
    const original=receipt.command,key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt';
    if(command.candidateId!==original.input.candidateId||command.jobId!==original.input.jobId||command.expectedVersion!==original.input.expectedVersion||command.actorUserId!==(original.actor?.userId??null)||command.eventId!==original.ids.outcomeEventId||command.now!==original.now) throw new Error('Changed original conversion outcome');
    const historical=this.side(row)==='target'&&receipt.operation.sourceSequence!==null;
    const eventSql=historical?"(SELECT json_extract(record_json,'$.values.event_type') FROM content_historical_records WHERE source_site=? AND source_table='music_ingestion_events' AND source_key=?)":"(SELECT event_type FROM music_ingestion_events WHERE id=?)";
    const eventBindings=historical?[row.source_site,await historicalRecordId(row.source_site,'music_ingestion_events',JSON.stringify([command.eventId]))]:[command.eventId];
    const outcomeSql=`CASE WHEN ${eventSql}=? THEN ? ELSE 'stale' END`;
    const outcomeBindings=[...eventBindings,`candidate.convert.${command.outcome}`,command.outcome];
    return this.commitOperation(id,operationId,generation,[
      ...statements,
      this.db.prepare(`SELECT iif(${eventSql} IN (?,'candidate.convert.stale'),1,json('conversion_outcome_event_missing'))`).bind(...eventBindings,`candidate.convert.${command.outcome}`),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.conversionResult',json_object('candidateId',?,'outcome',${outcomeSql},'performanceId',?,'errorCode',CASE WHEN ${eventSql}=? THEN ? ELSE 'stale_write' END)) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(command.candidateId,...outcomeBindings,command.performanceId,...eventBindings,`candidate.convert.${command.outcome}`,command.errorCode,id,operationId),
      this.db.prepare(`UPDATE content_transition_operations SET outcome_json=json_object('outcome',CASE json_extract(envelope_json,'$.${key}.conversionResult.outcome') WHEN 'duplicate' THEN 'committed' WHEN 'stale' THEN 'conflicted' ELSE 'failed' END,'sideEffectReconciled',json('true'),'detail','Original candidate conversion outcome recorded','youtubeVideo',json(?)) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(JSON.stringify(control),id,operationId),
    ],[],undefined,undefined,undefined,undefined,control,true);
  }
  async transferredVideoEvent(id:string,operationId:string,event:{id:string;aggregateType:'entity'|'channel'|'song'|'performance'|'proposal';aggregateId:string;eventType:string;afterJson:string|null;now:number}) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(this.side(row)!=='target'||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence===null||receipt.command.actor!==null||event.now!==receipt.command.now||event.afterJson===null) throw new Error('Missing original transferred video event authority');
    const command=receipt.command,ids=command.ids;
    const valid=event.aggregateType==='entity'&&'entityEventIds' in ids&&Object.entries(ids.entityEventIds).some(([key,value])=>value===event.id&&ids.entityIds[key]===event.aggregateId)&&['entity.created_from_member','entity.created_inline','entity.created'].includes(event.eventType)
      ||event.aggregateType==='performance'&&(command.action==='performance_create'||command.action==='performance_update')&&event.id===command.ids.eventId&&event.aggregateId===(command.action==='performance_update'?command.input.id:command.ids.performanceId)&&event.eventType===(command.action==='performance_update'?'performance.updated':'performance.created')
      ||(command.action==='catalog_create'||command.action==='proposal_approve'||command.action==='candidate_convert')&&(
        event.aggregateType==='performance'&&event.id===command.ids.performanceEventId&&event.aggregateId===command.ids.performanceId&&event.eventType==='performance.created_inline'
        ||event.aggregateType==='song'&&event.id===command.ids.songEventId&&event.aggregateId===command.ids.songId&&event.eventType==='song.created_inline'
        ||event.aggregateType==='channel'&&event.id===command.ids.channelEventId&&event.eventType==='channel.confirmed_inline'
        ||command.action==='proposal_approve'&&event.aggregateType==='proposal'&&event.id===command.ids.proposalEventId&&event.aggregateId===command.proposalId&&event.eventType==='proposal.approved');
    if(!valid) throw new Error('Video event outside original generated identities');
    const plan:TransitionPlan=JSON.parse(row.plan_json),projected=await projectCapturedRecord('music_catalog_events',JSON.stringify([event.id]),{id:event.id,aggregate_type:event.aggregateType,aggregate_id:event.aggregateId,event_type:event.eventType,actor_kind:'admin',before_json:null,after_json:event.afterJson,detail_json:null,created_at:event.now},{sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))});
    if(!projected||projected.destination!=='historical') throw new Error('Missing approved video event projection');
    const subject=playVideoSubject(command),subjects:Array<{table:'music_performances'|'music_cover_proposals'|'music_ingestion_candidates';key:string}>=[{table:subject.table==='music_cover_proposals'?'music_cover_proposals':subject.table==='music_ingestion_candidates'?'music_ingestion_candidates':'music_performances',key:JSON.stringify([subject.id])}];
    if(command.action==='proposal_approve'||command.action==='candidate_convert') subjects.push({table:'music_performances',key:JSON.stringify([command.ids.performanceId])});
    return [this.db.prepare("SELECT iif(NOT EXISTS(SELECT 1 FROM content_historical_records WHERE source_site=? AND source_table=? AND source_key=? AND (protocol<>? OR record_json<>?)),1,json('video_historical_event_conflict'))").bind(projected.sourceSite,projected.table,projected.sourceRecordId,projected.version,JSON.stringify(historicalMaterial(projected))),...historicalStatements(this.db,projected,subjects)];
  }
  async transferredVideoApproval(id:string,operationId:string,proposalId:string,lockToken:string) {
    const row=await this.row(id),receipt=await this.readVideoReceipt(operationId);
    if(this.side(row)!=='target'||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence===null||receipt.command.actor!==null||receipt.command.action!=='proposal_approve'||receipt.command.proposalId!==proposalId||!lockToken) throw new Error('Missing original transferred approval authority');
    const proposal=await this.db.prepare("SELECT historical_source_site,historical_source_record_id FROM music_cover_proposals WHERE id=? AND status='pending_review' AND version=? AND content_access='normal'").bind(proposalId,receipt.command.input.expectedVersion).first<{historical_source_site:string|null;historical_source_record_id:string|null}>();
    if(!proposal||proposal.historical_source_site!==row.source_site||!proposal.historical_source_record_id) throw new Error('Missing imported proposal origin');
    return true;
  }
  async recordVideoFailure(id:string,operationId:string,control:YouTubeVideoCompletion,failure:YouTubeVideoFailure) {
    const row=await this.row(id),operation=await this.exportOperation(id,operationId);
    if(operation.codec.id!=='otw-play.video.mutate'||operation.attempt||JSON.stringify(parseVideoCatalogFailure(failure))!==JSON.stringify(failure)) throw new Error('Missing original video failure authority');
    const journal=new D1YouTubeVideoReadJournal(this.db,this.site,this.resource);
    if(this.side(row)==='source'||operation.sourceSequence===null) await journal.assertCompletion(id,operationId,operation.payloadHash,control);
    const source=this.side(row)==='source',key=source?'sourceReceipt':'nativeReceipt',phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    const outcome:OperationOutcome={outcome:failure.code==='stale_write'?'conflicted':'failed',sideEffectReconciled:true,detail:'Original video catalog command rejected without a business commit',youtubeVideo:control};
    assertOperationEvidence({attempt:null,outcome});
    await this.db.batch([
      ...(this.side(row)==='source'||operation.sourceSequence===null?journal.completionGuard(id,operationId,control):[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.failure',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND attempt_json IS NULL AND json_extract(envelope_json,'$.${key}.result') IS NULL AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=? AND c.operation_id=?) AND EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${phases}))`).bind(JSON.stringify(failure),JSON.stringify(outcome),id,operationId,operation.payloadHash,id,operationId,id,this.site,this.resource,row.generation),
    ]);
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error('Video failure lost final-owner/result race');
  }
  async prepareChannelMutation(command:ChannelMutation) {
    const scope=playChannelSourceScope(command);
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND
      (t.local_site=t.target_site OR (t.phase<>'prepared' AND ${scope.sql}))`).bind(this.site,this.resource,...scope.bindings).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Channel has conflicting transition owners");
    const state=playChannelState(command);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async readChannelReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json,o.source_seq FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.channel.mutate'`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string;source_seq:number|null}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt,operation=(await this.readOperation(row.transition_id,operationId))!;
    const command=receipt?.command??(row.source_seq!==null?{...parseChannelMutation(operation.payload),actor:null}:null);
    if(!command || !parseChannelMutation(command) || row.source_seq===null && (!command.actor?.userId || receipt.actorId!==command.actor.userId) || row.source_seq!==null && command.actor!==null) throw new Error("Invalid original channel actor/command");
    return {command:command as ChannelMutationCommand,result:(receipt?.result??operation.outcome?.youtubeChannel?.result??null) as OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>|null,failure:(receipt?.failure??null) as {code:"not_found"|"stale_write"|"validation_failed";message:string;sqlError?:string}|null,operation};
  }
  async admitChannelMutation(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:ChannelMutationCommand) {
    if(!command.actor?.userId || JSON.stringify(parseChannelMutation(input.payload))!==JSON.stringify(parseChannelMutation(command)) || input.codec.id!=="otw-play.channel.mutate") throw new Error("Missing original channel actor/command");
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,true),state=playChannelState(command),source=this.side(prepared.row)==="source";
    const version=command.action==="create"?"NOT EXISTS(SELECT 1 FROM music_channels WHERE id=?)":"EXISTS(SELECT 1 FROM music_channels WHERE id=? AND version=?)";
    const versionBinds=command.action==="create"?[command.id]:[command.id,command.input.expectedVersion];
    const dependencyCapture=`channel-dependencies:${input.operationId}`;
    const scope=playChannelSourceScope(command);
    await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND ${version},1,json('channel_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),...versionBinds),prepared.insert,
      ...(source?[this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.local_site=t.source_site AND t.plan_json=? AND t.phase IN ('protected','copying','replaying','target_ingress_ready') AND ${scope.sql}),1,json('channel_source_admission_scope_conflict'))`).bind(input.transitionId,this.site,this.resource,prepared.row.plan_json,...scope.bindings)]:[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${source?"sourceReceipt":"nativeReceipt"}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${source?"sourceReceipt":"nativeReceipt"}') IS NULL AND outcome_json IS NULL`).bind(JSON.stringify({actorId:command.actor.userId,command,result:null,...(source?{dependencyCapture}:{})}),input.transitionId,input.operationId),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.${source?"sourceReceipt":"nativeReceipt"}.actorId')=?),1,json('channel_admission_conflict'))`).bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
      await D1YouTubeChannelReadJournal.registration(this.db,prepared.operation),
      ...(source?[
        this.db.prepare("INSERT OR IGNORE INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(input.transitionId,dependencyCapture),
        this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq)
          SELECT 1,t.id,?,t.generation-1,1,c.seq FROM content_transitions t JOIN content_transition_commits c ON c.transition_id=t.id AND c.operation_id=? AND c.sealed=0
          WHERE t.id=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')`).bind(dependencyCapture,dependencyCapture,input.transitionId),
        this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(input.operationId,input.transitionId,dependencyCapture),
        ...captureStatements(this.db,input.transitionId),
        this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql("content_transition_permits.transition_id")} WHERE transition_id=?`).bind(input.transitionId),
        this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?").bind(input.transitionId,dependencyCapture),
        this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(input.transitionId),
      ]:[]),
    ]);
    return (await this.readChannelReceipt(input.operationId))!;
  }
  async reconcileChannelPrecondition(id:string,operationId:string,control:YouTubeChannelCompletion) {
    const row=await this.row(id),receipt=await this.readChannelReceipt(operationId),command=await this.readExecutableCommand(id,operationId),parsed=parseChannelMutation(command.payload);
    if(!receipt || receipt.operation.transitionId!==id || !parsed || typeof command.payload.expectedState!=="string") throw new Error("Missing original channel precondition");
    if(receipt.operation.sourceSequence===null) await new D1YouTubeChannelReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,receipt.operation.payloadHash,control);
    const state=playChannelState(parsed),outcome:OperationOutcome={outcome:"conflicted",sideEffectReconciled:true,detail:"Original channel state no longer matches",youtubeChannel:control};
    assertOperationEvidence({attempt:null,outcome});
    const phase=this.side(row)==="source"?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND NOT (${state.sql}=?)
      AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN (${phase}))`)
      .bind(JSON.stringify(outcome),id,operationId,receipt.operation.payloadHash,...state.bindings,command.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitChannel(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],control:YouTubeChannelCompletion) {
    const row=await this.row(id),receipt=await this.readChannelReceipt(operationId);
    if(!receipt || receipt.operation.transitionId!==id) throw new Error("Missing original channel receipt");
    const command=await this.readExecutableCommand(id,operationId);
    if(JSON.stringify(parseChannelMutation(command.payload))!==JSON.stringify(parseChannelMutation(receipt.command))) throw new Error("Original channel command identity conflict");
    const key=this.side(row)==="source"?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL`).bind(JSON.stringify({actorId:receipt.command.actor?.userId??null,command:receipt.command,result:null}),id,operationId),
      ...statements,this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${playChannelResultSql})) WHERE transition_id=? AND operation_id=?`).bind(receipt.command.id,id,operationId),
    ],[],undefined,undefined,undefined,control);
  }
  async transferredChannelEvent(id:string,operationId:string,event:{id:string;channelId:string;eventType:"channel.created"|"channel.updated";beforeJson:string|null;afterJson:string|null;now:number},approvalStep?:'create'|'update') {
    if(approvalStep!==undefined&&approvalStep!=='create'&&approvalStep!=='update') throw new Error('Unknown channel event continuation');
    const row=await this.row(id),parent=approvalStep?await this.readCandidateChannelReceipt(operationId):null;
    const child=approvalStep?parent?.stages?.[approvalStep]:null;
    const receipt=approvalStep?(parent&&child?{operation:parent.operation,command:{...child.command,actor:parent.command.actor}}:null):await this.readChannelReceipt(operationId);
    if(this.side(row)!=="target" || !receipt || receipt.operation.transitionId!==id || receipt.operation.sourceSequence===null || receipt.command.actor!==null
      || event.afterJson===null || event.id!==receipt.command.eventId || event.channelId!==receipt.command.id || event.now!==receipt.command.now || event.eventType!==(receipt.command.action==="create"?"channel.created":"channel.updated")) throw new Error("Missing original transferred channel event authority");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const projected=await projectCapturedRecord("music_catalog_events",JSON.stringify([event.id]),{id:event.id,aggregate_type:"channel",aggregate_id:event.channelId,event_type:event.eventType,actor_kind:"admin",before_json:event.beforeJson,after_json:event.afterJson,detail_json:null,created_at:event.now},{sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))});
    if(!projected || projected.destination!=="historical") throw new Error("Missing approved original event projection");
    const material=JSON.stringify(historicalMaterial(projected));
    return [
      this.db.prepare("SELECT iif(NOT EXISTS(SELECT 1 FROM content_historical_records WHERE source_site=? AND source_table=? AND source_key=? AND (protocol<>? OR record_json<>?)),1,json('channel_historical_event_conflict'))").bind(projected.sourceSite,projected.table,projected.sourceRecordId,projected.version,material),
      ...historicalStatements(this.db,projected,[]),
    ];
  }
  async recordChannelFailure(id:string,operationId:string,control:YouTubeChannelCompletion,failure:{code:"not_found"|"stale_write"|"validation_failed";message:string;sqlError?:string}) {
    const row=await this.row(id),operation=await this.exportOperation(id,operationId);
    if(operation.codec.id!=="otw-play.channel.mutate" || control.disposition!=="consumed" || control.failure!==null || operation.attempt) throw new Error("Missing original channel failure authority");
    if(operation.sourceSequence===null) await new D1YouTubeChannelReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,control);
    const source=this.side(row)==="source",key=source?"sourceReceipt":"nativeReceipt",phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    const outcome:OperationOutcome={outcome:failure.code==="stale_write"?"conflicted":"failed",sideEffectReconciled:true,detail:"Original channel catalog command rejected without a business commit",youtubeChannel:control};
    await this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.failure',json(?)),outcome_json=?
      WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND attempt_json IS NULL AND json_extract(envelope_json,'$.${key}.result') IS NULL
        AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=? AND c.operation_id=?)
        AND EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${phases}))`)
      .bind(JSON.stringify(failure),JSON.stringify(outcome),id,operationId,operation.payloadHash,id,operationId,id,this.site,this.resource,row.generation).run();
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error("Channel failure lost final-owner/result race");
  }
  async preparePublication(id:string) {
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND
      ((t.local_site=t.target_site AND EXISTS(SELECT 1 FROM music_performances WHERE id=?)) OR (t.phase<>'prepared' AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_performances' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM music_performance_participants p JOIN music_entities e ON e.id=p.entity_id JOIN json_each(t.plan_json,'$.members') m ON json_extract(m.value,'$.uid')=e.member_uid WHERE p.performance_id=?)
      )))`).bind(this.site,this.resource,id,id,id).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Performance has conflicting transition owners");
    const state=playPublicationState(id);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async prepareMemberSubmission(command:MemberSubmissionCommand) {
    if(command.action!=="create" && !await this.db.prepare("SELECT 1 FROM music_cover_proposals WHERE id=? AND submitted_by_user_id=?").bind(command.proposalId,command.userId).first()) return null;
    const uids=command.action==="withdraw"?[]:[...command.input.participants,...command.input.originalArtists].flatMap(subject=>subject.kind==="member"?[subject.memberUid]:[]);
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      t.local_site=t.target_site OR (t.local_site=t.source_site AND t.phase<>'prepared' AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_cover_proposals' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') m JOIN json_each(?) uid ON uid.value=json_extract(m.value,'$.uid'))
      )))`).bind(this.site,this.resource,command.proposalId,JSON.stringify(uids)).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Submission has conflicting transition owners");
    return owners.results[0]?this.readTransition(owners.results[0].id):null;
  }
  async readMemberSubmissionReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.member.mutate','otw-play.member.local')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !parseMemberSubmissionMutation(receipt.command) || !receipt.actorId || receipt.actorId!==receipt.command.userId) throw new Error("Missing original submission actor/command");
    const result=receipt.result as (OtwPlayMemberSubmissionDto & {broadcastJson?:string|null})|null;
    if(result) {result.broadcast=result.broadcastJson?readBroadcastMetadata(result.broadcastJson):null;delete result.broadcastJson;}
    return {command:receipt.command as MemberSubmissionCommand,result,failure:receipt.failure as {code?:string;message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeMemberSubmission(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:MemberSubmissionCommand) {
    if(JSON.stringify(parseMemberSubmissionMutation(input.payload))!==JSON.stringify(parseMemberSubmissionMutation(command)) || !command.userId) throw new Error("Submission command identity conflict");
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,true),predicate=memberSubmissionPredicate(command);
    await this.db.batch([
      this.db.prepare(`SELECT iif(${predicate.sql},1,json('member_submission_state_conflict'))`).bind(...predicate.bindings),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.userId')=?),1,json('member_submission_identity_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.userId),
    ]);
    return (await this.readMemberSubmissionReceipt(input.operationId))!;
  }
  async recordMemberSubmissionFailure(id:string,operationId:string,failure:{code:string;message:string}) {
    if(!['not_found','duplicate','stale_write','idempotency_conflict','rate_limited','invalid_request'].includes(failure.code)) throw new Error("Not a definitive original submission failure");
    const row=await this.row(id),receipt=await this.readMemberSubmissionReceipt(operationId);
    if(this.side(row)!=="target" || !receipt || receipt.operation.transitionId!==id || receipt.operation.sourceSequence!==null || receipt.operation.codec.id!=="otw-play.member.mutate" || receipt.operation.attempt) throw new Error("Missing native submission failure authority");
    await this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.failure',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND attempt_json IS NULL AND json_type(envelope_json,'$.nativeReceipt.result')='null'
      AND NOT EXISTS(SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify(failure),JSON.stringify({outcome:failure.code==='stale_write'?'conflicted':'failed',sideEffectReconciled:true,detail:"Original member submission rejected without business"}),id,operationId,receipt.operation.payloadHash,id,operationId,id,this.site,this.resource,row.generation).run();
  }
  async memberSubmissionNoWrite(command:MemberSubmissionCommand) {
    if(command.action==='create') return await this.db.prepare(`SELECT 'rate_limited' code WHERE NOT EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=?) AND
      (SELECT count(*) FROM music_cover_proposals WHERE submitted_by_user_id=? AND created_at>=? AND created_at<?)>=(SELECT CAST(value AS INTEGER) FROM settings WHERE key='otw_play_submission_daily_limit' AND typeof(value)='text' AND CAST(value AS INTEGER) BETWEEN 1 AND 100)`)
      .bind(command.proposalId,command.userId,command.dayStart,command.dayEnd).first<string>('code');
    if(command.action==='update') {
      const predicate=memberSubmissionPredicate(command);
      return await this.db.prepare(`SELECT 'duplicate' code WHERE ${predicate.sql} AND (EXISTS(SELECT 1 FROM music_media_sources WHERE provider='youtube' AND external_id=?) OR EXISTS(SELECT 1 FROM music_cover_proposals WHERE id<>? AND youtube_video_id=? AND segment_start_seconds=0 AND status='pending_review'))`).bind(...predicate.bindings,command.videoId,command.proposalId,command.videoId).first<string>('code');
    }
    return null;
  }
  async commitMemberSubmission(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:MemberSubmissionCommand}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.userId):undefined,receipt=local?null:await this.readMemberSubmissionReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.userId || receipt && (receipt.operation.codec.id!=="otw-play.member.mutate" || JSON.stringify(parseMemberSubmissionMutation(receipt.operation.payload))!==JSON.stringify(parseMemberSubmissionMutation(command)))) throw new Error("Missing original submission identity");
    const key=local?"sourceReceipt":"nativeReceipt",predicate=memberSubmissionPredicate(command),version=memberSubmissionVersion(command);
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${predicate.sql},1,json('member_submission_state_conflict'))`).bind(...predicate.bindings),this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.userId,command,result:null}),id,operationId)]:[]),
      ...statements,
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=? AND submitted_by_user_id=? AND content_access='normal' AND status=? AND version=? AND updated_at=?),1,json('member_submission_no_write'))").bind(command.proposalId,command.userId,command.action==='withdraw'?'withdrawn':'pending_review',version===null?0:version+1,command.now),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${memberSubmissionResultSql})) WHERE transition_id=? AND operation_id=?`).bind(command.proposalId,command.userId,id,operationId),
    ],[],prepared);
  }
  async prepareProposalRejection(id:string) {
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      (t.local_site=t.target_site AND EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=?)) OR
      (t.local_site=t.source_site AND t.phase<>'prepared' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_cover_proposals' AND m.row_key=json_array(?))))`).bind(this.site,this.resource,id,id).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Proposal has conflicting transition owners");
    return owners.results[0]?this.readTransition(owners.results[0].id):null;
  }
  async prepareReviewDeletion(command:ReviewDeletion) {
    const table=reviewDeletionTable(command);
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      t.local_site=t.target_site AND EXISTS(SELECT 1 FROM ${table} WHERE id=?) OR
      t.local_site=t.source_site AND t.phase<>'prepared' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table=? AND m.row_key=json_array(?)))`).bind(this.site,this.resource,command.id,table,command.id).all<{id:string}>();
    if(owners.results.length>1) throw new Error('Review deletion has conflicting owners');
    return owners.results[0]?this.readTransition(owners.results[0].id):null;
  }
  async prepareCandidateReview(command:CandidateReviewCommand) {
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      t.local_site=t.target_site AND EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=?) OR
      t.local_site=t.source_site AND t.phase<>'prepared' AND (EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_ingestion_candidates' AND m.row_key=json_array(?))
        OR EXISTS(SELECT 1 FROM json_tree(?) j JOIN json_each(t.plan_json,'$.members') approved ON j.value=json_extract(approved.value,'$.uid') WHERE j.key='memberUid')))`)
      .bind(this.site,this.resource,command.candidateId,command.candidateId,JSON.stringify(command.action==='save'?command.input:null)).all<{id:string}>();
    if(owners.results.length>1) throw new Error('Candidate review has conflicting owners');
    return owners.results[0]?this.readTransition(owners.results[0].id):null;
  }
  async findConversionCandidateTransition(candidateId:string) {
    const rows=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (t.local_site=t.target_site AND EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=?) OR t.local_site=t.source_site AND t.phase<>'prepared' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_ingestion_candidates' AND m.row_key=json_array(?)))`).bind(this.site,this.resource,candidateId,candidateId).all<{id:string}>();
    if(rows.results.length>1) throw new Error('Conflicting conversion candidate owners');
    return rows.results[0]?this.readTransition(rows.results[0].id):null;
  }
  async readCandidateChannelReceipt(operationId:string) {
    const row=await this.db.prepare("SELECT o.transition_id,o.envelope_json,o.source_seq FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.channel_approve'").bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string;source_seq:number|null}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt,operation=(await this.readOperation(row.transition_id,operationId))!;
    const command=receipt?.command??(row.source_seq!==null?{...parseCandidateChannelMutation(operation.payload),actor:null}:null);
    if(!command||!parseCandidateChannelMutation(command)||row.source_seq===null&&(!command.actor?.userId||command.actor.userId!==receipt.actorId)||row.source_seq!==null&&command.actor!==null) throw new Error('Missing original channel parent authority');
    return {operation,command:command as CandidateChannelCommand,stages:receipt?.channelApproval?parseCandidateChannelStages(receipt.channelApproval,command):null,result:(receipt?.result??null) as OtwPlayIngestionReviewCandidateDto|null,failure:receipt?.failure as YouTubeVideoFailure|undefined};
  }
  private candidateChannelCaptureStatements(id:string,operationId:string,capture:string) {
    return [
      this.db.prepare('INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)').bind(id,capture),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,t.id,?,t.generation-1,1,c.seq FROM content_transitions t JOIN content_transition_commits c ON c.transition_id=t.id AND c.operation_id=? WHERE t.id=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')").bind(capture,capture,id),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(operationId,id,capture),
      ...captureStatements(this.db,id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql('content_transition_permits.transition_id')} WHERE transition_id=?`).bind(id),
      this.db.prepare('UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?').bind(id,capture),
      this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(id),
    ];
  }
  async admitCandidateChannel(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:CandidateChannelCommand) {
    if(input.codec.id!=='otw-play.candidate.channel_approve'||!command.actor?.userId||JSON.stringify(parseCandidateChannelMutation(input.payload))!==JSON.stringify(parseCandidateChannelMutation(command))) throw new Error('Invalid original channel parent admission');
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,true),source=this.side(prepared.row)==='source',key=source?'sourceReceipt':'nativeReceipt',dependencyCapture=`video-dependencies:${input.operationId}`;
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND external_video_id=? AND content_access='normal' AND status NOT IN ('converted','ignored')),1,json('candidate_channel_admission_race'))").bind(command.candidateId,command.expectedVersion,command.videoId),
      ...(source?[this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_membership WHERE transition_id=? AND row_table='music_ingestion_candidates' AND row_key=json_array(?) AND root_table=row_table AND root_key=row_key),1,json('candidate_channel_source_scope'))").bind(input.transitionId,command.candidateId)]:[]),prepared.insert,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL AND outcome_json IS NULL`).bind(JSON.stringify({actorId:command.actor.userId,command,result:null,channelApproval:emptyCandidateChannelStages(),...(source?{dependencyCapture,dependencyReferences:command.channel.entityIds.map(id=>({table:'music_entities',key:JSON.stringify([id])}))}:{})}),input.transitionId,input.operationId),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.${key}.actorId')=?),1,json('candidate_channel_admission_conflict'))`).bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
      ...await D1YouTubeVideoReadJournal.registration(this.db,prepared.operation),
      ...(source?this.candidateChannelCaptureStatements(input.transitionId,input.operationId,dependencyCapture):[]),
    ]);
    return (await this.readCandidateChannelReceipt(input.operationId))!;
  }
  async sealCandidateChannelSnapshot(id:string,operationId:string,payloadHash:string,input:Pick<CandidateChannelApprovalSnapshot,'entities'|'existing'>) {
    const row=await this.row(id),receipt=await this.readCandidateChannelReceipt(operationId),source=this.side(row)==='source',key=source?'sourceReceipt':'nativeReceipt';
    if(!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||!source&&receipt.operation.sourceSequence!==null||!receipt.stages) throw new Error('Missing original local channel snapshot authority');
    if(receipt.stages.snapshot) return receipt.stages.snapshot;
    const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,`youtube:videos:0:${receipt.command.videoId}`);
    if(read.response?.status!=='success'||!read.response.video||!read.responseHash) throw new Error('Missing original channel preflight response');
    const video=read.response.video,state=playChannelStateFor(input.existing?.id??null,receipt.command.channel.entityIds),expectedState=(await this.db.prepare(`SELECT ${state.sql} value`).bind(...state.bindings).first<string>('value'))!;
    const phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'",capture=source?`channel-approval-snapshot:${operationId}`:null;
    const snapshot:CandidateChannelApprovalSnapshot={externalChannelId:video.channelId,channelTitle:video.channelTitle,requestHash:read.requestHash,responseHash:read.responseHash,entities:input.entities,existing:input.existing,expectedState,capture};
    parseCandidateChannelStages({...receipt.stages,snapshot},receipt.command);
    const existing=input.existing;
    const existingGuard=existing?"EXISTS(SELECT 1 FROM music_channels c WHERE c.id=? AND c.provider='youtube' AND c.external_channel_id=? AND c.display_name=? AND c.channel_role=? AND c.verification_status=? AND c.active=? AND c.version=? AND (SELECT coalesce(json_group_array(entity_id),'[]') FROM (SELECT entity_id FROM music_channel_entities WHERE channel_id=c.id ORDER BY entity_id))=?)":"NOT EXISTS(SELECT 1 FROM music_channels WHERE provider='youtube' AND external_channel_id=?)";
    const existingBinds=existing?[existing.id,video.channelId,existing.displayName,existing.channelRole,existing.verificationStatus,Number(existing.active),existing.version,JSON.stringify(existing.entityIds.slice().sort())]:[video.channelId];
    await this.db.batch([
      this.db.prepare(`SELECT iif(${existingGuard} AND ${state.sql}=? AND (SELECT count(*) FROM music_entities WHERE id IN (SELECT value FROM json_each(?)))=? AND NOT EXISTS(SELECT 1 FROM json_each(?) fact WHERE NOT EXISTS(SELECT 1 FROM music_entities e WHERE e.id=json_extract(fact.value,'$.id') AND e.archived_at IS json_extract(fact.value,'$.archivedAt') AND (e.member_uid IS NOT NULL)=json_extract(fact.value,'$.isMember'))),1,json('candidate_channel_snapshot_lookup_race'))`).bind(...existingBinds,...state.bindings,expectedState,JSON.stringify(receipt.command.channel.entityIds),input.entities.length,JSON.stringify(input.entities)),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id JOIN content_transition_chzzk_requests r ON r.transition_id=o.transition_id AND r.operation_id=o.operation_id WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.plan_json=? AND t.phase IN (${phases}) AND o.operation_id=? AND o.payload_hash=? AND o.source_seq IS NULL AND o.outcome_json IS NULL AND json_type(o.envelope_json,'$.${key}.channelApproval.snapshot')='null' AND r.request_key=? AND r.request_hash=? AND r.response_hash=?),1,json('candidate_channel_snapshot_owner_race'))`).bind(id,this.site,this.resource,row.generation,row.plan_json,operationId,payloadHash,read.requestKey,read.requestHash,read.responseHash),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.snapshot',json(?)) WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify(snapshot),id,operationId),
      ...(source&&existing?[this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_insert(envelope_json,'$.sourceReceipt.dependencyReferences[#]',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({table:'music_channels',key:JSON.stringify([existing.id])}),id,operationId)]:[]),
      ...await D1YouTubeVideoReadJournal.registration(this.db,receipt.operation,video.channelId),
      ...(capture?this.candidateChannelCaptureStatements(id,operationId,capture):[]),
    ]);
    return (await this.readCandidateChannelReceipt(operationId))!.stages!.snapshot!;
  }
  async sealCandidateChannelRefreshFacts(id:string,operationId:string,payloadHash:string,facts:CandidateMetadataFacts,read:import('@contracts/content-transition-youtube').YouTubeVideoReadReceipt) {
    const row=await this.row(id),receipt=await this.readCandidateChannelReceipt(operationId),source=this.side(row)==='source',key=source?'sourceReceipt':'nativeReceipt';
    const child=receipt?.stages?.refresh;
    if(!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||!child) throw new Error('Missing original parent refresh stage');
    if(child.facts) return child.facts;
    if(read.transitionId!==id||read.operationId!==operationId||read.payloadHash!==payloadHash||read.requestKey!==`youtube:videos:3:${child.command.videoId}`||read.response?.status!=='observation'||read.response.observation.videoId!==child.command.videoId||!read.responseHash) throw new Error('Wrong original parent refresh observation');
    if(source||receipt.operation.sourceSequence===null) {
      const actual=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,read.requestKey);
      if(actual.requestHash!==read.requestHash||actual.responseHash!==read.responseHash) throw new Error('Changed original refresh response');
    }
    const externalChannelId=read.response.observation.video?.channelId??null,matchedChannelId=externalChannelId===null?null:await this.db.prepare("SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?").bind(externalChannelId).first<string>('id');
    const capture=source?`channel-approval-refresh:${operationId}`:null;
    const stage:NonNullable<NonNullable<CandidateChannelApprovalStages['refresh']>['facts']>={transitionId:id,operationId,payloadHash,generation:receipt.operation.generation,requestKey:read.requestKey,requestHash:read.requestHash,responseHash:read.responseHash,externalChannelId,matchedChannelId,facts,capture,site:this.site};
    parseCandidateChannelStages({...receipt.stages!,refresh:{...child,facts:stage}},receipt.command);
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_media_sources WHERE provider='youtube' AND external_id=?)=? AND EXISTS(SELECT 1 FROM music_cover_proposals WHERE youtube_video_id=? AND segment_start_seconds=0 AND status='pending_review')=? AND (SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?) IS ? AND (SELECT json_object('verification_status',verification_status,'active',active,'channel_role',channel_role) FROM music_channels WHERE id=?) IS ?,1,json('candidate_channel_refresh_lookup_race'))").bind(child.command.videoId,Number(facts.existingSource),child.command.videoId,Number(facts.existingProposal),externalChannelId,matchedChannelId,matchedChannelId,facts.channel?JSON.stringify(facts.channel):null),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.plan_json=? AND t.phase IN (${source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'"}) AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.${key}.channelApproval.refresh')=json(?)),1,json('candidate_channel_refresh_owner_race'))`).bind(id,this.site,this.resource,row.generation,row.plan_json,operationId,payloadHash,JSON.stringify(child)),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.refresh.facts',json(?)) WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify(stage),id,operationId),
      ...(source&&matchedChannelId?[this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_insert(envelope_json,'$.sourceReceipt.dependencyReferences[#]',json(?)) WHERE transition_id=? AND operation_id=? AND NOT EXISTS(SELECT 1 FROM json_each(envelope_json,'$.sourceReceipt.dependencyReferences') r WHERE json_extract(r.value,'$.table')='music_channels' AND json_extract(r.value,'$.key')=json_array(?))").bind(JSON.stringify({table:'music_channels',key:JSON.stringify([matchedChannelId])}),id,operationId,matchedChannelId)]:[]),
      ...(capture?this.candidateChannelCaptureStatements(id,operationId,capture):[]),
    ]);
    return (await this.readCandidateChannelReceipt(operationId))!.stages!.refresh!.facts!;
  }
  async candidateChannelChildReceipt(id:string,operationId:string,payloadHash:string,step:'create'|'update') {
    if(step!=='create'&&step!=='update') throw new Error('Unknown channel continuation receipt');
    const row=await this.row(id),receipt=await this.readCandidateChannelReceipt(operationId),child=receipt?.stages?.[step];
    if(this.side(row)!=='target'||!receipt||receipt.operation.sourceSequence===null||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||!child?.result||!child.resultState||!await this.db.prepare('SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id=? AND sealed=1').bind(id,`${operationId}:channel:${step}`).first()) throw new Error('Missing sealed original target child result');
    return child;
  }
  async installCandidateChannelStages(id:string,operationId:string,payloadHash:string,stages:CandidateChannelApprovalStages) {
    const row=await this.row(id),receipt=await this.readCandidateChannelReceipt(operationId);
    if(!receipt||this.side(row)!=='target'||receipt.operation.sourceSequence===null||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash||!['target_owned','complete'].includes(row.phase)) throw new Error('Not the admitted transferred channel parent');
    parseCandidateChannelStages(stages,receipt.command);
    const prior=receipt.stages;
    if(prior?.snapshot&&JSON.stringify(prior.snapshot)!==JSON.stringify(stages.snapshot)) throw new Error('Changed source channel snapshot');
    const merged={...stages};
    for(const step of ['create','update','refresh'] as const) {
      if(!prior?.[step]) continue;
      if(stages[step]&&JSON.stringify(prior[step]!.command)!==JSON.stringify(stages[step]!.command)) throw new Error('Changed original channel child identity');
      // A committed owner result can precede its acknowledgement to source.
      if(step==='refresh') merged.refresh=prior.refresh;
      else if(prior[step]!.result) merged[step]=prior[step];
    }
    parseCandidateChannelStages(merged,receipt.command);
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND t.local_site=t.target_site AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.plan_json=? AND t.phase IN ('target_owned','complete') AND o.operation_id=? AND o.payload_hash=? AND o.source_seq IS NOT NULL AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.nativeReceipt.channelApproval') IS ?),1,json('candidate_channel_install_race'))").bind(id,this.site,this.resource,row.generation,row.plan_json,operationId,payloadHash,prior?JSON.stringify(prior):null),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL").bind(JSON.stringify({actorId:null,command:receipt.command,result:null,channelApproval:merged}),id,operationId),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.channelApproval',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify(merged),id,operationId),
    ]);
    return (await this.readCandidateChannelReceipt(operationId))!;
  }
  async commitCandidateChannelChild(id:string,operationId:string,generation:number,step:'create'|'update',statements:D1PreparedStatement[],control:YouTubeVideoCompletion) {
    if(step!=='create'&&step!=='update') throw new Error('Unknown channel continuation batch');
    const receipt=await this.readCandidateChannelReceipt(operationId),row=await this.row(id);
    const child=receipt?.stages?.[step];
    if(!receipt||receipt.operation.transitionId!==id||!child) throw new Error('Missing original channel child');
    if(child.result) return child.result;
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt',state=playChannelState(child.command);
    const sourceCapture=this.side(row)==='source'?[
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_insert(envelope_json,'$.sourceReceipt.dependencyReferences[#]',json(?)) WHERE transition_id=? AND operation_id=? AND NOT EXISTS(SELECT 1 FROM json_each(envelope_json,'$.sourceReceipt.dependencyReferences') r WHERE json_extract(r.value,'$.table')='music_channels' AND json_extract(r.value,'$.key')=json_array(?))").bind(JSON.stringify({table:'music_channels',key:JSON.stringify([child.command.id])}),id,operationId,child.command.id),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(operationId,id,operationId),
    ]:[];
    try {
      await this.commitOperation(id,operationId,generation,[
        this.db.prepare(`SELECT iif(json_extract(envelope_json,'$.${key}.channelApproval.${step}')=json(?),1,json('candidate_channel_child_identity_race')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify(child),id,operationId),
        ...statements,
        this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.${step}.result',json(${playChannelResultSql}),'$.${key}.channelApproval.${step}.resultState',printf('%s',${state.sql})) WHERE transition_id=? AND operation_id=?`).bind(child.command.id,...state.bindings,id,operationId),
        this.db.prepare(`SELECT iif(json_type(envelope_json,'$.${key}.channelApproval.${step}.result')='object' AND json_extract(envelope_json,'$.${key}.channelApproval.${step}.result.data.version')=?,1,json('candidate_channel_child_result_missing')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(child.command.action==='create'?0:child.command.input.expectedVersion+1,id,operationId),
        ...sourceCapture,
      ],[],undefined,undefined,undefined,undefined,control,false,{step,command:child.command,expectedState:child.expectedState});
    } catch(error) {
      const actual=await this.readCandidateChannelReceipt(operationId);
      if(actual?.stages?.[step]?.result) return actual.stages[step]!.result!;
      throw error;
    }
    return (await this.readCandidateChannelReceipt(operationId))!.stages![step]!.result!;
  }
  async readCandidateMetadataReceipt(operationId:string) {
    const row=await this.db.prepare("SELECT o.transition_id,o.envelope_json,o.source_seq FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.refresh'").bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string;source_seq:number|null}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt,operation=(await this.readOperation(row.transition_id,operationId))!;
    const command=receipt?.command??(row.source_seq!==null?{...parseCandidateMetadataMutation(operation.payload),actor:null}:null);
    if(!command||!parseCandidateMetadataMutation(command)||row.source_seq===null&&(!command.actor?.userId||command.actor.userId!==receipt.actorId)||row.source_seq!==null&&command.actor!==null) throw new Error('Missing original metadata refresh authority');
    return {operation,command:command as CandidateMetadataCommand,result:(receipt?.result??null) as OtwPlayIngestionReviewCandidateDto|null,failure:receipt?.failure as YouTubeVideoFailure|undefined};
  }
  async admitCandidateMetadata(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:CandidateMetadataCommand) {
    if(input.codec.id!=='otw-play.candidate.refresh'||!command.actor?.userId||JSON.stringify(parseCandidateMetadataMutation(input.payload))!==JSON.stringify(parseCandidateMetadataMutation(command))) throw new Error('Invalid original metadata refresh admission');
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,true),source=this.side(prepared.row)==='source',key=source?'sourceReceipt':'nativeReceipt';
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND external_video_id=? AND content_access='normal'),1,json('candidate_metadata_admission_race'))").bind(command.candidateId,command.expectedVersion,command.videoId),
      ...(source?[this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_membership WHERE transition_id=? AND row_table='music_ingestion_candidates' AND row_key=json_array(?) AND root_table=row_table AND root_key=row_key),1,json('candidate_metadata_source_scope'))").bind(input.transitionId,command.candidateId)]:[]),prepared.insert,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.${key}') IS NULL AND outcome_json IS NULL`).bind(JSON.stringify({actorId:command.actor.userId,command,result:null,...(source?{metadataStage:null,dependencyCapture:`video-dependencies:${input.operationId}`,dependencyReferences:[]}: {})}),input.transitionId,input.operationId),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.${key}.actorId')=?),1,json('candidate_metadata_admission_conflict'))`).bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
      ...await D1YouTubeVideoReadJournal.registration(this.db,prepared.operation),
    ]);
    return (await this.readCandidateMetadataReceipt(input.operationId))!;
  }
  async candidateMetadataStage(id:string,operationId:string,payloadHash:string):Promise<CandidateMetadataStage|null> {
    const row=await this.row(id),receipt=await this.readCandidateMetadataReceipt(operationId);
    if(this.side(row)!=='source'||!receipt||receipt.operation.transitionId!==id||receipt.operation.payloadHash!==payloadHash) throw new Error('Wrong original refresh stage authority');
    const raw=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.metadataStage') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(!raw) return null;const stage:CandidateMetadataStage=JSON.parse(raw);
    const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,stage.requestKey);
    if(stage.transitionId!==id||stage.operationId!==operationId||stage.payloadHash!==payloadHash||stage.generation!==row.generation-1||stage.requestHash!==read.requestHash||stage.responseHash!==read.responseHash||read.response?.status!=='observation'||stage.externalChannelId!==(read.response.observation.video?.channelId??null)||stage.capture!==`video-dependencies:${operationId}`) throw new Error('Invalid original refresh stage');
    return stage;
  }
  async sealCandidateMetadataStage(id:string,operationId:string,payloadHash:string,facts:CandidateMetadataFacts):Promise<CandidateMetadataStage> {
    const row=await this.row(id),receipt=await this.readCandidateMetadataReceipt(operationId),prior=await this.candidateMetadataStage(id,operationId,payloadHash);
    if(prior) return prior;
    if(!receipt||this.side(row)!=='source'||!['protected','copying','replaying','target_ingress_ready'].includes(row.phase)) throw new Error('Original refresh dependencies must precede source fence');
    const requestKey=`youtube:videos:0:${receipt.command.videoId}`,read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,requestKey);
    if(read.response?.status!=='observation'||!read.responseHash) throw new Error('Missing original refresh observation');
    const externalChannelId=read.response.observation.video?.channelId??null,matchedChannelId=externalChannelId===null?null:await this.db.prepare("SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?").bind(externalChannelId).first<string>('id');
    const capture=`video-dependencies:${operationId}`,stage:CandidateMetadataStage={transitionId:id,operationId,payloadHash,generation:row.generation-1,requestKey,requestHash:read.requestHash,responseHash:read.responseHash,externalChannelId,matchedChannelId,facts,capture};
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_media_sources WHERE provider='youtube' AND external_id=?)=? AND EXISTS(SELECT 1 FROM music_cover_proposals WHERE youtube_video_id=? AND segment_start_seconds=0 AND status='pending_review')=? AND (SELECT id FROM music_channels WHERE provider='youtube' AND external_channel_id=?) IS ? AND (SELECT json_object('verification_status',verification_status,'active',active,'channel_role',channel_role) FROM music_channels WHERE id=?) IS ?,1,json('candidate_metadata_lookup_race'))").bind(receipt.command.videoId,Number(facts.existingSource),receipt.command.videoId,Number(facts.existingProposal),externalChannelId,matchedChannelId,matchedChannelId,facts.channel?JSON.stringify(facts.channel):null),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id JOIN content_transition_chzzk_requests r ON r.transition_id=o.transition_id AND r.operation_id=o.operation_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready') AND r.request_key=? AND r.request_hash=? AND r.response_hash=?),1,json('candidate_metadata_fence_race'))").bind(id,operationId,payloadHash,requestKey,read.requestHash,read.responseHash),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.metadataStage',json(?),'$.sourceReceipt.dependencyReferences',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.sourceReceipt.metadataStage')='null'").bind(JSON.stringify(stage),JSON.stringify(matchedChannelId?[{table:'music_channels',key:JSON.stringify([matchedChannelId])}]:[]),id,operationId),
      this.db.prepare('INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)').bind(id,capture),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,t.id,?,t.generation-1,1,c.seq FROM content_transitions t JOIN content_transition_commits c ON c.transition_id=t.id AND c.operation_id=? WHERE t.id=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')").bind(capture,capture,id),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,'content_transition_operations',json_array(?) FROM content_transition_permits WHERE transition_id=? AND operation_id=?").bind(operationId,id,capture),
      ...captureStatements(this.db,id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql('content_transition_permits.transition_id')} WHERE transition_id=?`).bind(id),
      this.db.prepare('UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?').bind(id,capture),
      this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(id),
    ]);
    return (await this.candidateMetadataStage(id,operationId,payloadHash))!;
  }
  async readConversionCandidateVersion(candidateId:string) {
    return this.db.prepare("SELECT version FROM music_ingestion_candidates WHERE id=? AND content_access='normal'").bind(candidateId).first<number>('version');
  }
  private async candidateMetadataExecutionReceipt(operationId:string,approvalParent=false) {
    if(!approvalParent) return this.readCandidateMetadataReceipt(operationId);
    const parent=await this.readCandidateChannelReceipt(operationId),child=parent?.stages?.refresh;
    if(!parent||!child) return null;
    return {...parent,command:{...child.command,actor:parent.command.actor}};
  }
  private async candidateMetadataEventPredicate(id:string,operationId:string,approvalParent=false) {
    const row=await this.row(id),receipt=await this.candidateMetadataExecutionReceipt(operationId,approvalParent);
    if(!receipt||receipt.operation.transitionId!==id) throw new Error('Missing original metadata event identity');
    const command=receipt.command;
    if(this.side(row)==='target'&&receipt.operation.sourceSequence!==null) {
      if(command.actor!==null) throw new Error('Invalid transferred refresh actor');
      return {sql:`EXISTS(SELECT 1 FROM content_historical_records h JOIN content_historical_links l USING(source_site,source_table,source_key) WHERE h.source_site=? AND h.source_table='music_ingestion_events' AND h.source_key=? AND json_extract(h.record_json,'$.values.event_type')='candidate.metadata_refreshed' AND json_extract(h.record_json,'$.values.candidate_id')=? AND json_extract(h.record_json,'$.values.created_at')=? AND l.subject_table='music_ingestion_candidates' AND l.subject_key=json_array(?))`,bindings:[row.source_site,await historicalRecordId(row.source_site,'music_ingestion_events',JSON.stringify([command.eventId])),command.candidateId,command.now,command.candidateId]};
    }
    return {sql:"EXISTS(SELECT 1 FROM music_ingestion_events WHERE id=? AND candidate_id=? AND event_type='candidate.metadata_refreshed' AND created_at=?)",bindings:[command.eventId,command.candidateId,command.now]};
  }
  async candidateMetadataEventExists(id:string,operationId:string,approvalParent=false) {
    const predicate=await this.candidateMetadataEventPredicate(id,operationId,approvalParent);
    return Boolean(await this.db.prepare(`SELECT ${predicate.sql} value`).bind(...predicate.bindings).first<number>('value'));
  }
  async transferredCandidateMetadataEvent(id:string,operationId:string,detailJson:string,approvalParent=false) {
    const row=await this.row(id),receipt=await this.candidateMetadataExecutionReceipt(operationId,approvalParent);
    if(this.side(row)!=='target'||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence===null||receipt.command.actor!==null) throw new Error('Missing imported refresh event authority');
    const command=receipt.command,plan:TransitionPlan=JSON.parse(row.plan_json);
    const record=await projectCapturedRecord('music_ingestion_events',JSON.stringify([command.eventId]),{id:command.eventId,job_id:null,candidate_id:command.candidateId,event_type:'candidate.metadata_refreshed',detail_json:detailJson,created_at:command.now},{sourceSite:row.source_site,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))});
    if(!record||record.destination!=='historical') throw new Error('Missing approved refresh event projection');
    const statements=historicalStatements(this.db,record,[{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])}]);
    statements[0]=this.db.prepare('INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) SELECT ?,?,?,?,? WHERE changes()=1 ON CONFLICT(source_site,source_table,source_key) DO UPDATE SET record_json=excluded.record_json WHERE content_historical_records.protocol=excluded.protocol').bind(record.sourceSite,record.table,record.sourceRecordId,JSON.stringify(historicalMaterial(record)),record.version);
    return statements;
  }
  async commitCandidateMetadata(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],capture:{sql:string;bindings:(string|number|null)[]},control:YouTubeVideoCompletion,approvalParent=false) {
    const row=await this.row(id),receipt=await this.candidateMetadataExecutionReceipt(operationId,approvalParent);
    if(!receipt||receipt.operation.transitionId!==id) throw new Error('Missing original metadata result authority');
    const key=this.side(row)==='source'?'sourceReceipt':'nativeReceipt',predicate=await this.candidateMetadataEventPredicate(id,operationId,approvalParent);
    return this.commitOperation(id,operationId,generation,[...statements,
      this.db.prepare(`SELECT iif(${predicate.sql},1,json('candidate_metadata_state_conflict'))`).bind(...predicate.bindings),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${capture.sql})) WHERE transition_id=? AND operation_id=?`).bind(...capture.bindings,id,operationId),
      this.db.prepare(`SELECT iif(json_type(envelope_json,'$.${key}.result')='object',1,json('candidate_metadata_result_missing')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(id,operationId),
    ],[],undefined,undefined,undefined,undefined,control);
  }
  async recordCandidateMetadataFailure(id:string,operationId:string,control:YouTubeVideoCompletion,failure:YouTubeVideoFailure,approvalParent=false) {
    const row=await this.row(id),receipt=approvalParent?await this.readCandidateChannelReceipt(operationId):await this.readCandidateMetadataReceipt(operationId);
    const channelConstraint=approvalParent&&failure.kind==='repository'&&failure.code==='validation_failed'&&Boolean(failure.sqlError);
    if(!receipt||receipt.operation.transitionId!==id||!channelConstraint&&!['metadata','ingestion'].includes(failure.kind)||JSON.stringify(parseVideoCatalogFailure(failure))!==JSON.stringify(failure)) throw new Error('Missing original refresh failure authority');
    const operation=receipt.operation,journal=new D1YouTubeVideoReadJournal(this.db,this.site,this.resource),source=this.side(row)==='source',key=source?'sourceReceipt':'nativeReceipt';
    if(source||operation.sourceSequence===null) await journal.assertCompletion(id,operationId,operation.payloadHash,control);
    const outcome:OperationOutcome={outcome:['stale_message','stale_write'].includes(failure.code)?'conflicted':'failed',sideEffectReconciled:true,detail:approvalParent?'Original channel approval failed; previously committed channel children remain recorded':'Original candidate metadata refresh rejected without a business commit',youtubeVideo:control};
    await this.db.batch([
      ...(source||operation.sourceSequence===null?journal.completionGuard(id,operationId,control):[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.failure',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND attempt_json IS NULL AND json_extract(envelope_json,'$.${key}.result') IS NULL AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=? AND c.operation_id=?) AND EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=? AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN (${source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'"}))`).bind(JSON.stringify(failure),JSON.stringify(outcome),id,operationId,operation.payloadHash,id,operationId,id,this.site,this.resource,row.generation),
    ]);
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error('Refresh failure lost final-owner/result race');
  }
  async conversionCandidateBelongsToJob(jobId:string|null,candidateId:string) {
    return jobId===null||Boolean(await this.db.prepare('SELECT 1 FROM music_ingestion_candidate_origins WHERE job_id=? AND candidate_id=?').bind(jobId,candidateId).first());
  }
  async findConversionJobTransition(jobId:string) {
    const rows=await this.db.prepare("SELECT t.id FROM content_transitions t JOIN content_transition_membership m ON m.transition_id=t.id WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready') AND m.row_table='music_ingestion_jobs' AND m.row_key=json_array(?) GROUP BY t.id").bind(this.site,this.resource,jobId).all<{id:string}>();
    if(rows.results.length>1) throw new Error('Conflicting source conversion job dependencies');
    return rows.results[0]?this.readTransition(rows.results[0].id):null;
  }
  async conversionOutcomeSubject(command:ConversionOutcomeCommand) {
    if(!command.jobOnly) return {table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])};
    if(!command.jobId) throw new Error('Missing original conversion job');
    return {table:'music_ingestion_jobs',key:JSON.stringify([await historicalRecordId(this.site,'music_ingestion_jobs',JSON.stringify([command.jobId]))])};
  }
  async readConversionOutcomeReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.conversion-outcome.local','otw-play.conversion-outcome.mutate')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.actorId||receipt.actorId!==receipt.command?.actorUserId||!parseConversionOutcome(receipt.command)) throw new Error('Missing own conversion outcome actor');
    return {operation:(await this.readOperation(row.transition_id,operationId))!,command:receipt.command as ConversionOutcomeCommand,result:receipt.conversionResult as import('@contracts/otw-play').OtwPlayIngestionConversionResultDto|null};
  }
  async admitNativeConversionOutcome(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:ConversionOutcomeCommand) {
    if(!command.actorUserId||!Number.isSafeInteger(command.validatedVersion)||JSON.stringify(parseConversionOutcome(command))!==JSON.stringify(parseConversionOutcome(input.payload))) throw new Error('Invalid original conversion validation');
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,false,undefined,false,true);
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND content_access='normal'),1,json('conversion_validation_admission_race'))").bind(command.candidateId,command.validatedVersion!),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actorUserId,command,conversionResult:null}),input.transitionId,input.operationId),
    ]);
    return (await this.readConversionOutcomeReceipt(input.operationId))!;
  }
  async commitLocalConversionOutcome(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],command:ConversionOutcomeCommand,local?:Omit<AcceptedOperation,'payloadHash'|'expectedState'>) {
    const prepared=local?await this.prepareAdmission(local,true,command.actorUserId):undefined,receipt=local?null:await this.readConversionOutcomeReceipt(operationId);
    if(!parseConversionOutcome(command)||!local&&(!receipt||JSON.stringify(receipt.command)!==JSON.stringify(command))) throw new Error('Missing original conversion outcome batch');
    const key=local?'sourceReceipt':'nativeReceipt',eventSql="(SELECT event_type FROM music_ingestion_events WHERE id=?)",eventType=`candidate.convert.${command.outcome}`;
    return this.commitOperation(id,operationId,generation,[
      ...(command.jobOnly?[this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_jobs j JOIN content_transition_membership m ON m.row_table='music_ingestion_jobs' AND m.row_key=json_array(j.id) WHERE m.transition_id=? AND j.id=?) AND NOT EXISTS(SELECT 1 FROM music_ingestion_candidate_origins WHERE job_id=? AND candidate_id=?),1,json('conversion_job_scope_race'))").bind(id,command.jobId,command.jobId,command.candidateId)]:[]),
      ...(local?[this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actorUserId,command,conversionResult:null}),id,operationId)]:[]),
      ...statements,
      this.db.prepare(`SELECT iif(${eventSql} IN (?,'candidate.convert.stale'),1,json('conversion_outcome_event_missing'))`).bind(command.eventId,eventType),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.conversionResult',json_object('candidateId',?,'outcome',CASE WHEN ${eventSql}=? THEN ? ELSE 'stale' END,'performanceId',?,'errorCode',CASE WHEN ${eventSql}=? THEN ? ELSE 'stale_write' END)) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(command.candidateId,command.eventId,eventType,command.outcome,command.performanceId,command.eventId,eventType,command.errorCode,id,operationId),
      this.db.prepare(`UPDATE content_transition_operations SET outcome_json=json_object('outcome',CASE json_extract(envelope_json,'$.${key}.conversionResult.outcome') WHEN 'duplicate' THEN 'committed' WHEN 'stale' THEN 'conflicted' ELSE 'failed' END,'sideEffectReconciled',json('true'),'detail','Original no-GET conversion outcome recorded') WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(id,operationId),
    ],[],prepared);
  }
  async readCandidateReviewReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.candidate.mutate','otw-play.candidate.local')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command||!parseCandidateReviewMutation(receipt.command)||!receipt.actorId||receipt.actorId!==receipt.command.actorUserId) throw new Error('Missing original candidate review actor');
    return {command:receipt.command as CandidateReviewCommand,result:receipt.result as OtwPlayIngestionReviewCandidateDto|null,failure:receipt.failure as {code?:string;message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeCandidateReview(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:CandidateReviewCommand,validatedVersion:number) {
    if(JSON.stringify(parseCandidateReviewMutation(input.payload))!==JSON.stringify(parseCandidateReviewMutation(command))||!command.actorUserId) throw new Error('Candidate review identity conflict');
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,false,undefined,false,true);
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND content_access='normal'),1,json('candidate_review_state_conflict'))").bind(command.candidateId,validatedVersion),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actorUserId,command,result:null}),input.transitionId,input.operationId),
    ]);
    return (await this.readCandidateReviewReceipt(input.operationId))!;
  }
  async recordCandidateReviewFailure(id:string,operationId:string,failure:{code:string;message:string}) {
    if(!['not_found','stale_write','stale_message','validation_failed'].includes(failure.code)) throw new Error('Not a definitive original candidate validation failure');
    const row=await this.row(id),receipt=await this.readCandidateReviewReceipt(operationId);
    if(this.side(row)!=='target'||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence!==null||receipt.operation.codec.id!=='otw-play.candidate.mutate'||receipt.operation.attempt) throw new Error('Missing native candidate failure authority');
    await this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.failure',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND attempt_json IS NULL AND json_type(envelope_json,'$.nativeReceipt.result')='null'
      AND NOT EXISTS(SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify(failure),JSON.stringify({outcome:failure.code.startsWith('stale_')?'conflicted':'failed',sideEffectReconciled:true,detail:'Original candidate review rejected without business'}),id,operationId,receipt.operation.payloadHash,id,operationId,id,this.site,this.resource,row.generation).run();
  }
  async commitCandidateReview(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],capture:{sql:string;bindings:(string|number|null)[];eventRequired:boolean;catalog?:{songId:string|null;entityIds:string[]}},local?:{input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>;command:CandidateReviewCommand}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actorUserId):undefined,receipt=local?null:await this.readCandidateReviewReceipt(operationId),command=local?.command??receipt?.command;
    if(!command||receipt&&(receipt.operation.codec.id!=='otw-play.candidate.mutate'||JSON.stringify(parseCandidateReviewMutation(receipt.operation.payload))!==JSON.stringify(parseCandidateReviewMutation(command)))) throw new Error('Missing original candidate review command');
    const key=local?'sourceReceipt':'nativeReceipt',bindings=[...capture.bindings];
    let result=capture.sql;
    if(capture.catalog) {
      result=`json_set(${result},'$.catalogChanges',json_object('revision',(SELECT revision FROM music_catalog_meta WHERE id=1),'songs',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_extract(${playSongResultSql.replace('WHERE song.id=?','WHERE song.id=requested.value')},'$.data') value FROM json_each(?) requested))),'entities',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_extract(${playEntityResultSql.replace('WHERE id=?','WHERE id=requested.value')},'$.data') value FROM json_each(?) requested)))))`;
      bindings.push(JSON.stringify(capture.catalog.songId?[capture.catalog.songId]:[]),JSON.stringify(capture.catalog.entityIds));
    }
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actorUserId,command,result:null}),id,operationId)]:[]),
      ...statements,
      ...(capture.eventRequired?[this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ingestion_events WHERE id=? AND candidate_id=?),1,json('candidate_review_state_conflict'))").bind(command.eventId,command.candidateId)]:[]),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${result})) WHERE transition_id=? AND operation_id=?`).bind(...bindings,id,operationId),
      this.db.prepare(`SELECT iif(json_type(envelope_json,'$.${key}.result')='object',1,json('candidate_review_result_missing')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?`).bind(id,operationId),
    ],[],prepared);
  }
  async readReviewDeletionReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.review.delete','otw-play.review.delete_local')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command||!parseReviewDeletion(receipt.command)||!receipt.actorId||receipt.actorId!==receipt.command.actorUserId) throw new Error('Missing original review deletion actor');
    return {command:receipt.command as ReviewDeletionCommand,result:receipt.result as {deleted:true}|null,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeReviewDeletion(input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>,command:ReviewDeletionCommand) {
    if(JSON.stringify(parseReviewDeletion(input.payload))!==JSON.stringify(parseReviewDeletion(command))||!command.actorUserId) throw new Error('Review deletion identity conflict');
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,false,false,false,undefined,true),predicate=reviewDeletionPredicate(command);
    await this.db.batch([this.db.prepare(`SELECT iif(${predicate.sql},1,json('review_deletion_state_conflict'))`).bind(...predicate.bindings),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actorUserId,command,result:null}),input.transitionId,input.operationId)]);
    return (await this.readReviewDeletionReceipt(input.operationId))!;
  }
  async reconcileNativeReviewDeletion(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readReviewDeletionReceipt(operationId);
    if(this.side(row)!=='target'||!['target_owned','complete'].includes(row.phase)||!receipt||receipt.operation.transitionId!==id||receipt.operation.sourceSequence!==null||receipt.operation.codec.id!=='otw-play.review.delete'||receipt.operation.attempt) throw new Error('Missing native review deletion authority');
    if(JSON.stringify(parseReviewDeletion(receipt.operation.payload))!==JSON.stringify(parseReviewDeletion(receipt.command))) throw new Error('Original review deletion changed');
    const predicate=reviewDeletionPredicate(receipt.command);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND NOT (${predicate.sql}) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`).bind(JSON.stringify({outcome:'conflicted',sideEffectReconciled:true,detail:'Original review deletion version/status no longer matches'}),id,operationId,receipt.operation.payloadHash,...predicate.bindings,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitReviewDeletion(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,'payloadHash'|'expectedState'>;command:ReviewDeletionCommand}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actorUserId):undefined,receipt=local?null:await this.readReviewDeletionReceipt(operationId),command=local?.command??receipt?.command;
    if(!command||!command.actorUserId||receipt&&(receipt.operation.codec.id!=='otw-play.review.delete'||JSON.stringify(parseReviewDeletion(receipt.operation.payload))!==JSON.stringify(parseReviewDeletion(command)))) throw new Error('Missing original review deletion identity');
    const key=local?'sourceReceipt':'nativeReceipt',predicate=reviewDeletionPredicate(command);
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${predicate.sql},1,json('review_deletion_state_conflict'))`).bind(...predicate.bindings),this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actorUserId,command,result:null}),id,operationId)]:[]),
      ...statements,
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_catalog_events WHERE id=? AND event_type='review_item.deleted'),1,json('review_deletion_state_conflict'))").bind(command.eventId),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json('{"deleted":true}')) WHERE transition_id=? AND operation_id=?`).bind(id,operationId),
    ],[],prepared);
  }
  async readProposalRejectionReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.proposal.reject','otw-play.proposal.reject_local')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !parseProposalRejection(receipt.command) || !receipt.actorId || receipt.actorId!==receipt.command.actor?.userId) throw new Error("Missing original proposal rejection actor/command");
    const result=receipt.result as OtwPlayAdminCommandResponse<OtwPlayAdminProposalDto & {broadcastJson?:string|null}>|null;
    if(result) {result.data.broadcast=result.data.broadcastJson?readBroadcastMetadata(result.data.broadcastJson):null;delete result.data.broadcastJson;}
    return {command:receipt.command as ProposalRejectionCommand,result,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeProposalRejection(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:ProposalRejectionCommand) {
    if(JSON.stringify(parseProposalRejection(input.payload))!==JSON.stringify(parseProposalRejection(command)) || !command.actor.userId) throw new Error("Proposal rejection identity conflict");
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,false,false,true);
    await this.db.batch([
      this.db.prepare(`SELECT iif(${proposalRejectionPredicate},1,json('proposal_rejection_state_conflict'))`).bind(command.id,command.input.expectedVersion),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('proposal_rejection_identity_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);
    return (await this.readProposalRejectionReceipt(input.operationId))!;
  }
  async reconcileNativeProposalRejection(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readProposalRejectionReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.sourceSequence!==null || receipt.operation.codec.id!=="otw-play.proposal.reject" || receipt.operation.attempt) throw new Error("Missing native proposal rejection authority");
    if(JSON.stringify(parseProposalRejection(receipt.operation.payload))!==JSON.stringify(parseProposalRejection(receipt.command))) throw new Error("Original proposal rejection identity conflict");
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND NOT (${proposalRejectionPredicate}) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original proposal status/version no longer matches"}),id,operationId,receipt.operation.payloadHash,receipt.command.id,receipt.command.input.expectedVersion,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitProposalRejection(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:ProposalRejectionCommand}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actor.userId):undefined;
    const receipt=local?null:await this.readProposalRejectionReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.actor.userId || receipt && (receipt.operation.codec.id!=="otw-play.proposal.reject" || JSON.stringify(parseProposalRejection(receipt.operation.payload))!==JSON.stringify(parseProposalRejection(command)))) throw new Error("Missing original proposal rejection identity");
    const key=local?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${proposalRejectionPredicate},1,json('proposal_rejection_state_conflict'))`).bind(command.id,command.input.expectedVersion),this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),id,operationId)]:[]),
      ...statements,this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${proposalRejectionResultSql})) WHERE transition_id=? AND operation_id=?`).bind(command.id,id,operationId),
    ],[],prepared);
  }
  async prepareCatalogDelete(command:CatalogDeleteCommand) {
    const table=catalogDeleteTable[command.kind];
    const affected=command.kind==="entity"?"0":command.kind==="channel"?`EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_channels' AND m.row_key=json_array(?) AND m.root_table=m.row_table AND m.root_key=m.row_key)`:`EXISTS(SELECT 1 FROM music_performances p WHERE p.${command.kind==="song"?"song_id":"id"}=? AND (
      EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_performances' AND m.row_key=json_array(p.id)) OR
      EXISTS(SELECT 1 FROM music_performance_participants r JOIN music_entities e ON e.id=r.entity_id JOIN json_each(t.plan_json,'$.members') member ON json_extract(member.value,'$.uid')=e.member_uid WHERE r.performance_id=p.id) OR
      EXISTS(SELECT 1 FROM music_cover_proposals proposal JOIN content_transition_membership m ON m.transition_id=t.id AND m.row_table='music_cover_proposals' AND m.row_key=json_array(proposal.id) WHERE proposal.status='approved' AND proposal.approved_performance_id=p.id)
    ))`;
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      (t.local_site=t.target_site AND EXISTS(SELECT 1 FROM ${table} WHERE id=?)) OR
      (t.local_site=t.source_site AND t.phase<>'prepared' AND (${affected} OR ${command.kind==="song"?"EXISTS(SELECT 1 FROM music_cover_proposals p JOIN content_transition_membership m ON m.transition_id=t.id AND m.row_table='music_cover_proposals' AND m.row_key=json_array(p.id) WHERE p.suggested_song_id=?)":"0"} OR
        (t.phase NOT IN ('source_fenced','target_owned','complete') AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table=? AND m.row_key=json_array(?)))
      )))`).bind(this.site,this.resource,command.id,...(command.kind==="entity"?[]:[command.id]),...(command.kind==="song"?[command.id]:[]),table,command.id).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Catalog deletion has conflicting transition owners");
    const state=playDeleteState(command);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async readCatalogDeleteReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.delete.local','otw-play.delete.mutate')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !receipt.actorId || receipt.actorId!==receipt.command.actor?.userId || !parseCatalogDeleteCommand(receipt.command)) throw new Error("Missing original catalog deletion actor/command");
    return {command:receipt.command as CatalogDeleteCommand & {actor:{userId:string;displayName:string|null;ipAddress:string|null};now:number;eventId:string},result:receipt.result as OtwPlayAdminCommandResponse<{id:string}>|null,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeCatalogDelete(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readCatalogDeleteReceipt"]>>>["command"]) {
    if(JSON.stringify(parseCatalogDeleteCommand(input.payload))!==JSON.stringify(parseCatalogDeleteCommand(command)) || !command.actor.userId) throw new Error("Native deletion command/actor mismatch");
    const state=playDeleteState(command),table=catalogDeleteTable[command.kind];
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,false,true);
    try {await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?),1,json('catalog_delete_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),command.id,command.expectedVersion),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('catalog_delete_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);} catch(error) {
      if(!await this.db.prepare(`SELECT ${state.sql}=? AND EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?) matches`).bind(...state.bindings,String(input.payload.expectedState),command.id,command.expectedVersion).first<number>("matches")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,input.operationId);
      throw error;
    }
    return (await this.readCatalogDeleteReceipt(input.operationId))!;
  }
  async reconcileNativeCatalogDelete(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readCatalogDeleteReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.codec.id!=="otw-play.delete.mutate" || receipt.operation.sourceSequence!==null || receipt.operation.attempt) throw new Error("Missing native deletion authority");
    if(JSON.stringify(parseCatalogDeleteCommand(receipt.operation.payload))!==JSON.stringify(parseCatalogDeleteCommand(receipt.command)) || typeof receipt.operation.payload.expectedState!=="string") throw new Error("Original deletion identity conflict");
    const state=playDeleteState(receipt.command);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
      AND NOT (${state.sql}=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original deletion state no longer matches"}),id,operationId,receipt.operation.payloadHash,...state.bindings,receipt.operation.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitCatalogDelete(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readCatalogDeleteReceipt"]>>>["command"];expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actor.userId):undefined;
    const receipt=local?null:await this.readCatalogDeleteReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.actor.userId || receipt && (receipt.operation.codec.id!=="otw-play.delete.mutate" || JSON.stringify(parseCatalogDeleteCommand(receipt.operation.payload))!==JSON.stringify(parseCatalogDeleteCommand(command)))) throw new Error("Missing original deletion command/identity");
    const state=playDeleteState(command),key=local?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${state.sql}=?,1,json('catalog_delete_original_state_conflict'))`).bind(...state.bindings,local.expectedState),
        this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),id,operationId)]:[]),
      ...statements,this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json_object('data',json_object('id',?),'catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1))) WHERE transition_id=? AND operation_id=?`).bind(command.id,id,operationId),
    ],[],prepared);
  }
  async readPublicationReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.publication.local','otw-play.publication.mutate')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !receipt.actorId || receipt.actorId!==receipt.command.actor?.userId || !parsePublicationCommand(receipt.command)) throw new Error("Missing actual publication actor/command receipt");
    const result=receipt.result as (OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto & {broadcastJson?:string|null}>)|null;
    if(result) {if(result.data.releaseType==="broadcast") result.data.broadcast=readBroadcastMetadata(result.data.broadcastJson);delete result.data.broadcastJson;}
    return {command:receipt.command as PublicationCommand & {actor:{userId:string;displayName:string|null;ipAddress:string|null};now:number;eventId:string},result,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativePublication(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readPublicationReceipt"]>>>["command"]) {
    const parsed=parsePublicationCommand(input.payload);
    if(!parsed || JSON.stringify(parsed)!==JSON.stringify(parsePublicationCommand(command)) || !command.actor.userId) throw new Error("Native publication command/actor mismatch");
    const state=playPublicationState(command.id),version="EXISTS(SELECT 1 FROM music_performances WHERE id=? AND version=? AND publication_status=? AND content_access='normal')";
    const versionBinds=[command.id,command.expectedVersion,command.target==="published"?"draft":"published"];
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,false,true);
    try {await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND ${version},1,json('publication_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),...versionBinds),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('publication_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);} catch(error) {
      if(!await this.db.prepare(`SELECT ${state.sql}=? AND ${version} matches`).bind(...state.bindings,String(input.payload.expectedState),...versionBinds).first<number>("matches")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,input.operationId);
      throw error;
    }
    return (await this.readPublicationReceipt(input.operationId))!;
  }
  async reconcileNativePublicationPrecondition(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readPublicationReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.codec.id!=="otw-play.publication.mutate" || receipt.operation.sourceSequence!==null || receipt.operation.attempt) throw new Error("Missing native publication authority");
    if(JSON.stringify(parsePublicationCommand(receipt.operation.payload))!==JSON.stringify(parsePublicationCommand(receipt.command)) || typeof receipt.operation.payload.expectedState!=="string") throw new Error("Original publication command identity conflict");
    const state=playPublicationState(receipt.command.id);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
      AND NOT (${state.sql}=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original publication state no longer matches"}),id,operationId,receipt.operation.payloadHash,...state.bindings,receipt.operation.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitPublication(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readPublicationReceipt"]>>>["command"];expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actor.userId):undefined;
    const receipt=local?null:await this.readPublicationReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.actor.userId) throw new Error("Missing actual publication command");
    if(receipt && (receipt.operation.codec.id!=="otw-play.publication.mutate" || JSON.stringify(parsePublicationCommand(receipt.operation.payload))!==JSON.stringify(parsePublicationCommand(command)))) throw new Error("Original publication command identity conflict");
    const state=playPublicationState(command.id),key=local?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${state.sql}=?,1,json('publication_original_state_conflict'))`).bind(...state.bindings,local.expectedState),
        this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),id,operationId)]:[]),
      ...statements,this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${playPublicationResultSql})) WHERE transition_id=? AND operation_id=?`).bind(command.id,id,operationId),
    ],[],prepared);
  }
  async prepareEntityMutation(command:EntityMutation) {
    const owners=await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND
      (t.local_site=t.target_site OR (t.phase NOT IN ('prepared','source_fenced','target_owned','complete') AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_entities' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') m WHERE json_extract(m.value,'$.uid')=?)
      )))`).bind(this.site,this.resource,command.id,command.input.memberUid??null).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Entity has conflicting transition owners");
    const state=playEntityState(command);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async readEntityReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.entity.local','otw-play.entity.mutate')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !receipt.actorId || receipt.actorId!==receipt.command.actor?.userId || !parseEntityMutation(receipt.command)) throw new Error("Missing actual entity actor/command receipt");
    return {command:receipt.command as EntityMutation & {actor:{userId:string;displayName:string|null;ipAddress:string|null};now:number;eventId:string},result:receipt.result as OtwPlayAdminCommandResponse<OtwPlayAdminEntityDto>|null,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeEntity(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readEntityReceipt"]>>>["command"]) {
    const parsed=parseEntityMutation(input.payload),original=parseEntityMutation(command);
    if(!parsed || !original || JSON.stringify(parsed)!==JSON.stringify(original) || !command.actor.userId) throw new Error("Native entity command/actor mismatch");
    const state=playEntityState(command),version=command.action==="create"?"NOT EXISTS(SELECT 1 FROM music_entities WHERE id=?)":"EXISTS(SELECT 1 FROM music_entities WHERE id=? AND version=?)";
    const versionBinds=command.action==="create"?[command.id]:[command.id,command.input.expectedVersion];
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,false,true);
    try {await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND ${version},1,json('entity_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),...versionBinds),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('entity_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);} catch(error) {
      if(!await this.db.prepare(`SELECT ${state.sql}=? AND ${version} matches`).bind(...state.bindings,String(input.payload.expectedState),...versionBinds).first<number>("matches")) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,input.operationId);
      throw error;
    }
    return (await this.readEntityReceipt(input.operationId))!;
  }
  async reconcileNativeEntityPrecondition(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readEntityReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.codec.id!=="otw-play.entity.mutate" || receipt.operation.sourceSequence!==null || receipt.operation.attempt) throw new Error("Missing native entity authority");
    const parsed=parseEntityMutation(receipt.operation.payload);
    if(!parsed || JSON.stringify(parsed)!==JSON.stringify(parseEntityMutation(receipt.command)) || typeof receipt.operation.payload.expectedState!=="string") throw new Error("Original entity command identity conflict");
    const state=playEntityState(parsed);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
      AND NOT (${state.sql}=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original entity state no longer matches"}),id,operationId,receipt.operation.payloadHash,...state.bindings,receipt.operation.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitEntity(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readEntityReceipt"]>>>["command"];expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actor.userId):undefined;
    const receipt=local?null:await this.readEntityReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.actor.userId) throw new Error("Missing actual entity command");
    if(receipt && (receipt.operation.codec.id!=="otw-play.entity.mutate" || JSON.stringify(parseEntityMutation(receipt.operation.payload))!==JSON.stringify(parseEntityMutation(command)))) throw new Error("Original entity command identity conflict");
    const state=playEntityState(command),key=local?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${state.sql}=?,1,json('entity_original_state_conflict'))`).bind(...state.bindings,local.expectedState),
        this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),id,operationId)]:[]),
      ...statements,this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${playEntityResultSql})) WHERE transition_id=? AND operation_id=?`).bind(command.id,id,operationId),
    ],[],prepared);
  }
  async readSongReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.song.local_update','otw-play.song.mutate')`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const value=JSON.parse(row.envelope_json),receipt=value.nativeReceipt??value.sourceReceipt;
    if(!receipt?.command || !receipt.actorId || receipt.actorId!==receipt.command.actor?.userId) throw new Error("Missing actual song actor/command receipt");
    return {command:receipt.command as {input:OtwPlayAdminUpdateSongRequest;actor:{userId:string;displayName:string|null;ipAddress:string|null};now:number;ids:{songEventId:string;entityIds:Record<string,string>;entityEventIds:Record<string,string>}},result:receipt.result as OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>|null,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async prepareSongCreation(command:AdminCreateSongCommand) {
    // A new standalone song is a generic catalog dictionary, not an owned
    // selected-content root. Only a target's own ingress needs an early receipt.
    const owners=await this.db.prepare("SELECT id FROM content_transitions WHERE aborted_at IS NULL AND local_site=? AND local_resource=? AND local_site=target_site").bind(this.site,this.resource).all<{id:string}>();
    if(owners.results.length>1) throw new Error("Song creation has conflicting target owners");
    const state=playSongCreateState(command.ids.songId,command.input);
    return {transition:owners.results[0]?await this.readTransition(owners.results[0].id):null,expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async readSongCreationReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.song.create'`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const receipt=JSON.parse(row.envelope_json).nativeReceipt;
    if(!receipt?.command?.actor?.userId || receipt.actorId!==receipt.command.actor.userId || !parseCreateSong(receipt.command.input).ok) throw new Error("Missing original song creation receipt");
    return {command:receipt.command as AdminCreateSongCommand,result:receipt.result as OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>|null,failure:receipt.failure as {message:string}|undefined,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitSongCreation(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:AdminCreateSongCommand) {
    const parsed=parseCreateSong(input.payload.input);
    if(!parsed.ok || JSON.stringify(parsed.value)!==JSON.stringify(command.input) || input.payload.id!==command.ids.songId || !command.actor.userId) throw new Error("Native song creation command mismatch");
    const state=playSongCreateState(command.ids.songId,command.input),prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,true);
    await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND NOT EXISTS(SELECT 1 FROM music_songs WHERE id=?),1,json('song_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),command.ids.songId),prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('song_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);
    return (await this.readSongCreationReceipt(input.operationId))!;
  }
  async reconcileSongCreation(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readSongCreationReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.sourceSequence!==null || receipt.operation.attempt) throw new Error("Missing native song creation authority");
    const parsed=parseCreateSong(receipt.operation.payload.input);
    if(!parsed.ok || JSON.stringify(parsed.value)!==JSON.stringify(receipt.command.input) || receipt.operation.payload.id!==receipt.command.ids.songId || typeof receipt.operation.payload.expectedState!=="string") throw new Error("Original song creation identity conflict");
    const state=playSongCreateState(receipt.command.ids.songId,parsed.value);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
      AND NOT (${state.sql}=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original song creation state no longer matches"}),id,operationId,receipt.operation.payloadHash,...state.bindings,receipt.operation.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitSongCreation(id:string,operationId:string,generation:number,statements:D1PreparedStatement[]) {
    const receipt=await this.readSongCreationReceipt(operationId);
    if(!receipt || receipt.operation.transitionId!==id || receipt.operation.payload.id!==receipt.command.ids.songId || JSON.stringify(receipt.operation.payload.input)!==JSON.stringify(receipt.command.input)) throw new Error("Missing original song creation command");
    return this.commitOperation(id,operationId,generation,[...statements,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.result',json(${playSongResultSql})) WHERE transition_id=? AND operation_id=?`).bind(receipt.command.ids.songId,id,operationId),
    ],[]);
  }
  async admitNativeSong(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readSongReceipt"]>>>["command"]) {
    const parsed=parseUpdateSong(input.payload);
    if(!parsed.ok || JSON.stringify(parsed.value)!==JSON.stringify(command.input) || !command.actor.userId) throw new Error("Native song command/actor mismatch");
    const state=playSongState(command.input);
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,false,true);
    try {await this.db.batch([
      this.db.prepare(`SELECT iif(${state.sql}=? AND EXISTS(SELECT 1 FROM music_songs WHERE id=? AND version=?),1,json('song_original_state_conflict'))`).bind(...state.bindings,String(input.payload.expectedState),command.input.id,command.input.expectedVersion),
      prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL AND outcome_json IS NULL").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.command.actor.userId')=?),1,json('song_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,command.actor.userId),
    ]);} catch(error) {
      const matches=await this.db.prepare(`SELECT ${state.sql}=? AND EXISTS(SELECT 1 FROM music_songs WHERE id=? AND version=?) matches`).bind(...state.bindings,String(input.payload.expectedState),command.input.id,command.input.expectedVersion).first<number>("matches");
      if(!matches) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,input.operationId);
      throw error;
    }
    return (await this.readSongReceipt(input.operationId))!;
  }
  async reconcileNativeSongPrecondition(id:string,operationId:string) {
    const row=await this.row(id),receipt=await this.readSongReceipt(operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || !receipt || receipt.operation.transitionId!==id || receipt.operation.codec.id!=="otw-play.song.mutate" || receipt.operation.sourceSequence!==null || receipt.operation.attempt) throw new Error("Missing native song authority");
    const parsed=parseUpdateSong(receipt.operation.payload);
    if(!parsed.ok || JSON.stringify(parsed.value)!==JSON.stringify(receipt.command.input) || typeof receipt.operation.payload.expectedState!=="string") throw new Error("Original song command identity conflict");
    const state=playSongState(parsed.value);
    await this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
      AND NOT (${state.sql}=?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete'))`)
      .bind(JSON.stringify({outcome:"conflicted",sideEffectReconciled:true,detail:"Original song state no longer matches"}),id,operationId,receipt.operation.payloadHash,...state.bindings,receipt.operation.payload.expectedState,id,this.site,this.resource).run();
    return !(await this.exportOperation(id,operationId)).outcome;
  }
  async commitSong(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:NonNullable<Awaited<ReturnType<D1TransitionRepository["readSongReceipt"]>>>["command"];expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.command.actor.userId):undefined;
    const receipt=local?null:await this.readSongReceipt(operationId),command=local?.command??receipt?.command;
    if(!command || !command.actor.userId) throw new Error("Missing actual song command");
    if(receipt) {
      const parsed=parseUpdateSong(receipt.operation.payload);
      if(!parsed.ok || receipt.operation.codec.id!=="otw-play.song.mutate" || JSON.stringify(parsed.value)!==JSON.stringify(command.input)) throw new Error("Original song command identity conflict");
    }
    const state=playSongState(command.input),key=local?"sourceReceipt":"nativeReceipt";
    return this.commitOperation(id,operationId,generation,[
      ...(local?[this.db.prepare(`SELECT iif(${state.sql}=?,1,json('song_original_state_conflict'))`).bind(...state.bindings,local.expectedState),
        this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt',json(?)) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify({actorId:command.actor.userId,command,result:null}),id,operationId)]:[]),
      ...statements,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json(${playSongResultSql})) WHERE transition_id=? AND operation_id=?`).bind(command.input.id,id,operationId),
    ],[],prepared);
  }
  async findScheduleTransition(id:number|null,memberUid:number|null) {
    const rows=await this.db.prepare(`SELECT t.id FROM content_transitions t
      WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (t.local_site=t.target_site OR t.phase<>'prepared') AND (
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') member WHERE json_extract(member.value,CASE WHEN t.local_site=t.source_site THEN '$.uid' ELSE '$.targetUid' END)=?) OR
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='schedules' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM schedules s JOIN json_each(t.plan_json,'$.members') member ON s.member_uid=json_extract(member.value,CASE WHEN t.local_site=t.source_site THEN '$.uid' ELSE '$.targetUid' END) WHERE s.id=?)
      )`).bind(this.site,this.resource,memberUid,id,id).all<{id:string}>();
    if(rows.results.length>1) throw new Error("Schedule has conflicting transition owners");
    return rows.results[0]?this.readTransition(rows.results[0].id):null;
  }
  async findFileTransition(logicalKey:string) {
    const rows=await this.db.prepare(`SELECT DISTINCT t.id FROM content_transitions t
      WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND t.phase<>'prepared' AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='asset_file_references' AND m.row_key=json_array(?)) OR
        EXISTS(SELECT 1 FROM members member JOIN json_each(t.plan_json,'$.members') selected
          ON member.uid=json_extract(selected.value,CASE WHEN t.local_site=t.source_site THEN '$.uid' ELSE '$.targetUid' END)
          AND member.code=json_extract(selected.value,'$.code')
          WHERE ? LIKE 'members/'||member.code||'/backgrounds/%' OR ?='profile/'||member.code||'.webp' OR ?='profile/signatures/'||member.code||'.png') OR
        EXISTS(SELECT 1 FROM content_transition_file_paths f JOIN content_transition_membership m ON m.transition_id=t.id AND m.row_table=f.row_table AND m.row_key=f.row_key
          WHERE f.transition_id=t.id AND f.path IN ('/r2-assets/'||?,'/'||?) AND ${currentFileIndexSql("f")})
      )`).bind(this.site,this.resource,logicalKey,logicalKey,logicalKey,logicalKey,logicalKey,logicalKey).all<{id:string}>();
    if(rows.results.length>1) throw new Error("File has conflicting transition owners");
    return rows.results[0]?this.readTransition(rows.results[0].id):null;
  }
  async prepareNoticeMutation(command: NoticeCommand) {
    if (command.action !== "create") {
      const chosen = await this.db.prepare(`SELECT content_access,${contentRowMovedSql("notices", "n")} moved FROM notices n WHERE id=?`).bind(command.id).first<{content_access:string;moved:number}>();
      if (chosen && (chosen.content_access !== "normal" || chosen.moved)) throw new TransitionWriteError("CONTENT_MOVED", "luvdia");
    }
    const {state,bindings}=noticeMutationState(command);
    const expectedRows=(await this.db.prepare(`SELECT ${state} state`).bind(...bindings).first<string>("state"))!;
    const ids=(JSON.parse(expectedRows) as Array<{id:number}>).map(row=>row.id);
    const uids=command.action==="create" || command.action==="update"?command.input.relatedMemberUids:[];
    const rows=(await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=?
      AND (t.local_site=t.target_site OR t.phase<>'prepared') AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='notices' AND m.row_key IN (SELECT json_array(value) FROM json_each(?))) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.classifications') c WHERE json_extract(c.value,'$.table')='notices' AND json_extract(c.value,'$.disposition')='include' AND json_extract(c.value,'$.key') IN (SELECT json_array(value) FROM json_each(?))) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') m WHERE json_extract(m.value,CASE WHEN t.local_site=t.source_site THEN '$.uid' ELSE '$.targetUid' END) IN (
          SELECT value FROM json_each(?) UNION SELECT member.value FROM notices n,json_each(n.related_member_uids) member WHERE n.id IN (SELECT value FROM json_each(?)) UNION SELECT publisher_member_uid FROM notices WHERE id IN (SELECT value FROM json_each(?))))
      )`).bind(this.site,this.resource,JSON.stringify(ids),JSON.stringify(ids),JSON.stringify(uids),JSON.stringify(ids),JSON.stringify(ids)).all<{id:string}>()).results;
    if(rows.length>1) throw new Error("Notice mutation crosses conflicting transition owners");
    const transition=rows[0]?await this.readTransition(rows[0].id):null;
    const selectedIds=transition?(await this.db.prepare(`SELECT DISTINCT n.id FROM notices n JOIN content_transition_membership m ON m.row_table='notices' AND m.row_key=json_array(n.id) WHERE m.transition_id=? AND n.id IN (SELECT value FROM json_each(?)) ORDER BY n.id`).bind(transition.id,JSON.stringify(ids)).all<{id:number}>()).results.map(row=>row.id):[];
    return {transition,expectedRows,selectedIds};
  }
  async prepareDDayMutation(command:DDayCommand) {
    if(command.action!=="create") {
      const row=await this.db.prepare(`SELECT content_access,${contentRowMovedSql("ddays","d")} moved FROM ddays d WHERE id=?`).bind(command.id).first<{content_access:string;moved:number}>();
      if(row && (row.content_access!=="normal" || row.moved)) throw new TransitionWriteError("CONTENT_MOVED","luvdia");
    }
    const ids=(await this.db.prepare(`SELECT t.id FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
      t.local_site=t.target_site OR t.phase<>'prepared' AND (
        EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='ddays' AND m.row_key=?) OR
        EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.classifications') c WHERE json_extract(c.value,'$.table')='ddays' AND json_extract(c.value,'$.key')=? AND json_extract(c.value,'$.disposition')='include')))`)
      .bind(this.site,this.resource,JSON.stringify([command.action==="create"?null:command.id]),JSON.stringify([command.action==="create"?null:command.id])).all<{id:string}>()).results;
    if(ids.length>1) throw new Error("D-day has conflicting transition owners");
    const state=ddayMutationState(command);
    return {transition:ids[0]?await this.readTransition(ids[0].id):null,expectedRows:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async preparePendingMutation(command:PendingCommand,item:Record<string,unknown>) {
    const memberUid=Number(item.member_uid),date=String(item.date),holiday=item.candidate_kind==="holiday_suggestion";
    const table=command.action==="reopen_rejection"?"schedule_candidate_rejections":"pending_schedules";
    const chosen=await this.db.prepare(`SELECT content_access,${contentRowMovedSql(table,"p")} moved FROM ${table} p WHERE id=?`).bind(command.id).first<{content_access:string;moved:number}>();
    if(chosen && (chosen.content_access!=="normal" || chosen.moved)) throw new TransitionWriteError("CONTENT_MOVED","luvdia");
    const transition=await this.findScheduleTransition(null,memberUid);
    if(!transition) return null;
    const state=pendingMutationState(command,memberUid,date,holiday);
    const expectedState=(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!;
    const parsed:unknown=JSON.parse(expectedState);assertPendingState(parsed);
    const actual=(command.action==="reopen_rejection"?parsed.rejection:parsed.pending)[0];
    if(!actual || Object.keys(item).some(key=>Object.hasOwn(actual,key) && actual[key]!==item[key])) throw new TransitionWriteError("CONTENT_CONFLICT",transition.targetSite);
    return {transition,memberUid,date,holiday,expectedState};
  }
  async readNativePendingReceipt(id:string,operationId:string) {
    const owner=await this.row(id);
    if(this.side(owner)!=="target") throw new Error("Pending native receipt requires target resource");
    const raw=await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND json_extract(envelope_json,'$.codec.id')='pending.mutate'").bind(id,operationId).first<string>("envelope_json");
    return raw?(JSON.parse(raw).nativeReceipt as {actor:ScheduleReceiptActor}):null;
  }
  async admitNativePending(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,actor:ScheduleReceiptActor) {
    const prepared=await this.prepareAdmission(input,false,null,null,null,{actor});
    await prepared.insert.run();
    const operation=await this.readOperation(input.transitionId,input.operationId);
    if(!operation || operation.payloadHash!==prepared.operation.payloadHash) throw new Error("Pending receipt identity conflict");
    return operation;
  }
  async commitPending(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;actorId:string|null;command:PendingCommand;memberUid:number;date:string;holiday:boolean;expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.actorId):undefined;
    const state=local?pendingMutationState(local.command,local.memberUid,local.date,local.holiday):null;
    const guard=state?[this.db.prepare(`SELECT iif(${state.sql}=?,1,json('pending_expected_state_conflict'))`).bind(...state.bindings,local!.expectedState)]:[];
    // Keep the entire existing changes()/last_insert_rowid() chain adjacent.
    const result=await this.commitOperation(id,operationId,generation,[...guard,...statements,
      this.db.prepare("UPDATE content_transition_operations SET outcome_json=json_object('outcome','conflicted','sideEffectReconciled',json('true'),'detail','Original pending precondition did not match') WHERE changes()=0 AND transition_id=? AND operation_id=? AND outcome_json IS NULL").bind(id,operationId)],[],prepared);
    return result?result.businessResults.slice(guard.length,guard.length+statements.length):null;
  }
  private liveVersion(command:LiveScheduleCommand) {
    const columns=contentDispositionRegistry.schedules.values,rows=command.expectedRows;
    return {sql:`(SELECT count(*) FROM schedules WHERE member_uid=? AND date=?)=? AND ${rows.length?rows.map(()=>`EXISTS(SELECT 1 FROM schedules WHERE ${columns.map(column=>`"${column}" IS ?`).join(" AND ")})`).join(" AND "):"1"}`,
      bindings:[command.plan.memberUid,command.plan.scheduleDate,rows.length,...rows.flatMap(row=>columns.map(column=>row[column]))]};
  }
  async prepareCollectorMutation(command:CollectorCommand) {
    const expectedState=(await this.db.prepare(`SELECT ${collectorState(this.site)} state`).first<string>("state"))!;
    const state:unknown=JSON.parse(expectedState);assertCollectorState(state);
    const memberUid=collectorMemberUid(command),uids=memberUid===null?(state as {members:Array<{uid:number}>}).members.map(member=>member.uid):[memberUid];
    const owners=new Map<string,Awaited<ReturnType<D1TransitionRepository["readTransition"]>>>();
    const selected:number[]=[];
    for(const uid of uids) {const owner=await this.findScheduleTransition(null,uid);if(owner){owners.set(owner.id,owner);selected.push(uid);}}
    if(owners.size>1) throw new Error("Collector affected set crosses transition owners");
    const transition=[...owners.values()][0];
    return transition?{transition,expectedState,memberUids:selected}:null;
  }
  async commitCollector(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],command:CollectorCommand,local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;expectedState:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true):undefined;
    const uid=command.action==="insert_candidate"?Number(command.item.member_uid):command.action==="obsolete_candidate"?command.pending.member_uid:command.target?.memberUid;
    const guards=[...this.publicationGuards(uid?[uid]:[]),...(local?[this.db.prepare(`SELECT iif(${collectorState(this.site)}=?,1,json('collector_expected_state_conflict'))`).bind(local.expectedState)]:[])];
    if(command.action==="obsolete_candidate") {
      const fields=Object.keys(command.pending);
      guards.push(this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM pending_schedules WHERE ${fields.map(field=>`"${field}" IS ?`).join(" AND ")}),1,json('collector_original_candidate_conflict'))`).bind(...fields.map(field=>command.pending[field as keyof typeof command.pending])));
    } else if(command.action==="insert_candidate") {
      const fields=["id","member_uid","date","start_time","title","status"] as const;
      guards.push(this.db.prepare(`SELECT iif((SELECT count(*) FROM schedules WHERE member_uid=? AND date=?)=? AND ${command.schedules.length?command.schedules.map(()=>`EXISTS(SELECT 1 FROM schedules WHERE ${fields.map(field=>`"${field}" IS ?`).join(" AND ")})`).join(" AND "):"1"},1,json('collector_original_schedule_conflict'))`).bind(command.item.member_uid,command.item.date,command.schedules.length,...command.schedules.flatMap(row=>fields.map(field=>row[field]))));
    }
    const result=await this.commitOperation(id,operationId,generation,[...guards,...statements],[],prepared);
    return result?result.businessResults.slice(guards.length,guards.length+statements.length):null;
  }
  async commitChzzkCollectorBatch(id:string,operationId:string,childKey:string,command:CollectorCommand,statements:D1PreparedStatement[],expectedState:string) {
    const row=await this.row(id),source=this.side(row)==="source",operation=await this.exportOperation(id,operationId);
    const raw=await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("envelope_json");
    const original=JSON.parse(raw!),scan=parseChzzkScanCommand(source?original.sourceCommand?.payload:original.payload);
    const child=await this.db.prepare("SELECT member_uid,date FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<{member_uid:number;date:string}>();
    const stage=await this.readChzzkScanStage(id,operationId);
    const holiday=command.action==="holiday_obsolete" || command.action==="holiday_create";
    const sourcePortion=source && row.phase==="source_fenced";
    if(operation.codec.id!=="schedules.chzzk_scan" || !scan?.parent || !stage || !child || JSON.stringify(parseCollectorCommand(command))!==JSON.stringify(command)) throw new Error("Not an original collector continuation");
    if(command.action==="insert_candidate") {
      if(command.item.member_uid!==child.member_uid || command.item.date!==child.date) throw new Error("Original child command scope mismatch");
    } else if(command.action==="obsolete_candidate") {
      if(command.pending.member_uid!==child.member_uid || command.pending.date!==child.date) throw new Error("Original child command scope mismatch");
    } else if(command.now!==scan.startedAt || command.target?.memberUid!==child.member_uid || command.target?.date!==child.date) throw new Error("Original child command scope mismatch");
    const key=chzzkCollectorBatchKey(command),bindings=[id,operationId,childKey,key],rawCommand=JSON.stringify(command);
    const read=()=>this.db.prepare("SELECT command_json,result_json FROM content_transition_chzzk_batches WHERE transition_id=? AND operation_id=? AND child_key=? AND batch_key=?").bind(...bindings).first<{command_json:string;result_json:string|null}>();
    const prior=await read();
    if(prior?.command_json!==undefined && prior.command_json!==rawCommand) throw new Error("Original child batch identity conflict");
    if(prior?.result_json) return JSON.parse(prior.result_json) as Array<Pick<D1Result,"results"> & {affectedCount?:number;conflicted?:true}>;
    if(operation.outcome || (!sourcePortion && !canCommit(this.side(row),row.phase,source?row.generation-1:row.generation,row.generation)) || sourcePortion && (!holiday || !row.fence_json || operation.sourceSequence===null || operation.sourceSequence>JSON.parse(row.fence_json).operationBoundary)) throw new Error("Not an executable original collector continuation");
    const commitId=`${operationId}:child:${childKey}:${key}`,generation=source?row.generation-1:row.generation;
    const phase=sourcePortion?"phase='source_fenced'":source?"phase IN ('protected','copying','replaying','target_ingress_ready')":"phase IN ('target_owned','complete')";
    const scope=sourcePortion?"local_site=source_site":source?"local_site=source_site":"local_site=target_site";
    const guards:D1PreparedStatement[]=this.publicationGuards([child.member_uid]);
    if(!sourcePortion) {
      const input=chzzkMatchInputSql(scan,child.member_uid,child.date,this.site);
      guards.push(this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_children c CROSS JOIN (SELECT ${input.sql} current) snapshot
        WHERE c.transition_id=? AND c.operation_id=? AND c.child_key=? AND c.input_json IS NOT NULL AND ${["members","schedules","observations","rejections"].map(key=>`json_extract(c.input_json,'$.${key}')=json_extract(snapshot.current,'$.${key}')`).join(" AND ")}),1,json('original_match_input_conflict'))`).bind(...input.bindings,id,operationId,childKey));
    }
    if(command.action==="obsolete_candidate") {
      const fields=Object.keys(command.pending);
      guards.push(this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM pending_schedules WHERE ${fields.map(field=>`"${field}" IS ?`).join(" AND ")}),1,json('original_child_candidate_conflict'))`).bind(...fields.map(field=>command.pending[field as keyof typeof command.pending])));
    } else if(command.action==="insert_candidate") {
      const fields=["id","member_uid","date","start_time","title","status"] as const;
      guards.push(this.db.prepare(`SELECT iif((SELECT count(*) FROM schedules WHERE member_uid=? AND date=?)=? AND ${command.schedules.length?command.schedules.map(()=>`EXISTS(SELECT 1 FROM schedules WHERE ${fields.map(field=>`"${field}" IS ?`).join(" AND ")})`).join(" AND "):"1"},1,json('original_child_schedule_conflict'))`).bind(command.item.member_uid,command.item.date,command.schedules.length,...command.schedules.flatMap(row=>fields.map(field=>row[field]))));
    }
    try {await this.db.batch([
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id JOIN content_transition_chzzk_children c ON c.transition_id=o.transition_id AND c.operation_id=o.operation_id
        WHERE t.id=? AND ${scope} AND ${phase} AND t.generation=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND c.child_key=? AND c.result_json IS NULL) AND ${collectorState(this.site)}=?,1,json('original_collector_owner_or_state_conflict'))`).bind(id,row.generation,operationId,operation.payloadHash,childKey,expectedState),
      this.db.prepare(`INSERT INTO content_transition_chzzk_batches(transition_id,operation_id,child_key,batch_key,command_json,before_json)
        VALUES(?,?,?,?,?,json_object('pendingIds',json(${collectorPendingIdsSql}),'pendingMembers',json((SELECT json_group_array(json_object('id',id,'memberUid',member_uid)) FROM pending_schedules)),'site',?,'resource',?,'generation',?,'portion',?))`).bind(...bindings,rawCommand,this.site,this.resource,generation,sourcePortion?"source_remaining":source?"source_whole":"target_selected"),
      ...(!sourcePortion?[
        this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(id,commitId),
        this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,commit_seq) SELECT 1,?,?,?,seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?").bind(id,operationId,generation,id,commitId),
      ]:[]),
      ...guards,...statements,
      ...(!sourcePortion?captureStatements(this.db,id):[]),
      this.db.prepare(`UPDATE content_transition_chzzk_batches SET result_json=${collectorBatchResultSql(command)} WHERE transition_id=? AND operation_id=? AND child_key=? AND batch_key=? AND result_json IS NULL`).bind(...bindings),
      ...(!sourcePortion?[
        this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?").bind(id,commitId),
        this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
      ]:[]),
    ]);} catch(error) {
      const concurrent=await read();
      if(concurrent?.command_json===rawCommand && concurrent.result_json) return JSON.parse(concurrent.result_json) as Array<Pick<D1Result,"results"> & {conflicted?:true}>;
      if(/malformed JSON/.test(String(error))) {
        const input=chzzkMatchInputSql(scan,child.member_uid,child.date,this.site);
        const mismatch=sourcePortion?"0":`EXISTS(SELECT 1 FROM content_transition_chzzk_children c CROSS JOIN (SELECT ${input.sql} current) snapshot WHERE c.transition_id=? AND c.operation_id=? AND c.child_key=? AND c.input_json IS NOT NULL AND (${["members","schedules","observations","rejections"].map(key=>`json_extract(c.input_json,'$.${key}')<>json_extract(snapshot.current,'$.${key}')`).join(" OR ")}))`;
        const results=statements.map(()=>({results:[],conflicted:true as const}));
        // The failed owning batch rolled back. Record only a proven optimistic
        // conflict; owner movement and unknown database failures stay pending.
        await this.db.prepare(`INSERT OR IGNORE INTO content_transition_chzzk_batches(transition_id,operation_id,child_key,batch_key,command_json,before_json,result_json)
          SELECT ?,?,?,?,?,json_object('portion',?,'pendingMembers',json('[]')),? WHERE (${collectorState(this.site)}<>? OR ${mismatch})
          AND EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id JOIN content_transition_chzzk_children c ON c.transition_id=o.transition_id AND c.operation_id=o.operation_id
            WHERE t.id=? AND ${scope} AND ${phase} AND t.generation=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND c.child_key=? AND c.result_json IS NULL)`)
          .bind(...bindings,rawCommand,sourcePortion?"source_remaining":source?"source_whole":"target_selected",JSON.stringify(results),expectedState,...(sourcePortion?[]:[...input.bindings,id,operationId,childKey]),id,row.generation,operationId,operation.payloadHash,childKey).run();
        const conflict=await read();if(conflict?.command_json===rawCommand && conflict.result_json) return JSON.parse(conflict.result_json) as typeof results;
      }
      throw error;
    }
    const result=await read();if(!result?.result_json) throw new Error("Missing original committed collector result");
    return JSON.parse(result.result_json) as Array<Pick<D1Result,"results"> & {affectedCount?:number;conflicted?:true}>;
  }
  async chzzkCollectorContext(id:string,operationId:string,childKey:string) {
    const row=await this.row(id),stage=await this.readChzzkScanStage(id,operationId);
    const child=await this.db.prepare("SELECT member_uid,date FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<{member_uid:number;date:string}>();
    if(!stage || !child || !stage.targets.some(target=>target.key===childKey)) throw new Error("Unknown original collector child");
    const expectedState=(await this.db.prepare(`SELECT ${collectorState(this.site)} state`).first<string>("state"))!;
    assertCollectorState(JSON.parse(expectedState));
    return {expectedState,memberScope:this.side(row)==="target"?(JSON.parse(row.plan_json) as TransitionPlan).members.map(member=>member.targetUid!):undefined};
  }
  async prepareChzzkMatchInput(id:string,operationId:string,childKey:string) {
    const row=await this.row(id),command=await this.readExecutableCommand(id,operationId),scan=parseChzzkScanCommand(command.payload);
    const child=await this.db.prepare("SELECT member_uid,date FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<{member_uid:number;date:string}>();
    if(command.codec.id!=="schedules.chzzk_scan" || !scan?.parent || !child || !(await this.readChzzkScanStage(id,operationId))?.targets.some(target=>target.key===childKey)) throw new Error("Unknown original match input");
    const query=chzzkMatchInputSql(scan,child.member_uid,child.date,this.site),source=this.side(row)==="source";
    const phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    await this.db.prepare(`UPDATE content_transition_chzzk_children SET input_json=${query.sql} WHERE transition_id=? AND operation_id=? AND child_key=? AND input_json IS NULL
      AND EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND t.phase IN (${phases}) AND t.generation=? AND o.operation_id=? AND o.outcome_json IS NULL)`)
      .bind(...query.bindings,id,operationId,childKey,id,row.generation,operationId).run();
    const raw=await this.db.prepare("SELECT input_json FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<string>("input_json");
    const input=raw?parseChzzkMatchInput(JSON.parse(raw)):null;
    if(!input || input.startedAt!==scan.startedAt || input.members.some(member=>member.uid!==child.member_uid)) throw new Error("Missing or corrupt original match input");
    return {input,rangeDays:scan.rangeDays,target:{memberUid:child.member_uid,date:child.date}};
  }
  async chzzkRunContinuations(runId:string) {
    const rows=await this.db.prepare(`SELECT s.transition_id,s.operation_id,o.envelope_json,i.status scan_status,i.id scan_item_id FROM content_transition_chzzk_stages s
      JOIN content_transition_operations o ON o.transition_id=s.transition_id AND o.operation_id=s.operation_id
      JOIN content_transitions t ON t.id=s.transition_id JOIN scheduled_job_items i ON i.id=json_extract(s.parent_json,'$.itemId')
      WHERE json_extract(s.parent_json,'$.runId')=? AND i.run_id=? AND i.phase='scan' AND t.local_site=? AND t.local_resource=?
      ORDER BY s.transition_id,s.operation_id`).bind(runId,runId,this.site,this.resource).all<{transition_id:string;operation_id:string;envelope_json:string;scan_status:string;scan_item_id:string}>();
    return Promise.all(rows.results.map(async row=>{
      const raw=JSON.parse(row.envelope_json),command=parseChzzkScanCommand(raw.sourceCommand?.payload??raw.payload);
      const stage=await this.readChzzkScanStage(row.transition_id,row.operation_id);
      if(!command?.parent || !stage) throw new Error("Original scan stage is pending durable handover");
      return {transitionId:row.transition_id,operationId:row.operation_id,scanStatus:row.scan_status,scanItemId:row.scan_item_id,memberUids:command.members.map(member=>member.uid),targets:stage.targets.map(target=>({
        memberUid:command.members.find(member=>member.code===target.memberCode)!.uid,date:target.date,
        transition:{transitionId:row.transition_id,operationId:row.operation_id,childKey:target.key},
      }))};
    }));
  }
  async closeUnadmittedChzzkChildren(runId:string) {
    for(const original of await this.chzzkRunContinuations(runId)) {
      if(!["failed","throttled"].includes(original.scanStatus)) continue;
      const result:ChzzkChildResult={status:"failed",result:{updated:0,checked:0,segmentCount:0,sessionCount:0,resumeMergedCount:0,rejectedSuppressed:0,duplicatePending:0,shortSuppressed:0,holidaySuppressed:0,ambiguous:0,obsoletePending:0,details:[]},notAdmitted:{scanItemId:original.scanItemId,status:original.scanStatus as "failed"|"throttled"}};
      await this.db.prepare(`UPDATE content_transition_chzzk_children AS c SET result_json=?,accounted_at=? WHERE transition_id=? AND operation_id=? AND result_json IS NULL AND input_json IS NULL
        AND EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id AND o.operation_id=c.operation_id WHERE t.id=c.transition_id AND (t.local_site=t.source_site OR o.source_seq IS NULL) AND t.local_site=? AND t.local_resource=?)
        AND EXISTS(SELECT 1 FROM scheduled_job_items scan JOIN content_transition_chzzk_stages s ON s.transition_id=c.transition_id AND s.operation_id=c.operation_id
          WHERE scan.id=? AND scan.run_id=? AND scan.phase='scan' AND scan.status=? AND scan.result_json IS NOT NULL
            AND json_extract(s.parent_json,'$.itemId')=scan.id AND json_extract(s.parent_json,'$.runId')=scan.run_id AND s.completion_json IS NOT NULL
            AND json_extract(scan.result_json,'$.channels')>0 AND json_extract(scan.result_json,'$.failed')=json_extract(scan.result_json,'$.channels')
            AND NOT EXISTS(SELECT 1 FROM json_each(s.completion_json,'$.completion.result.channelResults') actual
              WHERE NOT EXISTS(SELECT 1 FROM json_each(scan.result_json,'$.channelResults') retained WHERE json_extract(retained.value,'$.channelId')=json_extract(actual.value,'$.channelId') AND json_extract(retained.value,'$.status')=json_extract(actual.value,'$.status')))
            AND NOT EXISTS(SELECT 1 FROM json_each(scan.result_json,'$.channelResults') channel WHERE json_extract(channel.value,'$.status')='complete')
            AND NOT EXISTS(SELECT 1 FROM json_each(s.completion_json,'$.completion.result.channelResults') channel WHERE json_extract(channel.value,'$.status')='complete'))
        AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_batches b WHERE b.transition_id=c.transition_id AND b.operation_id=c.operation_id AND b.child_key=c.child_key)
        AND NOT EXISTS(SELECT 1 FROM scheduled_job_items i WHERE i.run_id=? AND i.phase='match' AND json_extract(i.continuation_json,'$.transition.transitionId')=c.transition_id AND json_extract(i.continuation_json,'$.transition.operationId')=c.operation_id AND json_extract(i.continuation_json,'$.transition.childKey')=c.child_key)`)
        .bind(JSON.stringify(result),Date.now(),original.transitionId,original.operationId,this.site,this.resource,original.scanItemId,runId,original.scanStatus,runId).run();
    }
  }
  async readChzzkChildResult(id:string,operationId:string,childKey:string) {
    await this.chzzkCollectorContext(id,operationId,childKey);
    const raw=await this.db.prepare("SELECT result_json FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<string>("result_json");
    const result=raw?parseChzzkChildResult(JSON.parse(raw)):null;if(raw && !result) throw new Error("Corrupt original child result");return result;
  }
  async recordChzzkChildResult(id:string,operationId:string,childKey:string,result:ChzzkChildResult) {
    if(!parseChzzkChildResult(result)) throw new Error("Invalid original child result");
    const row=await this.row(id),source=this.side(row)==="source";
    await this.chzzkCollectorContext(id,operationId,childKey);
    const phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    await this.db.prepare(`UPDATE content_transition_chzzk_children SET result_json=? WHERE transition_id=? AND operation_id=? AND child_key=? AND result_json IS NULL
      AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}) AND generation=?)`).bind(JSON.stringify(result),id,operationId,childKey,id,row.generation).run();
    const actual=await this.readChzzkChildResult(id,operationId,childKey);
    if(!actual) throw new Error("Original child awaits its final owner");
    if(JSON.stringify(actual)!==JSON.stringify(result)) throw new Error("Immutable original child result conflict");
    return actual;
  }
  async settleChzzkRun(runId:string) {
    const originals=await this.chzzkRunContinuations(runId);
    for(const original of originals) {
      const {transitionId:id,operationId}=original,row=await this.row(id),source=this.side(row)==="source";
      const stage=(await this.readChzzkScanStage(id,operationId))!;
      const children=await Promise.all(stage.targets.map(target=>this.readChzzkChildResult(id,operationId,target.key)));
      const outcome=chzzkCompletionOutcome(stage,children.filter((child):child is ChzzkChildResult=>child!==null));
      const phases=source?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
      const operation=await this.exportOperation(id,operationId);
      await this.db.batch([
        this.db.prepare(`UPDATE content_transition_chzzk_children AS c SET accounted_at=coalesce(accounted_at,?) WHERE transition_id=? AND operation_id=? AND result_json IS NOT NULL
          AND EXISTS(SELECT 1 FROM scheduled_job_items i WHERE i.run_id=? AND i.phase='match' AND i.status=json_extract(c.result_json,'$.status')
            AND json_extract(i.continuation_json,'$.transition.transitionId')=c.transition_id AND json_extract(i.continuation_json,'$.transition.operationId')=c.operation_id
            AND json_extract(i.continuation_json,'$.transition.childKey')=c.child_key AND json(i.result_json)=json_extract(c.result_json,'$.result'))`).bind(Date.now(),id,operationId,runId),
        this.db.prepare(`UPDATE content_transition_chzzk_stages SET finalizer_json=(SELECT json_object('runId',run_id,'itemId',id,'status',status,'result',json(result_json)) FROM scheduled_job_items
          WHERE run_id=? AND phase='finalize' AND status IN ('succeeded','partial','failed') AND result_json IS NOT NULL)
          WHERE transition_id=? AND operation_id=? AND finalizer_json IS NULL`).bind(runId,id,operationId),
        this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL
          AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))
          AND EXISTS(SELECT 1 FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=? AND finalizer_json IS NOT NULL)
          AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND (result_json IS NULL OR accounted_at IS NULL))`).bind(JSON.stringify(outcome),id,operationId,id,id,operationId,id,operationId),
        ...(!source && operation.sourceSequence===null?await new D1ChzzkReadJournal(this.db,this.site,this.resource).nativeSettlementStatements(id,operationId,operation.payloadHash,outcome,Date.now()):[]),
      ]);
    }
  }
  async exportChzzkChild(id:string,operationId:string,childKey:string):Promise<ChzzkChildTransfer> {
    const row=await this.row(id),operation=await this.exportOperation(id,operationId);
    if(this.side(row)!=="source" || row.phase!=="source_fenced" || !row.fence_json || operation.sourceSequence===null || operation.sourceSequence>JSON.parse(row.fence_json).operationBoundary) throw new Error("Not a frozen original child");
    await this.chzzkCollectorContext(id,operationId,childKey);
    const plan:TransitionPlan=JSON.parse(row.plan_json),map=(uid:number)=>{
      const member=plan.members.find(member=>member.uid===uid);if(!member?.targetUid) throw new Error("Original child contains an unapproved member");return member.targetUid;
    };
    const child=await this.db.prepare("SELECT input_json,result_json FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<{input_json:string|null;result_json:string|null}>();
    const control=child?.result_json?parseChzzkChildResult(JSON.parse(child.result_json)):null;
    if(!control?.notAdmitted && !await this.db.prepare(`SELECT 1 admitted FROM scheduled_job_items i JOIN content_transition_chzzk_stages s ON s.transition_id=? AND s.operation_id=?
      WHERE i.run_id=json_extract(s.parent_json,'$.runId') AND i.phase='match' AND json_extract(i.continuation_json,'$.transition.transitionId')=s.transition_id AND json_extract(i.continuation_json,'$.transition.operationId')=s.operation_id AND json_extract(i.continuation_json,'$.transition.childKey')=?`).bind(id,operationId,childKey).first("admitted")) throw new Error("Original coordinator has not admitted this match child");
    const input=child?.input_json?parseChzzkMatchInput(JSON.parse(child.input_json)):null;
    if(child?.input_json && !input) throw new Error("Corrupt original child input");
    const projected=input?{...input,members:input.members.map(member=>({...member,uid:map(member.uid)})),schedules:input.schedules.map(value=>({...value,member_uid:map(value.member_uid)})),observations:input.observations.map(value=>({...value,member_uid:map(value.member_uid)})),pending:input.pending.map(value=>({...value,member_uid:map(value.member_uid)}))}:null;
    const rows=await this.db.prepare("SELECT batch_key,command_json,before_json,result_json FROM content_transition_chzzk_batches WHERE transition_id=? AND operation_id=? AND child_key=? AND json_extract(before_json,'$.portion')='source_whole' ORDER BY batch_key").bind(id,operationId,childKey).all<{batch_key:string;command_json:string;before_json:string;result_json:string}>();
    const batches=rows.results.map(batch=>{
      const command=parseCollectorCommand(JSON.parse(batch.command_json));if(!command || !batch.result_json) throw new Error("Uncommitted original child batch");
      const projectedCommand=command.action==="insert_candidate"?{...command,item:{...command.item,member_uid:map(Number(command.item.member_uid))},log:{...command.log,member_uid:map(Number(command.log.member_uid))},schedules:command.schedules.map(value=>({...value,member_uid:map(value.member_uid)}))}:
        command.action==="obsolete_candidate"?{...command,pending:{...command.pending,member_uid:map(command.pending.member_uid)}}:{...command,target:command.target?{...command.target,memberUid:map(command.target.memberUid)}:null};
      const before=JSON.parse(batch.before_json) as {pendingMembers:Array<{id:number;memberUid:number}>};
      const results=(JSON.parse(batch.result_json) as Array<{results:Record<string,unknown>;conflicted?:true}>).map(entry=>{
        if(!Array.isArray(entry.results)) throw new Error("Corrupt original collector rows");
        const actual=entry.results as Array<Record<string,unknown>>;
        const selected=command.action==="holiday_obsolete"?actual.filter(value=>plan.members.some(member=>member.uid===before.pendingMembers.find(prior=>prior.id===value.id)?.memberUid)):actual;
        return {results:selected.map(value=>typeof value.member_uid==="number"?{...value,member_uid:map(value.member_uid)}:value),...(command.action==="holiday_obsolete"?{affectedCount:actual.length}:{}),...(entry.conflicted?{conflicted:true as const}:{})};
      });
      return {key:batch.batch_key,command:projectedCommand,results};
    });
    const result:ChzzkChildResult|null=control;
    if(result) result.result.details=result.result.details.map(detail=>({...detail,memberUid:map(detail.memberUid)}));
    return {transitionId:id,operationId,payloadHash:operation.payloadHash,childKey,input:projected,batches,result};
  }
  async receiveChzzkChild(transfer:ChzzkChildTransfer) {
    if(!transfer || Object.keys(transfer).sort().join(",")!=="batches,childKey,input,operationId,payloadHash,result,transitionId" || !Array.isArray(transfer.batches) || transfer.result!==null && !parseChzzkChildResult(transfer.result)) throw new Error("Invalid original child transfer");
    const {transitionId:id,operationId,childKey}=transfer,row=await this.row(id),operation=await this.exportOperation(id,operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || operation.sourceSequence===null || operation.payloadHash!==transfer.payloadHash) throw new Error("Wrong original child receiver");
    const stage=await this.readChzzkScanStage(id,operationId),target=stage?.targets.find(target=>target.key===childKey);
    if(!target) throw new Error("Unknown original child transfer");
    const plan:TransitionPlan=JSON.parse(row.plan_json),member=plan.members.find(member=>member.code===target.memberCode)!,scan=parseChzzkScanCommand(operation.payload)!;
    if(transfer.result?.notAdmitted && (transfer.result.notAdmitted.scanItemId!==stage!.parent.itemId || transfer.input!==null || transfer.batches.length!==0)) throw new Error("Invalid original no-admission control");
    const input=transfer.input===null?null:parseChzzkMatchInput(transfer.input);
    if(transfer.input!==null && (!input || input.startedAt!==scan.startedAt || input.members.some(value=>value.uid!==member.targetUid) || [...input.schedules,...input.observations,...input.pending].some(value=>value.member_uid!==member.targetUid) || [...input.schedules,...input.pending].some(value=>value.date!==target.date)) || transfer.batches.length>0 && !input || transfer.result?.result.details.some(detail=>detail.memberUid!==member.targetUid || detail.scheduleDate!==target.date)) throw new Error("Original child input scope mismatch");
    const statements:D1PreparedStatement[]=[];
    if(input) statements.push(this.db.prepare("UPDATE content_transition_chzzk_children SET input_json=coalesce(input_json,?) WHERE transition_id=? AND operation_id=? AND child_key=?").bind(JSON.stringify(input),id,operationId,childKey),this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=? AND input_json=?),1,json('original_child_input_conflict'))").bind(id,operationId,childKey,JSON.stringify(input)));
    for(const batch of transfer.batches) {
      const command=parseCollectorCommand(batch.command);
      if(Object.keys(batch).sort().join(",")!=="command,key,results" || !command || JSON.stringify(command)!==JSON.stringify(batch.command) || chzzkCollectorBatchKey(command)!==batch.key) throw new Error("Invalid original child batch receipt");
      assertChzzkBatchResults(command,batch.results);
      const uid=command.action==="insert_candidate"?command.item.member_uid:command.action==="obsolete_candidate"?command.pending.member_uid:command.target?.memberUid;
      const date=command.action==="insert_candidate"?command.item.date:command.action==="obsolete_candidate"?command.pending.date:command.target?.date;
      if(uid!==member.targetUid || date!==target.date || (command.action==="holiday_obsolete" || command.action==="holiday_create") && command.now!==scan.startedAt) throw new Error("Original batch member mismatch");
      const args=[id,operationId,childKey,batch.key],commandJson=JSON.stringify(command),resultJson=JSON.stringify(batch.results);
      statements.push(this.db.prepare("INSERT OR IGNORE INTO content_transition_chzzk_batches(transition_id,operation_id,child_key,batch_key,command_json,before_json,result_json) VALUES(?,?,?,?,?,'{\"portion\":\"source_whole_replayed\"}',?)").bind(...args,commandJson,resultJson),this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_batches WHERE transition_id=? AND operation_id=? AND child_key=? AND batch_key=? AND command_json=? AND result_json=?),1,json('original_child_batch_conflict'))").bind(...args,commandJson,resultJson));
    }
    if(statements.length) await this.db.batch(statements);
    if(transfer.result) await this.recordChzzkChildResult(id,operationId,childKey,transfer.result);
  }
  async originalChzzkHolidayCommand(id:string,operationId:string,childKey:string,action:"holiday_obsolete"|"holiday_create") {
    await this.exportChzzkChild(id,operationId,childKey);
    const raw=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceCommand.payload') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("value");
    const command=raw?parseChzzkScanCommand(JSON.parse(raw)):null;if(!command?.parent) throw new Error("Missing original child command");
    const child=await this.db.prepare("SELECT member_uid,date FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND child_key=?").bind(id,operationId,childKey).first<{member_uid:number;date:string}>();
    const prior=await this.db.prepare("SELECT json_extract(before_json,'$.portion') portion FROM content_transition_chzzk_batches WHERE transition_id=? AND operation_id=? AND child_key=? AND batch_key=?").bind(id,operationId,childKey,action).first<string>("portion");
    return {action,now:command.startedAt,target:{memberUid:child!.member_uid,date:child!.date},alreadyWhole:prior==="source_whole"};
  }
  async chzzkSourceSupplement(id:string,operationId:string,childKey:string) {
    await this.exportChzzkChild(id,operationId,childKey);
    const result=await this.db.prepare("SELECT result_json FROM content_transition_chzzk_batches WHERE transition_id=? AND operation_id=? AND child_key=? AND batch_key='holiday_obsolete' AND json_extract(before_json,'$.portion')='source_remaining'").bind(id,operationId,childKey).first<string>("result_json");
    const conflicted=await this.db.prepare("SELECT EXISTS(SELECT 1 FROM content_transition_chzzk_batches b,json_each(b.result_json) entry WHERE b.transition_id=? AND b.operation_id=? AND b.child_key=? AND json_extract(b.before_json,'$.portion')='source_remaining' AND json_extract(entry.value,'$.conflicted')=1) value").bind(id,operationId,childKey).first<number>("value");
    return {withdrawn:result?(JSON.parse(result) as Array<{results:unknown[]}>)[1].results.length:0,conflicted:conflicted===1};
  }
  async receiveChzzkChildResult(id:string,operationId:string,childKey:string,result:ChzzkChildResult) {
    if(!parseChzzkChildResult(result)) throw new Error("Invalid original child outcome");
    const transfer=await this.exportChzzkChild(id,operationId,childKey),row=await this.row(id),plan:TransitionPlan=JSON.parse(row.plan_json);
    const child=(await this.readChzzkScanStage(id,operationId))!.targets.find(target=>target.key===childKey)!;
    const local={...result,result:{...result.result,details:result.result.details.map(detail=>{
      const member=plan.members.find(member=>member.targetUid===detail.memberUid && member.code===child.memberCode);if(!member || detail.scheduleDate!==child.date) throw new Error("Original child result outside approved scope");return {...detail,memberUid:member.uid};
    })}};
    if(transfer.result && JSON.stringify(transfer.result)!==JSON.stringify(result)) throw new Error("Immutable original child result conflict");
    await this.db.prepare("UPDATE content_transition_chzzk_children SET result_json=? WHERE transition_id=? AND operation_id=? AND child_key=? AND result_json IS NULL").bind(JSON.stringify(local),id,operationId,childKey).run();
    const actual=(await this.readChzzkChildResult(id,operationId,childKey))!;
    if(JSON.stringify(actual)!==JSON.stringify(local)) throw new Error("Immutable original child result conflict");
    return actual;
  }
  async chzzkFinalizer(id:string,operationId:string):Promise<ChzzkFinalizerReceipt|null> {
    const stage=await this.readChzzkScanStage(id,operationId);if(!stage) return null;
    const raw=await this.db.prepare("SELECT finalizer_json FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("finalizer_json");
    if(!raw) return null;
    await new D1ChzzkContinuationStore(this.db).assertSettled(id,operationId);
    const finalizer=JSON.parse(raw) as {itemId:string;status:ChzzkFinalizerReceipt["status"]};
    const children=await Promise.all(stage.targets.map(async target=>({key:target.key,result:(await this.exportChzzkChild(id,operationId,target.key)).result!})));
    if(children.some(child=>!child.result)) throw new Error("Original finalizer has unfinished children");
    return {transitionId:id,operationId,payloadHash:stage.payloadHash,parent:stage.parent,itemId:finalizer.itemId,status:finalizer.status,children};
  }
  async receiveChzzkFinalizer(receipt:ChzzkFinalizerReceipt) {
    if(!receipt || Object.keys(receipt).sort().join(",")!=="children,itemId,operationId,parent,payloadHash,status,transitionId" || !Array.isArray(receipt.children) || receipt.children.some(child=>!child || Object.keys(child).sort().join(",")!=="key,result" || typeof child.key!=="string" || !parseChzzkChildResult(child.result))) throw new Error("Invalid original finalizer control");
    const {transitionId:id,operationId}=receipt,row=await this.row(id),operation=await this.exportOperation(id,operationId),stage=await this.readChzzkScanStage(id,operationId);
    if(this.side(row)!=="target" || !["target_owned","complete"].includes(row.phase) || operation.sourceSequence===null || !stage || stage.payloadHash!==receipt.payloadHash || JSON.stringify(stage.parent)!==JSON.stringify(receipt.parent) || !receipt.itemId || !["succeeded","partial","failed"].includes(receipt.status) || receipt.children.length!==stage.targets.length || new Set(receipt.children.map(child=>child.key)).size!==receipt.children.length) throw new Error("Original finalizer receipt mismatch");
    const statements:D1PreparedStatement[]=[];
    for(const child of receipt.children) {
      if(!stage.targets.some(target=>target.key===child.key) || JSON.stringify(await this.readChzzkChildResult(id,operationId,child.key))!==JSON.stringify(child.result)) throw new Error("Original finalizer child readback mismatch");
      statements.push(this.db.prepare("UPDATE content_transition_chzzk_children SET accounted_at=coalesce(accounted_at,?) WHERE transition_id=? AND operation_id=? AND child_key=? AND result_json=?").bind(Date.now(),id,operationId,child.key,JSON.stringify(child.result)));
    }
    const outcome=chzzkCompletionOutcome(stage,receipt.children.map(child=>child.result));
    await this.db.batch([...statements,
      this.db.prepare("UPDATE content_transition_chzzk_stages SET finalizer_json=coalesce(finalizer_json,?) WHERE transition_id=? AND operation_id=?").bind(JSON.stringify(receipt),id,operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=? AND finalizer_json=?),1,json('original_finalizer_conflict'))").bind(id,operationId,JSON.stringify(receipt)),
      this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL
        AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN ('target_owned','complete'))
        AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_children WHERE transition_id=? AND operation_id=? AND (result_json IS NULL OR accounted_at IS NULL))`).bind(JSON.stringify(outcome),id,operationId,id,id,operationId),
    ]);
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error("Original terminal outcome mismatch");
  }
  async commitLiveSchedule(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;command:LiveScheduleCommand}) {
    const prepared=local?await this.prepareAdmission(local.input,true):undefined,version=local?this.liveVersion(local.command):null;
    const memberUid=local?.command.plan.memberUid??parseLiveSchedulePlan((await this.exportOperation(id,operationId)).payload.plan)?.memberUid;
    const guard=[...this.publicationGuards(memberUid?[memberUid]:[]),...(version?[this.db.prepare(`SELECT iif(${version.sql},1,json('live_expected_state_conflict'))`).bind(...version.bindings)]:[])];
    const result=await this.commitOperation(id,operationId,generation,[...guard,...statements,this.db.prepare("UPDATE content_transition_operations SET outcome_json=json_object('outcome','conflicted','sideEffectReconciled',json('true'),'detail','Original live-fill precondition did not match') WHERE changes()=0 AND transition_id=? AND operation_id=? AND outcome_json IS NULL").bind(id,operationId)],[],prepared);
    return result?result.businessResults.slice(guard.length,guard.length+statements.length):null;
  }
  private ddayVersion(command:DDayCommand,expectedRows:string) {
    const state=ddayMutationState(command);
    return {sql:`${state.sql}=?${command.action==="create"?"":` AND NOT EXISTS(SELECT 1 FROM ddays d WHERE id=? AND NOT (${editableDDaySql("d")}))`}`,bindings:[...state.bindings,expectedRows,...(command.action==="create"?[]:[command.id])]};
  }
  async readDDayReceipt(operationId:string) {
    const row=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE t.local_site=? AND t.local_resource=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id') IN ('ddays.create','ddays.mutate','ddays.local')`)
      .bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!row) return null;
    const data=JSON.parse(row.envelope_json),receipt=(data.nativeReceipt??data.sourceReceipt) as {actorId:string;command:DDayCommand;result:{success:true;id:number}|null};
    if(!receipt) throw new Error("Missing D-day receipt identity");
    return {...receipt,operation:(await this.readOperation(row.transition_id,operationId))!};
  }
  async admitNativeDDay(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,actorId:string,command:DDayCommand) {
    const existing=await this.readDDayReceipt(input.operationId);
    if(existing) {
      if(existing.actorId!==actorId || existing.operation.transitionId!==input.transitionId || JSON.stringify(existing.command)!==JSON.stringify(command)) throw new Error("D-day receipt identity conflict");
      return existing.operation;
    }
    const prepared=await this.prepareAdmission(input,false,null,null,{actorId,command,result:null});
    await prepared.insert.run();
    const stored=await this.readDDayReceipt(input.operationId);
    if(!stored || stored.actorId!==actorId || JSON.stringify(stored.command)!==JSON.stringify(command)) throw new Error("D-day receipt identity conflict");
    return stored.operation;
  }
  async commitDDay(id:string,operationId:string,generation:number,command:DDayCommand,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;actorId:string;expectedRows:string}) {
    const prepared=local?await this.prepareAdmission(local.input,true,local.actorId):undefined;
    const key=local?"sourceReceipt":"nativeReceipt";
    const extra=local?this.ddayVersion(command,local.expectedRows):null;
    const guard=extra?[this.db.prepare(`SELECT iif(${extra.sql},1,json('dday_expected_state_conflict'))`).bind(...extra.bindings)]:[];
    const result=await this.commitOperation(id,operationId,generation,[...guard,...statements,
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json_object('success',json('true'),'id',${command.action==="create"?"last_insert_rowid()":"?"})) WHERE transition_id=? AND operation_id=?`).bind(...(command.action==="create"?[]:[command.id]),id,operationId)],[],prepared);
    return result;
  }
  private noticeVersion(command:NoticeCommand,expectedRows:string) {
    const {state,bindings}=noticeMutationState(command);
    const chosen=command.action==="create"?"1":`EXISTS(SELECT 1 FROM notices n WHERE id=? AND ${editableNoticeSql("n")})`;
    const uids=command.action==="create" || command.action==="update"?command.input.relatedMemberUids:[];
    return {sql:`${state}=? AND ${chosen} AND (SELECT count(*) FROM members WHERE uid IN (SELECT value FROM json_each(?)) AND (is_deprecated IS NULL OR is_deprecated=0))=?`,bindings:[...bindings,expectedRows,...(command.action==="create"?[]:[command.id]),JSON.stringify(uids),uids.length]};
  }
  private noticeGuard(command:NoticeCommand,expectedRows:string) {
    const version=this.noticeVersion(command,expectedRows);
    return this.db.prepare(`SELECT iif(${version.sql},1,json('notice_expected_state_conflict'))`).bind(...version.bindings);
  }
  async reconcileNativeNoticePrecondition(id:string,operationId:string) {
    const executable=await this.readExecutableCommand(id,operationId),command=parseNoticeCommand(executable.payload);
    if(executable.codec.id!=="notices.mutate" || !command || typeof executable.payload.expectedRows!=="string") throw new Error("Missing native notice command");
    const version=this.noticeVersion(command,executable.payload.expectedRows);
    if(await this.db.prepare(`SELECT ${version.sql} matches`).bind(...version.bindings).first<number>("matches")) return true;
    await this.recordOutcome(id,operationId,{outcome:"conflicted",sideEffectReconciled:true,detail:"Expected notice state no longer matches"});
    return false;
  }
  async commitUnselectedNotice(command:NoticeCommand,expectedRows:string,statements:D1PreparedStatement[]) {
    try { return (await this.db.batch([this.noticeGuard(command,expectedRows),...statements])).slice(1); }
    catch(error) {
      if(String(error).includes("malformed JSON")) {
        await this.prepareNoticeMutation(command); // Preserve moved feedback when the chosen row changed ownership.
        throw new TransitionWriteError("CONTENT_CONFLICT",this.site);
      }
      throw error;
    }
  }
  async commitLocalNotice(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,command:NoticeCommand,expectedRows:string,statements:D1PreparedStatement[]) {
    if(input.codec.id!=="notices.local") throw new Error("Atomic local notice codec required");
    const prepared=await this.prepareAdmission(input,true);
    const result=await this.commitOperation(input.transitionId,input.operationId,prepared.row.generation-1,[this.noticeGuard(command,expectedRows),...statements],[],prepared);
    return result?{...result,businessResults:result.businessResults.slice(1)}:result;
  }
  async findRedactionTransition(postId:string) {
    const rows=await this.db.prepare(`SELECT DISTINCT t.id FROM content_transitions t JOIN (
      SELECT transition_id,row_table,row_key FROM content_transition_membership
      UNION SELECT b.transition_id,b.row_table,b.row_key FROM content_transition_baseline_rows b JOIN content_transitions target ON target.id=b.transition_id WHERE target.local_site=target.target_site AND b.installed=1
      UNION SELECT r.transition_id,r.row_table,r.row_key FROM content_transition_materialized_rows r JOIN content_transitions target ON target.id=r.transition_id WHERE target.local_site=target.target_site
      ) m ON m.transition_id=t.id
      WHERE t.aborted_at IS NULL AND t.local_site=? AND t.local_resource=? AND (
        m.row_table='x_posts' AND EXISTS(SELECT 1 FROM x_posts p WHERE m.row_key=json_array(p.id) AND ((p.id=? AND p.hidden_at IS NULL AND p.content_removed_at IS NULL) OR json_extract(p.value,'$.reply.post.id')=? OR json_extract(p.value,'$.quote.post.id')=? OR EXISTS(SELECT 1 FROM json_each(p.value,'$.links') link WHERE json_extract(link.value,'$.linkedPost.id')=?))) OR
        m.row_table='x_post_facts' AND EXISTS(SELECT 1 FROM x_post_facts f WHERE m.row_key=json_array(f.post_id) AND f.post_id=?) OR
        m.row_table='x_post_references' AND EXISTS(SELECT 1 FROM x_post_references r WHERE m.row_key=json_array(r.source_post_id,r.relation_type) AND r.referenced_post_id=?) OR
        m.row_table='x_api_cache' AND EXISTS(SELECT 1 FROM x_api_cache c WHERE m.row_key=json_array(c.key) AND (c.type='posts' OR (c.type='linked_post' AND c.key='x:linked-post:v1:'||?)))
      )`).bind(this.site,this.resource,postId,postId,postId,postId,postId,postId,postId).all<{id:string}>();
    if(rows.results.length>1) throw new Error("Redaction crosses conflicting transition owners");
    return rows.results[0]?this.readTransition(rows.results[0].id):null;
  }
  async prepareXRedaction(postId:string) {
    const state=xRedactionState(postId);
    return {transition:await this.findRedactionTransition(postId),expectedState:(await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state"))!};
  }
  async readXRedactionReceipt(id:string,operationId:string) {
    await this.row(id);
    const value=await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND json_extract(envelope_json,'$.codec.id') IN ('x-posts.redact','x-posts.local_redaction')").bind(id,operationId).first<string>("envelope_json");
    if(!value) return null;
    const data=JSON.parse(value),receipt=data.nativeReceipt??data.sourceReceipt;
    if(!receipt) throw new Error("Missing X redaction receipt");
    return {actor:receipt.actor as ScheduleReceiptActor|undefined,result:receipt.result as {found:boolean;changed:boolean}|null,operation:(await this.readOperation(id,operationId))!};
  }
  async admitNativeXRedaction(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,actor:ScheduleReceiptActor) {
    if(input.codec.id!=="x-posts.redact" || !actor.actorId) throw new Error("Native X redaction requires its own administrator");
    const prepared=await this.prepareAdmission(input,false,null,null,null,null,false,true);
    await this.db.batch([prepared.insert,
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt',json(?)) WHERE transition_id=? AND operation_id=? AND json_type(envelope_json,'$.nativeReceipt') IS NULL").bind(JSON.stringify({actor,result:null}),input.transitionId,input.operationId),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.actor.actorId')=?),1,json('x_redaction_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash,actor.actorId),
    ]);
    return this.exportOperation(input.transitionId,input.operationId);
  }
  async commitXRedaction(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],local?:{input:Omit<AcceptedOperation,"payloadHash"|"expectedState">;actor:ScheduleReceiptActor}) {
    if(local && local.input.codec.id!=="x-posts.local_redaction") throw new Error("Atomic local X redaction codec required");
    const prepared=local?await this.prepareAdmission(local.input,true,local.actor.actorId):undefined;
    const receipt=local?null:await this.readXRedactionReceipt(id,operationId),actor=local?.actor??receipt?.actor;
    if(!actor || !statements.length) throw new Error("Missing original X redaction actor/batch");
    const postId=String(local?.input.payload.postId??receipt!.operation.payload.postId),key=local?"sourceReceipt":"nativeReceipt";
    const result=await this.commitOperation(id,operationId,generation,[statements[0],
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json_object('found',json('true'),'changed',json(iif(changes()>0,'true','false')))) WHERE transition_id=? AND operation_id=?`).bind(id,operationId),
      ...statements.slice(1),
      this.db.prepare(`INSERT INTO admin_audit_logs(event_type,resource_type,resource_id,action,status,actor_id,actor_name,actor_ip,target_count,success_count,failure_count,detail,created_at)
        SELECT 'x_post.redacted','x_post',?,'redact',iif(json_extract(envelope_json,'$.${key}.result.changed'),'success','skipped'),?,?,?,1,json_extract(envelope_json,'$.${key}.result.changed'),0,'{"reason":"admin"}',? FROM content_transition_operations WHERE transition_id=? AND operation_id=?`)
        .bind(postId,actor.actorId,actor.actorName,actor.actorIp,Date.now(),id,operationId),
    ],[],prepared);
    return result;
  }
  async prepare(plan: TransitionPlan): Promise<void> {
    validateClassifications(plan);
    if(plan.assetBuckets && plan.assetBuckets[this.site===plan.sourceSite?"source":"target"]!==this.fileResource) throw new Error("Selected bucket differs from approved transition file resource");
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
  async appendClassifications(id:string,parent:ManifestRevision["parent"],additions:TransitionPlan["classifications"],digest:string,protection:ManifestRevision["protection"],originAdditions:NonNullable<TransitionPlan["fileOrigins"]>=[]):Promise<ManifestRevision> {
    const row=await this.row(id);
    if(this.side(row)!=="source") throw new Error("Only source proposes a manifest revision");
    const duplicate=await this.db.prepare("SELECT receipt_json FROM content_transition_manifest_revisions WHERE transition_id=? AND revision=?").bind(id,parent.revision+1).first<string>("receipt_json");
    if(duplicate) {
      const existing:ManifestRevision=JSON.parse(duplicate);
      const priorCount=existing.plan.classifications.length-additions.length;
      if(existing.parent.digest!==parent.digest || existing.plan.manifestDigest!==digest || JSON.stringify(existing.plan.classifications.slice(priorCount))!==JSON.stringify(additions) || JSON.stringify((existing.plan.fileOrigins??[]).slice((existing.plan.fileOrigins?.length??0)-originAdditions.length))!==JSON.stringify(originAdditions) || JSON.stringify(existing.protection)!==JSON.stringify(protection)) throw new Error("Conflicting manifest revision");
      if(row.fence_json) throw new Error("Manifest is frozen");
      return existing;
    }
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const revision:ManifestRevision={plan:{...plan,manifestDigest:digest,classifications:[...plan.classifications,...additions],...(originAdditions.length?{fileOrigins:[...plan.fileOrigins??[],...originAdditions]}:{})},parent,revision:parent.revision+1,protection};
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
      if(revision.parent.revision!==row.manifest_revision || revision.parent.digest!==row.manifest_digest || revision.revision!==row.manifest_revision+1 || !revision.plan.manifestDigest || revision.plan.manifestDigest===row.manifest_digest || JSON.stringify(revision.plan.members)!==JSON.stringify(plan.members) || JSON.stringify(revision.plan.assetBuckets)!==JSON.stringify(plan.assetBuckets) || JSON.stringify(revision.plan.classifications.slice(0,plan.classifications.length))!==JSON.stringify(plan.classifications) || JSON.stringify((revision.plan.fileOrigins??[]).slice(0,plan.fileOrigins?.length??0))!==JSON.stringify(plan.fileOrigins??[]) || revision.plan.classifications.length===plan.classifications.length && (revision.plan.fileOrigins?.length??0)<=(plan.fileOrigins?.length??0)) throw new Error("Manifest parent or append-only classification conflict");
    if(!revision.protection.receiptId || revision.protection.protocol!==row.protocol || revision.protection.manifestDigest!==revision.plan.manifestDigest) throw new Error("Manifest protection receipt mismatch");
    const additions=revision.plan.classifications.slice(plan.classifications.length);
    const originAdditions=(revision.plan.fileOrigins??[]).slice(plan.fileOrigins?.length??0);
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
      this.db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT m.transition_id,m.root_table,m.root_key FROM content_transition_membership m JOIN asset_file_reference_paths f ON f.row_table=m.row_table AND f.row_key=m.row_key JOIN json_each(?) o ON json_extract(o.value,'$.origin')=f.origin WHERE m.transition_id=?").bind(JSON.stringify(originAdditions),row.id),
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
  async armFileInventory(id:string,inventoryId:string):Promise<void> {
    const row=await this.row(id);
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    if(this.side(row)!=="source" || row.phase!=="prepared" || !inventoryId || !plan.assetBuckets || plan.assetBuckets.source!==this.fileResource) throw new Error("Inventory arm requires prepared selected source/bucket");
    const existing=await this.db.prepare("SELECT plan_json,manifest_revision FROM content_transition_file_inventories WHERE transition_id=? AND inventory_id=?").bind(id,inventoryId).first<{plan_json:string;manifest_revision:number}>();
    if(existing) {if(existing.plan_json!==row.plan_json || existing.manifest_revision!==row.manifest_revision) throw new Error("Conflicting inventory arm");return;}
    try { await this.db.batch([
      this.db.prepare(`WITH guard AS MATERIALIZED(SELECT ${manifestResolvedSql()} valid FROM content_transitions t WHERE id=? AND phase='prepared' AND plan_json=? AND manifest_revision=? AND local_site=? AND local_resource=?) SELECT iif(coalesce((SELECT valid FROM guard),0),1,json('inventory_arm_conflict'))`).bind(id,row.plan_json,row.manifest_revision,this.site,this.resource),
      this.db.prepare("INSERT INTO content_transition_file_inventories(transition_id,inventory_id,plan_json,manifest_revision) VALUES(?,?,?,?)").bind(id,inventoryId,row.plan_json,row.manifest_revision),
      this.db.prepare(`INSERT INTO content_transition_file_inventory_rows(transition_id,inventory_id,kind,identity,value_json) SELECT ?,?,'reference',identity,value_json FROM (${inventoryReferencesSql("?")})`).bind(id,inventoryId,...Array.from({length:(inventoryReferencesSql("?").match(/\?/g)??[]).length},()=>row.plan_json)),
      this.db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM asset_file_cleanup c WHERE NOT EXISTS(SELECT 1 FROM asset_file_references safe WHERE safe.logical_key=c.logical_key AND safe.version_key<>c.object_key) AND (EXISTS(SELECT 1 FROM content_transition_file_inventory_rows r WHERE r.transition_id=? AND r.inventory_id=? AND json_extract(r.value_json,'$.logicalKey')=c.object_key) OR EXISTS(SELECT 1 FROM json_each(?,'$.members') m WHERE c.object_key LIKE 'members/'||json_extract(m.value,'$.code')||'/backgrounds/%'))),1,json('inventory_cleanup_conflict'))`).bind(id,inventoryId,row.plan_json),
    ]); } catch(error) {throw new Error("Inventory arm manifest/reference/cleanup conflict",{cause:error});}
  }
  async protect(id: string, receipt: { receiptId: string; protocol: number; manifestDigest: string; inventoryId?:string }) {
    const row = await this.row(id);
    if (this.side(row) !== "source" || receipt.protocol !== row.protocol || receipt.manifestDigest !== row.manifest_digest || !receipt.receiptId) throw new Error("Invalid protection receipt");
    if (row.protection_receipt_json === JSON.stringify(receipt) && row.phase !== "prepared") return;
    if (row.phase !== "prepared") throw new Error("Protection cannot replace an active transition");
    if(row.maintenance_state!=='stopped'||!row.maintenance_proof_json) throw new Error('Protection requires the verified final maintenance stop');
    const needsInventory=!!(JSON.parse(row.plan_json) as TransitionPlan).assetBuckets;
    if(needsInventory && !receipt.inventoryId) throw new Error("Explicit observed file inventory required before baseline protection");
    let result:D1Result[];
    try { result=await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND maintenance_state='stopped' AND maintenance_proof_json=? AND phase='prepared'),1,json('content_transition_maintenance_stopped'))").bind(id,row.maintenance_proof_json),
      ...(needsInventory?[this.db.prepare(`SELECT iif(coalesce((SELECT ${inventorySealValidSql("?")} FROM content_transitions t WHERE id=? AND local_site=? AND local_resource=? AND phase='prepared'),0),1,json('inventory_seal_conflict'))`).bind(receipt.inventoryId!,id,this.site,this.resource)]:[]),
      this.db.prepare("UPDATE content_transitions SET phase='protected',protection_receipt_json=? WHERE id=? AND phase='prepared'").bind(JSON.stringify(receipt), id),
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,'baseline')").bind(id),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq) SELECT 1,id,'baseline',generation-1,(phase='protected' AND ${manifestResolvedSql()}),(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline') FROM content_transitions t WHERE id=?`).bind(id, id),
      ...seedScopeStatements(this.db, id), ...captureStatements(this.db, id),
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=${sourceJsonValidSql("content_transition_permits.transition_id")} WHERE transition_id=?`).bind(id),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id='baseline'").bind(id),
      ...(needsInventory?[this.db.prepare("UPDATE content_transition_file_inventories SET state='sealed',source_boundary=(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline' AND sealed=1) WHERE transition_id=? AND inventory_id=? AND state='observed'").bind(id,id,receipt.inventoryId!)]:[]),
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
    const receipt = { ...identity(row), receiptId, expiresAt,receiverContract:TRANSITION_RECEIVER_CONTRACT };
    const previous:IngressReadiness|null=row.readiness_json?JSON.parse(row.readiness_json):null;
    if(row.fence_json || !["prepared","target_ingress_ready"].includes(row.phase)) throw new Error("Ingress readiness is frozen");
    if(!await this.db.prepare(`SELECT 1 ready FROM content_transitions t WHERE t.id=? AND ${nativeIngressBaselineSql("t")}`).bind(id).first("ready")) throw new Error("Native ingress requires a verified complete baseline and valid target members");
    if(row.readiness_json===JSON.stringify(receipt)) return receipt;
    if(previous && (receiptId===previous.receiptId || expiresAt<=previous.expiresAt)) throw new Error("Readiness renewal must preserve receipt identity and advance expiry");
    const result = await this.db.prepare(`UPDATE content_transitions AS t SET phase='target_ingress_ready',readiness_json=?,readiness_expires_at=? WHERE id=? AND phase IN ('prepared','target_ingress_ready') AND fence_json IS NULL AND readiness_json IS ? AND manifest_digest=? AND manifest_revision=? AND ${nativeIngressBaselineSql("t")}`).bind(JSON.stringify(receipt), expiresAt, id,row.readiness_json,row.manifest_digest,row.manifest_revision).run();
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
  private async prepareAdmission(input: Omit<AcceptedOperation,"payloadHash"|"expectedState">,localSchedule=false,actorId:string|null=null,nativeActor:ScheduleReceiptActor|null=null,nativeDDay:{actorId:string;command:DDayCommand;result:null}|null=null,nativePending:{actor:ScheduleReceiptActor}|null=null,chzzkScan=false,nativeRedaction=false,nativeSong=false,nativeEntity=false,nativePublication=false,nativeDelete=false,channelMutation=false,nativeProposal=false,nativeMember=false,videoMutation=false,videoContext?:ProjectionContext,nativeReviewDeletion=false,nativeCandidateReview=false,aiUnknown=false): Promise<PreparedAdmission> {
    let operation:AcceptedOperation={...input,payloadHash:"",expectedState:null};
    const row = await this.row(operation.transitionId);
    if(!aiUnknown && (row.maintenance_state!=='open'||this.side(row)==='target'&&!['target_owned','complete'].includes(row.phase))) throw new TransitionMaintenanceError();
    if(['otw-play.ai.unknown','otw-play.ai.resume'].includes(operation.codec.id) && (!aiUnknown||this.side(row)!=='source')) throw new Error('AI unknown admission requires its verified original owning attempt');
    if(operation.codec.id==='otw-play.conversion-outcome.local'&&(!localSchedule||this.side(row)!=='source')) throw new Error('Local conversion outcome requires its original atomic batch');
    if(operation.codec.id==='otw-play.conversion-outcome.mutate'&&(!nativeCandidateReview||this.side(row)!=='target')) throw new Error('Native conversion outcome requires its original actor');
    if(operation.codec.id==='otw-play.candidate.local'&&(!localSchedule||this.side(row)!=='source')) throw new Error('Local candidate review requires its atomic source batch');
    if(operation.codec.id==='otw-play.candidate.mutate'&&(this.side(row)!=='target'||!nativeCandidateReview)) throw new Error('Native candidate review requires its own actor receipt');
    if(operation.codec.id==='otw-play.review.delete_local'&&(!localSchedule||this.side(row)!=='source')) throw new Error('Local review deletion requires its atomic source batch');
    if(operation.codec.id==='otw-play.review.delete'&&(this.side(row)!=='target'||!nativeReviewDeletion)) throw new Error('Native review deletion requires its own actor receipt');
    if(operation.codec.id==="otw-play.member.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local member submission requires its atomic source batch");
    if(operation.codec.id==="otw-play.member.mutate" && (this.side(row)!=="target" || !nativeMember)) throw new Error("Native member submission requires its own actor receipt");
    if(operation.codec.id==="otw-play.proposal.reject_local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local proposal rejection requires its atomic source batch");
    if(operation.codec.id==="otw-play.proposal.reject" && (this.side(row)!=="target" || !nativeProposal)) throw new Error("Native proposal rejection requires its own actor receipt");
    if(["otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve"].includes(operation.codec.id) && !videoMutation) throw new Error("Video mutation requires original actor and registered requests");
    if(operation.codec.id==="otw-play.channel.mutate" && !channelMutation) throw new Error("Channel mutation requires original actor and request registration");
    if(operation.codec.id==="otw-play.song.local_update" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local song mutation requires its atomic source batch");
    if(["otw-play.song.mutate","otw-play.song.create"].includes(operation.codec.id) && (this.side(row)!=="target" || !nativeSong)) throw new Error("Native song mutation requires its actual target actor receipt");
    if(operation.codec.id==="otw-play.entity.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local entity mutation requires its atomic source batch");
    if(operation.codec.id==="otw-play.entity.mutate" && (this.side(row)!=="target" || !nativeEntity)) throw new Error("Native entity mutation requires its actual target actor receipt");
    if(operation.codec.id==="otw-play.delete.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local deletion requires its atomic source batch");
    if(operation.codec.id==="otw-play.delete.mutate" && (this.side(row)!=="target" || !nativeDelete)) throw new Error("Native deletion requires its actual target actor receipt");
    if(operation.codec.id==="otw-play.publication.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local publication requires its atomic source batch");
    if(operation.codec.id==="otw-play.publication.mutate" && (this.side(row)!=="target" || !nativePublication)) throw new Error("Native publication requires its actual target actor receipt");
    if(operation.codec.id==="schedules.chzzk_scan" && !chzzkScan) throw new Error("CHZZK scan requires atomic original request registration");
    if(operation.codec.id==="schedules.collector_local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local collector requires its atomic source batch");
    if(operation.codec.id==="schedules.collector" && this.side(row)!=="target") throw new Error("Native collector requires target-local admission");
    if(operation.codec.id==="schedules.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local schedule admission requires its atomic source mutation");
    if(operation.codec.id==="notices.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local notice admission requires its atomic source mutation");
    if(operation.codec.id==="notices.mutate" && this.side(row)!=="target") throw new Error("Native notice command requires target-local admission");
    if(operation.codec.id==="ddays.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local D-day requires its atomic source mutation");
    if(operation.codec.id==="pending.local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local pending command requires its atomic source mutation");
    if(operation.codec.id==="schedules.live_local" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local live fill requires its atomic source mutation");
    if(operation.codec.id==="schedules.live_fill" && this.side(row)!=="target") throw new Error("Native live fill requires target-local admission");
    if(operation.codec.id==="pending.mutate" && (this.side(row)!=="target" || !nativePending)) throw new Error("Native pending command requires its own target receipt");
    if(["ddays.create","ddays.mutate"].includes(operation.codec.id) && (this.side(row)!=="target" || !nativeDDay)) throw new Error("Native D-day requires its target-local owning receipt");
    if(nativeActor && (this.side(row)!=="target" || operation.codec.id!=="schedules.mutate")) throw new Error("Native schedule receipt requires target admission");
    if(operation.codec.id==="x-posts.local_redaction" && (!localSchedule || this.side(row)!=="source")) throw new Error("Local X redaction requires its atomic source batch");
    if(operation.codec.id==="x-posts.redact" && (this.side(row)!=="target" || !nativeRedaction)) throw new Error("Deferred X redaction requires its target-local administrator receipt");
    if(["x-posts.redact","x-posts.local_redaction"].includes(operation.codec.id) && (await this.findRedactionTransition(String(operation.payload.postId)))?.id!==row.id) throw new Error("Redaction command is outside actual owning references");
    if(operation.codec.id==="assets.replace" && (await this.findFileTransition(String(operation.payload.logicalKey)))?.id!==row.id) throw new Error("File command is outside the actual owning references");
    if (!canAdmit(this.side(row), row.phase)) throw new Error("Admission moved to the target site");
    if(this.side(row)==="target" && !["target_owned","complete"].includes(row.phase) && (!row.readiness_json || JSON.parse(row.readiness_json).receiverContract!==TRANSITION_RECEIVER_CONTRACT)) throw new Error("Incompatible compiled receiver readiness contract");
    if (!operation.operationId || !operation.idempotencyKey || operation.validation.contract !== row.protocol) throw new Error("Invalid admitted operation");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    let context:ProjectionContext=videoContext??{sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:this.side(row)==="source"?member.uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))};
    if(operation.codec.id==="schedules.mutate" || operation.codec.id==="schedules.local") {
      const parsed=parseScheduleCommand(operation.payload);
      if(!parsed) throw new Error("Invalid schedule mutation");
      const existing=await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(row.id,operation.operationId).first<string>("envelope_json");
      const original=existing?JSON.parse(existing):null;
      const condition=parsed.action==="delete"?"id=?":"(member_uid=? AND date=?) OR id=?";
      const parameters=parsed.action==="delete"?[parsed.id]:[parsed.input.member_uid,parsed.input.date,parsed.input.id];
      const expectedRows=original?(this.side(row)==="source"?original.sourceCommand.payload.expectedRows:original.payload.expectedRows):(await this.db.prepare(`SELECT ${contentDispositionRegistry.schedules.values.join(",")} FROM schedules WHERE ${condition} ORDER BY id`).bind(...parameters).all<Record<string,string|number|null>>()).results;
      if(this.side(row)==="source") {
        const missing=[...new Set([...expectedRows.map((value:Record<string,string|number|null>)=>value.member_uid),...(parsed.action!=="delete"?[parsed.input.member_uid]:[])])].filter(uid=>!context.members.some(member=>member.uid===uid));
        for(const uid of missing) {
          const member=await this.db.prepare("SELECT uid,name FROM members WHERE uid=?").bind(uid).first<{uid:number;name:string}>();
          if(!member) throw new Error("Unknown original schedule member");
          context={...context,members:[...context.members,{...member,targetUid:null,externalEntityId:null}]};
        }
      }
      operation={...operation,payload:{...parsed,expectedRows}};
    }
    const command=await parseTransitionCommand(operation,context,this.side(row));
    let sourceCommand=this.side(row)==="source"?await parseTransitionCommand(operation,{...context,entities:[],members:context.members.map(member=>({...member,targetUid:member.uid}))},"source"):null;
    if(sourceCommand?.codec.id==='otw-play.candidate.convert') {
      const original=parseVideoReadCommand(operation.codec.id,operation.payload),privateCommand=parseVideoReadCommand(sourceCommand.codec.id,sourceCommand.payload);
      if(original?.action!=='candidate_convert'||privateCommand?.action!=='candidate_convert') throw new Error('Missing original source conversion scope');
      // Historical job IDs belong to the projected target command. Source-only
      // execution keeps its original live job predicate and private identity.
      sourceCommand={...sourceCommand,payload:{...privateCommand,input:{...privateCommand.input,jobId:original.input.jobId}}};
    }
    const expectedState=null;
    operation={transitionId:operation.transitionId,operationId:operation.operationId,idempotencyKey:operation.idempotencyKey,kind:operation.kind,subject:{table:operation.subject.table,key:operation.subject.key},expectedVersion:operation.expectedVersion,expectedState,validation:{contract:operation.validation.contract,validatedAt:operation.validation.validatedAt},admittedAt:operation.admittedAt,...command,payloadHash:await digestText(JSON.stringify({...command,expectedState}))};
    assertOperationMetadata(operation);
    const phases = this.side(row) === "source" ? "'prepared','protected','copying','replaying','target_ingress_ready'" : "'target_ingress_ready','source_fenced','target_owned','complete'";
    const insert=this.db.prepare(`INSERT OR IGNORE INTO content_transition_operations(transition_id,operation_id,idempotency_key,payload_hash,generation,admitted_at,envelope_json)
      SELECT id,?,?,?,${this.side(row) === "source" ? "generation-1" : "generation"},?,? FROM content_transitions WHERE id=? AND phase IN (${phases})
        AND ${aiUnknown?"local_site=source_site":"maintenance_state='open'"} ${this.side(row)==="target"?"AND phase IN ('target_owned','complete')":""}`)
      .bind(operation.operationId, operation.idempotencyKey, operation.payloadHash, operation.admittedAt, JSON.stringify(sourceCommand?{...operation,sourceCommand,...(localSchedule?{sourceReceipt:{actorId,command:input.payload,result:null}}:{})}:nativePending?{...operation,nativeReceipt:nativePending}:nativeDDay?{...operation,nativeReceipt:nativeDDay}:nativeActor?{...operation,nativeReceipt:{actor:nativeActor,command:input.payload,result:null}}:operation), operation.transitionId);
    return {row,operation,sourceCommand,insert};
  }
  async admit(input: Omit<AcceptedOperation,"payloadHash"|"expectedState">): Promise<OperationEnvelope> {
    const {operation,insert}=await this.prepareAdmission(input);
    await insert.run();
    const received = await this.readOperation(operation.transitionId, operation.operationId);
    if (!received) throw new Error("Admission conflict or fence race");
    const actualAdmission=Object.fromEntries(Object.entries(received).filter(([key])=>!["generation","sourceSequence","sourceFence","attempt","outcome"].includes(key)));
    if(JSON.stringify(actualAdmission)!==JSON.stringify(operation)) throw new Error("Admission identity conflict");
    return received;
  }
  async admitChzzkScan(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">) {
    if(input.codec.id!=="schedules.chzzk_scan") throw new Error("Expected registered CHZZK scan");
    const command=parseChzzkScanCommand(input.payload);
    if(!command) throw new Error("Invalid original CHZZK scan");
    const prior=await this.db.prepare("SELECT envelope_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(input.transitionId,input.operationId).first<string>("envelope_json");
    const state=chzzkScanState(command.members.map(member=>member.uid));
    const row=await this.row(input.transitionId);
    const expectedState=prior?(this.side(row)==="source"?JSON.parse(prior).sourceCommand.payload.expectedState:JSON.parse(prior).payload.expectedState):await this.db.prepare(`SELECT ${state.sql} state`).bind(...state.bindings).first<string>("state");
    const prepared=await this.prepareAdmission({...input,payload:{...input.payload,expectedState}},false,null,null,null,null,true);
    const guards=command.members.map(member=>this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM members WHERE uid=? AND code=? AND coalesce(is_deprecated,0)<>1 AND content_access='normal' AND instr(lower(url_chzzk),'chzzk.naver.com/'||?)>0),1,json('invalid_scan_member'))`).bind(member.uid,member.code,member.channelId));
    await this.db.batch([prepared.insert,
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=?),1,json('scan_admission_conflict'))").bind(input.transitionId,input.operationId,prepared.operation.payloadHash),
      ...guards,...await D1ChzzkReadJournal.registration(this.db,prepared.operation,command),
      ...new D1ChzzkContinuationStore(this.db).registration(prepared.operation,command),
    ]);
    return this.exportOperation(input.transitionId,input.operationId);
  }
  async readOperation(id: string, operationId: string): Promise<OperationEnvelope | null> {
    const transition=await this.row(id,true);
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
    if(operation.codec.id==="schedules.local") throw new Error("A local schedule receipt has no deferred execution authority");
    if(operation.codec.id==="otw-play.member.local") throw new Error("A local submission has no deferred execution authority");
    if(operation.codec.id==='otw-play.candidate.local') throw new Error('Local candidate review has no deferred execution authority');
    if(operation.codec.id==='otw-play.review.delete_local') throw new Error('Local review deletion has no deferred execution authority');
    if(operation.codec.id==="otw-play.proposal.reject_local") throw new Error("A local rejection has no deferred execution authority");
    if(operation.codec.id==="x-posts.local_redaction") throw new Error("A local X redaction has no deferred execution authority");
    if(operation.codec.id==="otw-play.song.local_update") throw new Error("A local song mutation has no deferred execution authority");
    if(operation.codec.id==="otw-play.entity.local") throw new Error("A local entity mutation has no deferred execution authority");
    if(operation.codec.id==="otw-play.delete.local") throw new Error("A local deletion has no deferred execution authority");
    if(operation.codec.id==="otw-play.publication.local") throw new Error("A local publication has no deferred execution authority");
    if(operation.codec.id==="notices.local") throw new Error("A local notice receipt has no deferred execution authority");
    if(operation.codec.id==="ddays.local") throw new Error("A local D-day receipt has no deferred execution authority");
    if(operation.codec.id==="pending.local") throw new Error("A local pending receipt has no deferred execution authority");
    if(operation.codec.id==="schedules.live_local") throw new Error("A local live-fill receipt has no deferred execution authority");
    if(operation.outcome) throw new Error("Operation already has a terminal disposition");
    if(side==="target") return {codec:operation.codec,payload:operation.payload};
    const local=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceCommand') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>("value");
    if(!local) throw new Error("Missing validated source-local command");
    return JSON.parse(local);
  }
  async receiveOperation(envelope: OperationEnvelope): Promise<{ operationId: string; payloadHash: string }> {
    if(envelope.codec.id==="otw-play.member.mutate") throw new Error("Native member submission cannot transfer from source");
    if(envelope.codec.id==="otw-play.member.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local member submission can transfer");
    if(envelope.codec.id==='otw-play.candidate.mutate') throw new Error('Native candidate review cannot transfer from source');
    if(envelope.codec.id==='otw-play.candidate.local'&&(envelope.outcome?.outcome!=='committed'||!envelope.outcome.sideEffectReconciled||envelope.attempt!==null)) throw new Error('Only committed local candidate review can transfer');
    if(envelope.codec.id==='otw-play.review.delete') throw new Error('Native review deletion cannot transfer from source');
    if(envelope.codec.id==='otw-play.review.delete_local'&&(envelope.outcome?.outcome!=='committed'||!envelope.outcome.sideEffectReconciled||envelope.attempt!==null)) throw new Error('Only committed local review deletion can transfer');
    if(envelope.codec.id==="otw-play.proposal.reject") throw new Error("Native rejection cannot transfer from source");
    if(envelope.codec.id==="otw-play.proposal.reject_local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local rejection can transfer");
    if(["otw-play.song.mutate","otw-play.song.create"].includes(envelope.codec.id)) throw new Error("Native song mutation cannot transfer from source");
    if(envelope.codec.id==="otw-play.delete.mutate") throw new Error("Native deletion cannot transfer from source");
    if(envelope.codec.id==="otw-play.delete.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local deletion can transfer");
    if(envelope.codec.id==="otw-play.publication.mutate") throw new Error("Native publication cannot transfer from source");
    if(envelope.codec.id==="otw-play.publication.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local publication can transfer");
    if(envelope.codec.id==="otw-play.entity.mutate") throw new Error("Native entity mutation cannot transfer from source");
    if(envelope.codec.id==="otw-play.entity.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local entity mutation can transfer");
    if(envelope.codec.id==="x-posts.redact") throw new Error("Native X redaction cannot transfer from source");
    if(envelope.codec.id==="x-posts.local_redaction" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local X redaction can transfer");
    if(envelope.codec.id==="otw-play.song.local_update" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local song mutation can transfer");
    if(envelope.codec.id==="pending.mutate") throw new Error("Native pending receipt cannot transfer from the source");
    if(envelope.codec.id==="schedules.live_fill") throw new Error("Native live-fill receipt cannot transfer from the source");
    if(envelope.codec.id==="ddays.create" || envelope.codec.id==="ddays.mutate") throw new Error("Native D-day receipt cannot transfer from the source");
    const row = await this.row(envelope.transitionId);
    if (this.side(row) !== "target" || !canAdmit("target", row.phase) || envelope.generation !== row.generation-1) throw new Error("Transfer receiver is not ready for this generation");
    if(Object.keys(envelope).sort().join(",")!=="admittedAt,attempt,codec,expectedState,expectedVersion,generation,idempotencyKey,kind,operationId,outcome,payload,payloadHash,sourceFence,sourceSequence,subject,transitionId,validation") throw new Error("Unknown operation envelope field");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    const context={sourceSite:plan.sourceSite,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))};
    const command=await parseTransitionCommand(envelope,context,"target");
    assertOperationMetadata(envelope);
    assertOperationEvidence(envelope);
    if(envelope.outcome?.chzzkScan && envelope.codec.id!=="schedules.chzzk_scan") throw new Error("CHZZK control cannot authorize another command");
    if(envelope.outcome && (Boolean(envelope.outcome.youtubeVideo)!==["otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve"].includes(envelope.codec.id) || Boolean(envelope.outcome.youtubeChannel)!==(envelope.codec.id==="otw-play.channel.mutate"))) throw new Error("Original YouTube outcome control mismatch");
    if(envelope.codec.id==="schedules.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local schedule receipt can transfer");
    if(envelope.codec.id==="notices.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local notice receipt can transfer");
    if(envelope.codec.id==="ddays.local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local D-day receipt can transfer");
    if(envelope.codec.id==="pending.local" && (!envelope.outcome?.sideEffectReconciled || !["committed","conflicted"].includes(envelope.outcome.outcome) || envelope.attempt!==null)) throw new Error("Only a terminal local pending receipt can transfer");
    if(envelope.codec.id==="schedules.live_local" && (!envelope.outcome?.sideEffectReconciled || !["committed","conflicted"].includes(envelope.outcome.outcome) || envelope.attempt!==null)) throw new Error("Only a terminal local live-fill receipt can transfer");
    if(envelope.codec.id==="schedules.collector_local" && (envelope.outcome?.outcome!=="committed" || !envelope.outcome.sideEffectReconciled || envelope.attempt!==null)) throw new Error("Only a committed local collector batch can transfer");
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
    if(envelope.outcome?.aiReview||envelope.outcome?.aiReviewResult||envelope.outcome?.outcome==='administratively_closed') throw new Error('AI responsibility cannot reconcile file effects');
    const row = await this.row(envelope.transitionId);
    if (this.side(row) !== "target" || !canAdmit("target", row.phase) || envelope.generation !== row.generation-1) throw new Error("File receiver is not ready");
    if(!Number.isSafeInteger(envelope.sourceSequence) || envelope.sourceSequence!<1) throw new Error("Missing source file sequence");
    const final=finalTransfer(row,envelope.sourceFence,envelope.sourceSequence,"file");
    assertOperationEvidence({attempt:null,outcome:envelope.outcome});
    if(envelope.outcome?.chzzkScan || envelope.outcome?.youtubeChannel || envelope.outcome?.youtubeVideo) throw new Error("Provider read control cannot reconcile a file effect");
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
    if(row.maintenance_state!=='stopped'||!row.maintenance_proof_json) throw new Error('Source fence requires verified maintenance stop');
    assertReadiness(identity(row), row.readiness_json ? JSON.parse(row.readiness_json) : null, now);
    await this.aiAdoption?.adoptPending(id,reviewId=>this.adoptPendingAiReview(id,reviewId));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.checkpoints_json));
    const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,"0")).join("");
    let changed=0;
    try { const results = await this.db.batch([
      // A read-only guard in the same D1 transaction avoids compiling the
      // recursive sealed-file parser into the already large final CAS program.
      // Invalid JSON deliberately aborts the whole batch; there is no guard write.
      this.db.prepare(`SELECT iif(coalesce((SELECT ${sealedFileReferencesResolvedSql()} FROM content_transitions t WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND protocol=? AND manifest_revision=? AND manifest_digest=?),0),1,json('content_transition_sealed_file_manifest_conflict'))`).bind(id,this.site,this.resource,row.generation,row.protocol,row.manifest_revision,row.manifest_digest),
      this.db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM music_ai_reviews r JOIN content_transition_membership m ON m.row_table='music_ai_reviews' AND m.row_key=json_array(r.id) WHERE m.transition_id=? AND r.status IN ('queued','running','retry_wait') AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=m.transition_id AND o.source_seq IS NULL AND o.generation=? AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.ai.unknown','otw-play.ai.resume') AND json_extract(o.envelope_json,'$.sourceCommand.payload.reviewId')=r.id AND json_type(o.envelope_json,'$.sourceReceipt.aiReview')='object')),1,json('ai_pending_adoption_fence_race'))`).bind(id,row.generation-1),
      this.db.prepare(`UPDATE content_transitions AS t SET phase=iif((${identityProjectionValidSql()}),'source_fenced',NULL),manifest_revision=iif(${manifestResolvedSql()},manifest_revision,NULL),fence_json=json_patch(?,json_object(
      'boundary',coalesce((SELECT max(seq) FROM content_transition_commits WHERE transition_id=? AND sealed=1),0),
      'checkpointDigest',?,'maintenanceDigest',?,'checkpoints',json(checkpoints_json),'sourceCatalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),
      'operationBoundary',(SELECT coalesce(max(seq),0) FROM content_transition_operations WHERE transition_id=?),
      'operationCount',(SELECT count(*) FROM content_transition_operations WHERE transition_id=?),
      'fileIntentBoundary',(SELECT coalesce(max(seq),0) FROM content_transition_file_intents WHERE transition_id=?),
      'fileIntentCount',(SELECT count(*) FROM content_transition_file_intents WHERE transition_id=?)))
      WHERE id=? AND phase='target_ingress_ready' AND fence_json IS NULL AND readiness_expires_at>? AND checkpoint_revision=? AND manifest_digest=? AND manifest_revision=? AND readiness_json=? AND json_extract(readiness_json,'$.receiverContract')=?
      AND maintenance_state='stopped' AND maintenance_proof_json=?
      AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND o.source_seq IS NULL AND o.generation=t.generation-1
        AND json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.channel_approve' AND coalesce(json_extract(o.outcome_json,'$.sideEffectReconciled'),0)<>1
        AND (NOT EXISTS(SELECT 1 FROM content_transition_chzzk_requests r JOIN content_transition_commits c ON c.transition_id=o.transition_id AND c.operation_id=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.snapshot.capture') AND c.sealed=1
          WHERE r.transition_id=o.transition_id AND r.operation_id=o.operation_id AND r.request_key='youtube:videos:0:'||json_extract(o.envelope_json,'$.sourceCommand.payload.videoId')
            AND json_extract(r.response_json,'$.status')='success' AND r.request_hash=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.snapshot.requestHash') AND r.response_hash=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.snapshot.responseHash'))
          OR json_type(o.envelope_json,'$.sourceReceipt.channelApproval.refresh')='object' AND NOT EXISTS(
            SELECT 1 FROM content_transition_chzzk_requests r JOIN content_transition_commits c ON c.transition_id=o.transition_id AND c.operation_id=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.capture') AND c.sealed=1
            WHERE r.transition_id=o.transition_id AND r.operation_id=o.operation_id AND r.request_key='youtube:videos:3:'||json_extract(o.envelope_json,'$.sourceCommand.payload.videoId')
              AND json_extract(r.response_json,'$.status')='observation' AND r.request_hash=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.requestHash') AND r.response_hash=json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.responseHash')
              AND json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.payloadHash')=o.payload_hash AND json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.generation')=o.generation
              AND json_extract(o.envelope_json,'$.sourceReceipt.channelApproval.refresh.facts.site')=t.source_site)))
      AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND o.source_seq IS NULL AND o.generation=t.generation-1
        AND json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.refresh'
        AND NOT (coalesce(json_extract(o.outcome_json,'$.sideEffectReconciled'),0)=1 OR EXISTS(
          SELECT 1 FROM content_transition_chzzk_requests r JOIN content_transition_commits c ON c.transition_id=o.transition_id AND c.operation_id=json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.capture') AND c.sealed=1
          WHERE r.transition_id=o.transition_id AND r.operation_id=o.operation_id AND json_extract(r.response_json,'$.status')='observation'
            AND r.request_key=json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.requestKey')
            AND r.request_hash=json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.requestHash')
            AND r.response_hash=json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.responseHash')
            AND json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.payloadHash')=o.payload_hash
            AND json_extract(o.envelope_json,'$.sourceReceipt.metadataStage.generation')=o.generation)))
      AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND o.source_seq IS NULL AND o.generation=t.generation-1
        AND json_extract(o.envelope_json,'$.codec.id')='otw-play.video.mutate'
        AND json_extract(o.envelope_json,'$.sourceCommand.payload.action') IN ('catalog_create','proposal_approve')
        AND json_extract(o.envelope_json,'$.sourceCommand.payload.input.channel.kind')<>'existing'
        AND NOT (coalesce(json_extract(o.outcome_json,'$.sideEffectReconciled'),0)=1 OR
          coalesce(json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.status'),'missing')='ready' AND EXISTS(
            SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=o.transition_id AND r.operation_id=o.operation_id
              AND r.request_key=json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.requestKey')
              AND r.request_hash=json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.requestHash')
              AND r.response_hash=json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.responseHash')
              AND json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.payloadHash')=o.payload_hash
              AND json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.generation')=o.generation
              AND (json_extract(o.envelope_json,'$.sourceCommand.payload.input.channel.kind')<>'recognized_member' OR json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.recognizedChannelAllowed')=EXISTS(
                SELECT 1 FROM members m WHERE m.uid=json_extract(o.envelope_json,'$.sourceCommand.payload.input.channel.memberUid') AND (m.is_deprecated IS NULL OR m.is_deprecated=0)
                  AND (m.youtube_channel_id=json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.externalChannelId') OR EXISTS(SELECT 1 FROM member_links l WHERE l.member_uid=m.uid AND l.youtube_channel_id=json_extract(o.envelope_json,'$.sourceReceipt.dependencyStage.externalChannelId') AND l.enabled=1 AND l.type IN ('youtube_vod','youtube_sub'))))))))`)
      .bind(JSON.stringify(identity(row)), id, digest, await digestText(row.maintenance_proof_json), id,id,id,id,id, now, row.checkpoint_revision,row.manifest_digest,row.manifest_revision,row.readiness_json,TRANSITION_RECEIVER_CONTRACT,row.maintenance_proof_json)]);
      changed=results[2].meta.changes;
    } catch(error) { if(!/NOT NULL constraint failed: content_transitions\.(phase|manifest_revision)|malformed JSON/.test(String(error))) throw error; }
    if (changed !== 1) {
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
    return new D1BaselineStore(this.db,identity(row),JSON.parse(row.plan_json),this.catalogProjection);
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
    const catalog=await importCatalogEffects(this.db,commit.changes,Date.now(),this.catalogProjection);
    const result=await this.db.batch([
      this.db.prepare("PRAGMA defer_foreign_keys=ON"),
      ...catalog.guard,
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(row.id,`replay:${commit.sequence}`),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,version_matches,commit_seq) SELECT 1,id,?,generation,'baseline',coalesce((SELECT max(commit_seq) FROM content_transition_replay WHERE transition_id=?),(SELECT source_boundary FROM content_transition_baselines WHERE transition_id=? AND receipt_json IS NOT NULL),0)=?,(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions WHERE id=? AND phase IN ('target_ingress_ready','source_fenced')")
        .bind(`replay:${commit.sequence}`,row.id,row.id,commit.previous,row.id,`replay:${commit.sequence}`,row.id),
      ...catalog.before,...mutations,...catalog.after,
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
    if(!this.fileAvailability) throw new Error("Required committed-file availability adapter is not connected");
    await this.fileAvailability.assertAvailable({plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,fence});
    const installation:CommittedStateInstallation={boundary:tail!,checkpointDigest:hash,committedFilesAvailable:true};
    await this.db.prepare("UPDATE content_transitions SET installation_json=? WHERE id=? AND phase='source_fenced' AND fence_json=? AND manifest_revision=?").bind(JSON.stringify(installation), id,row.fence_json,row.manifest_revision).run();
  }
  async activate(id: string): Promise<void> {
    const row = await this.row(id);
    if (this.side(row) !== "target") throw new Error("Only target activates");
    if (!row.fence_json || !row.installation_json) throw new Error("Missing durable installation");
    const fence:SourceFence=JSON.parse(row.fence_json);
    const operations=await this.db.prepare("SELECT count(*) n FROM content_transition_operations WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=?").bind(id,fence.operationBoundary,row.generation-1).first<number>("n");
    const files=await this.db.prepare("SELECT count(*) n FROM content_transition_file_intents WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=?").bind(id,fence.fileIntentBoundary,row.generation-1).first<number>("n");
    assertActivation(identity(row), { ...JSON.parse(row.installation_json), fence, transferredOperations:operations!,transferredFileIntents:files! });
    if(row.phase==="target_owned" || row.phase==="complete") {
      if(!await this.db.prepare("SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id='target-capture-start' AND sealed=1").bind(id).first()) throw new Error("Missing original target capture activation");
      return;
    }
    // Seed the actual installed target images before any owner can mutate them.
    // Imported receipts remain separate from this target-local capture boundary.
    await this.db.batch([
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transitions t WHERE id=? AND local_site=? AND local_resource=? AND phase='source_fenced'
        AND generation=? AND fence_json=? AND installation_json=? AND aborted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.resume' AND o.source_seq IS NOT NULL AND (json_extract(o.envelope_json,'$.nativeReceipt.aiResume.stage.handoff.maintenanceDigest') IS NOT json_extract(t.fence_json,'$.maintenanceDigest') OR json_type(o.envelope_json,'$.nativeReceipt.aiResume.stage.handoff.stageHash') IS NOT 'text'))
        AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND o.source_seq IS NOT NULL AND
          (json_extract(o.envelope_json,'$.nativeReceipt.aiUnknown.handoff.maintenanceDigest') IS NOT json_extract(t.fence_json,'$.maintenanceDigest') OR json_type(o.envelope_json,'$.nativeReceipt.aiUnknown.handoff.stageHash') IS NOT 'text'))
        AND EXISTS(SELECT 1 FROM music_catalog_meta c JOIN music_public_read_model_meta r ON r.id=c.id WHERE c.id=1 AND c.revision=r.revision)
        AND (SELECT count(*) FROM content_transition_operations o WHERE o.transition_id=t.id AND o.transferred=1 AND o.source_seq<=? AND o.generation=t.generation-1)=?
        AND (SELECT count(*) FROM content_transition_file_intents f WHERE f.transition_id=t.id AND f.transferred=1 AND f.source_seq<=? AND f.generation=t.generation-1)=?),1,json('target_activation_proof_conflict'))`)
        .bind(id,this.site,this.resource,row.generation,row.fence_json,row.installation_json,fence.operationBoundary,operations,fence.fileIntentBoundary,files),
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,'target-capture-start')").bind(id),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,id,'target-capture-start',generation,'baseline',(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='target-capture-start') FROM content_transitions WHERE id=? AND phase='source_fenced'").bind(id,id),
      ...seedScopeStatements(this.db,id),...captureStatements(this.db,id),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id='target-capture-start'").bind(id),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
      this.db.prepare("UPDATE content_transitions SET phase='target_owned',installation_json=json_set(installation_json,'$.catalogRevisionAnchor',(SELECT revision FROM music_catalog_meta WHERE id=1)) WHERE id=? AND phase='source_fenced' AND json_type(installation_json,'$.catalogRevisionAnchor') IS NULL").bind(id),
    ]);
  }
  async targetActivationReceipt(id:string):Promise<import('@contracts/content-transition').TargetActivationReceipt|null> {
    const row=await this.row(id,true);
    const archive=await this.db.prepare('SELECT archive_receipt_json FROM content_transitions WHERE id=?').bind(id).first<string>('archive_receipt_json');
    if(this.side(row)!=='target')throw new Error('Only target reports its actual activation');
    if(row.aborted_at!==null||!['target_owned','complete'].includes(row.phase)||!row.fence_json||!row.installation_json||!archive)return null;
    if(!await this.db.prepare("SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id='target-capture-start' AND sealed=1").bind(id).first())throw new Error('Missing actual target activation boundary');
    return {...identity(row),kind:'target_activated',fence:JSON.parse(row.fence_json),installation:JSON.parse(row.installation_json),archive:JSON.parse(archive)};
  }
  async resumeRemainingSource(receipt:import('@contracts/content-transition').TargetActivationReceipt) {
    const row=await this.row(receipt.id);assertSameTransition(identity(row),receipt);
    const archive=await this.db.prepare('SELECT archive_receipt_json FROM content_transitions WHERE id=?').bind(row.id).first<string>('archive_receipt_json');
    if(this.side(row)!=='source'||row.phase!=='source_fenced'||!row.fence_json||!archive||receipt.kind!=='target_activated'||JSON.stringify(receipt.fence)!==JSON.stringify(JSON.parse(row.fence_json))||JSON.stringify(receipt.archive)!==JSON.stringify(JSON.parse(archive))||receipt.installation.boundary!==receipt.fence.boundary||receipt.installation.checkpointDigest!==receipt.fence.checkpointDigest||!receipt.installation.committedFilesAvailable||!Number.isSafeInteger(receipt.installation.catalogRevisionAnchor)) throw new Error('Source resume requires actual target activation and matching archive proof');
    const proof=JSON.stringify(receipt);
    if(row.maintenance_state==='open'&&row.installation_json===proof)return;
    const result=await this.db.prepare("UPDATE content_transitions SET maintenance_state='open',installation_json=? WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase='source_fenced' AND maintenance_state='stopped' AND fence_json=? AND archive_receipt_json=? AND installation_json IS NULL").bind(proof,row.id,this.site,this.resource,row.generation,row.fence_json,archive).run();
    if(result.meta.changes!==1)throw new Error('Original source resume proof changed');
  }
  async abortTargetBeforeActivation(id:string,now:number):Promise<import('@contracts/content-transition').TargetAbortReceipt|null> {
    const row=await this.row(id,true);
    if(this.side(row)!=='target'||!Number.isSafeInteger(now)||now<0)throw new Error('Invalid target abort authority');
    if(row.aborted_at!==null) {
      const receipt=JSON.parse(row.maintenance_proof_json??'{}').abort;
      if(receipt?.kind!=='target_aborted')throw new Error('Missing immutable target abort receipt');
      return receipt;
    }
    if(['target_owned','complete'].includes(row.phase))return null;
    const receipt:import('@contracts/content-transition').TargetAbortReceipt={...identity(row),kind:'target_aborted',fence:row.fence_json?JSON.parse(row.fence_json):null,abortedAt:now};
    const result=await this.db.prepare(`UPDATE content_transitions SET aborted_at=?,maintenance_state='stopped',maintenance_proof_json=json_object('abort',json(?))
      WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND plan_json=? AND aborted_at IS NULL
        AND phase NOT IN ('target_owned','complete') AND fence_json IS ? AND installation_json IS ?
        AND NOT EXISTS(SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id='target-capture-start')
        AND NOT EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND source_seq IS NULL AND generation=?)`)
      .bind(now,JSON.stringify(receipt),id,this.site,this.resource,row.generation,row.plan_json,row.fence_json,row.installation_json,id,id,row.generation).run();
    if(result.meta.changes!==1)return null;
    return receipt;
  }
  async readTargetAbort(id:string):Promise<import('@contracts/content-transition').TargetAbortReceipt|null> {
    const row=await this.row(id,true);
    if(this.side(row)!=='target')throw new Error('Only target reports its irreversible abort');
    return row.aborted_at===null?null:JSON.parse(row.maintenance_proof_json??'{}').abort??null;
  }
  async resumeSourceAfterAbort(receipt:import('@contracts/content-transition').TargetAbortReceipt,now:number) {
    const row=await this.row(receipt.id,true);assertSameTransition(identity(row),receipt);
    const proof=JSON.stringify(receipt);
    if(this.side(row)!=='source'||receipt.kind!=='target_aborted'||!Number.isSafeInteger(receipt.abortedAt)||receipt.abortedAt<0||!Number.isSafeInteger(now)||now<receipt.abortedAt||receipt.fence&&JSON.stringify(receipt.fence)!==JSON.stringify(row.fence_json?JSON.parse(row.fence_json):null))throw new Error('Wrong immutable target abort proof');
    if(row.aborted_at!==null){if(row.installation_json!==proof)throw new Error('Conflicting abort proof');return;}
    if(row.installation_json)throw new Error('Source already accepted target activation');
    const archive=await this.db.prepare('SELECT archive_receipt_json FROM content_transitions WHERE id=?').bind(row.id).first<string>('archive_receipt_json');
    if(archive&&JSON.parse(archive).restoreEvidence!==1)throw new Error('Original archive lacks exact access restoration evidence');
    const tables=ownedRootTables.filter(table=>(contentDispositionRegistry[table].excluded as readonly string[]).includes('content_access'));
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND plan_json=? AND aborted_at IS NULL AND phase=? AND fence_json IS ? AND archive_receipt_json IS ? AND installation_json IS NULL),1,json('source_abort_proof_race'))").bind(row.id,this.site,this.resource,row.generation,row.plan_json,row.phase,row.fence_json,archive),
      this.db.prepare('UPDATE content_transitions SET installation_json=? WHERE id=?').bind(proof,row.id),
      ...(archive?[
        this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,version_matches,commit_seq) SELECT 1,id,'abort-restore',generation-1,'archive',1,(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='archive') FROM content_transitions WHERE id=? AND local_site=source_site AND phase='source_fenced'").bind(row.id,row.id),
        ...tables.flatMap(table=>[
          this.db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=? AND m.row_table=m.root_table AND m.row_key=m.root_key AND m.archive_previous_access='normal' AND NOT EXISTS(SELECT 1 FROM "${table}" a WHERE ${matchKey(table,'a','m.root_key')} AND a.content_access='admin_archive')),1,json('archive_restore_current_state_conflict'))`).bind(row.id,table),
          this.db.prepare(`UPDATE "${table}" AS a SET content_access='normal' WHERE content_access='admin_archive' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=? AND m.row_table=m.root_table AND m.row_key=m.root_key AND m.archive_previous_access='normal' AND ${matchKey(table,'a','m.root_key')})`).bind(row.id,table),
        ]),
        this.db.prepare('DELETE FROM content_transition_permits WHERE transition_id=?').bind(row.id),
      ]:[]),
      this.db.prepare("UPDATE content_transitions SET aborted_at=?,maintenance_state='open' WHERE id=? AND installation_json=? AND aborted_at IS NULL").bind(now,row.id,proof),
    ]);
  }
  async readLocalScheduleReceipt(operationId:string,actorId:string|null,command:ScheduleCommand):Promise<SaveScheduleResult|null> {
    const result=await this.db.prepare(`SELECT o.envelope_json,o.outcome_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.local_site=t.source_site AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='schedules.local'`).bind(this.site,this.resource,operationId).first<{envelope_json:string;outcome_json:string|null}>();
    if(!result) return null;
    const receipt=JSON.parse(result.envelope_json).sourceReceipt;
    if(!receipt || receipt.actorId!==actorId || JSON.stringify(receipt.command)!==JSON.stringify(command)) throw new Error("Schedule receipt identity conflict");
    if(!result.outcome_json || JSON.parse(result.outcome_json).outcome!=="committed" || !receipt.result) throw new Error("Schedule receipt is not committed");
    return receipt.result;
  }
  async readNativeScheduleReceipt(operationId:string) {
    const value=await this.db.prepare(`SELECT o.transition_id,o.envelope_json FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.local_site=t.target_site AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='schedules.mutate'`).bind(this.site,this.resource,operationId).first<{transition_id:string;envelope_json:string}>();
    if(!value) return null;
    const receipt=JSON.parse(value.envelope_json).nativeReceipt as {actor:ScheduleReceiptActor;command:ScheduleCommand;result:SaveScheduleResult|null}|undefined;
    if(!receipt) return null;
    return {...receipt,operation:(await this.readOperation(value.transition_id,operationId))!};
  }
  async admitNativeSchedule(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,actor:ScheduleReceiptActor) {
    const existing=await this.readNativeScheduleReceipt(input.operationId);
    if(existing) {
      if(existing.actor.actorId!==actor.actorId || JSON.stringify(existing.command)!==JSON.stringify(input.payload) || existing.operation.transitionId!==input.transitionId) throw new Error("Schedule receipt identity conflict");
      return existing.operation;
    }
    const prepared=await this.prepareAdmission(input,false,null,actor);await prepared.insert.run();
    const stored=await this.readNativeScheduleReceipt(input.operationId);
    if(!stored || stored.actor.actorId!==actor.actorId || JSON.stringify(stored.command)!==JSON.stringify(input.payload)) throw new Error("Schedule receipt identity conflict");
    return stored.operation;
  }
  private scheduleReceiptStatements(id:string,operationId:string,statements:D1PreparedStatement[],receipt:ScheduleReceiptDefinition,key:"sourceReceipt"|"nativeReceipt") {
    const before=this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result',json_object('success',json('true'),'action',?,'scheduleId',?,'deletedIds',json((${receipt.deletedIdsSql})))) WHERE transition_id=? AND operation_id=?`).bind(receipt.action,receipt.scheduleId,...receipt.deletedIdsBindings,id,operationId);
    // The owning schedule create ends with its original create audit INSERT.
    // Reading that exact row's schedule_id preserves SQLite autoincrement and
    // records the response in this same transaction without reserving an ID.
    const after=receipt.action==="create"?[this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.result.scheduleId',(SELECT schedule_id FROM update_logs WHERE id=last_insert_rowid())) WHERE transition_id=? AND operation_id=?`).bind(id,operationId)]:[];
    return [before,...statements,...after];
  }
  async commitLocalSchedule(input:Omit<AcceptedOperation,"payloadHash"|"expectedState">,statements:D1PreparedStatement[],receipt:ScheduleReceiptDefinition & {actorId:string|null}) {
    if(input.codec.id!=="schedules.local") throw new Error("Atomic local schedule codec required");
    const prepared=await this.prepareAdmission(input,true,receipt.actorId);
    const result=await this.commitOperation(input.transitionId,input.operationId,prepared.row.generation-1,this.scheduleReceiptStatements(input.transitionId,input.operationId,statements,receipt,"sourceReceipt"),[],prepared);
    return result?{...result,businessResults:result.businessResults.slice(1,1+statements.length)}:result;
  }
  async commitNativeSchedule(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],receipt:ScheduleReceiptDefinition) {
    const native=await this.readNativeScheduleReceipt(operationId);
    if(!native || native.operation.transitionId!==id) throw new Error("Missing native schedule receipt");
    const result=await this.commitOperation(id,operationId,generation,this.scheduleReceiptStatements(id,operationId,statements,receipt,"nativeReceipt"),[]);
    return result?{...result,businessResults:result.businessResults.slice(1,1+statements.length)}:result;
  }
  async commit(id: string, operationId: string, generation: number, statements: D1PreparedStatement[],fileReferences:readonly FileReferenceCommit[]=[]) {
    return this.commitOperation(id,operationId,generation,statements,fileReferences);
  }
  async commitChzzkScan(id:string,operationId:string,generation:number,statements:D1PreparedStatement[],completion:ChzzkScanCompletion) {
    const result=completion.result;
    const operation=await this.exportOperation(id,operationId),command=parseChzzkScanCommand(operation.payload);
    if(operation.codec.id!=="schedules.chzzk_scan" || !command || result.channels!==command.members.length || result.channelResults.some(item=>!command.members.some(member=>member.channelId===item.channelId))) throw new Error("CHZZK result outside original operation");
    assertOperationEvidence({attempt:null,outcome:{outcome:"committed",sideEffectReconciled:true,detail:"Business batch committed",chzzkScan:completion}});
    const executable=parseChzzkScanCommand((await this.readExecutableCommand(id,operationId)).payload);
    if(command.parent && !executable?.parent) throw new Error("Missing owning original parent");
    return this.commitOperation(id,operationId,generation,[...this.publicationGuards(command.members.map(member=>member.uid)),...statements],[],undefined,completion,command.parent?executable!:undefined);
  }
  async readChzzkScanStage(id:string,operationId:string) {
    await this.row(id);return new D1ChzzkContinuationStore(this.db).read(id,operationId);
  }
  async receiveChzzkScanStage(stage:ChzzkScanStage) {
    await this.row(stage.transitionId);return new D1ChzzkContinuationStore(this.db).receive(stage);
  }
  private async commitOperation(id: string, operationId: string, generation: number, statements: D1PreparedStatement[],fileReferences:readonly FileReferenceCommit[],prepared?:PreparedAdmission,chzzkScan?:ChzzkScanCompletion,chzzkStage?:ChzzkScanCommand,youtubeChannel?:YouTubeChannelCompletion,youtubeVideo?:YouTubeVideoCompletion,conversionOutcome=false,candidateChannelChild?:{step:'create'|'update';command:ChannelMutation;expectedState:string}) {
    const row = await this.row(id);
    if (!canCommit(this.side(row), row.phase, generation, row.generation)) throw new Error("Final mutation owner/generation mismatch");
    const operation:OperationEnvelope = prepared?{...prepared.operation,generation,sourceSequence:null,sourceFence:null,attempt:null,outcome:null}:await this.exportOperation(id, operationId);
    if (operation.outcome) { if (operation.outcome.outcome === "committed") return; throw new Error("Operation already has a terminal outcome"); }
    const phases = this.side(row) === "source" ? "'protected','copying','replaying','target_ingress_ready'" : "'target_owned','complete'";
    const commitId=candidateChannelChild?`${operationId}:channel:${candidateChannelChild.step}`:operationId;
    let versionSql="1";
    const versionBinds:Array<string|number|null>=[];
    if(candidateChannelChild) {
      if(operation.codec.id!=='otw-play.candidate.channel_approve'||!youtubeVideo||youtubeVideo.failure) throw new Error('Not an original channel approval child batch');
      const child=candidateChannelChild,requestKey=`youtube:channels:${child.step}:${child.command.input.externalChannelId}`;
      if(!youtubeVideo.reads.some(read=>read.requestKey===requestKey&&read.disposition==='consumed')) throw new Error('Missing original child channel response');
      if(this.side(row)==='source'||operation.sourceSequence===null) await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,youtubeVideo);
      const state=playChannelState(child.command);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,child.expectedState);
    } else if(operation.codec.id==='otw-play.candidate.channel_approve') {
      const receipt=await this.readCandidateChannelReceipt(operationId),command=receipt?.stages?.refresh?.command;
      if(!receipt||!command||!youtubeVideo||youtubeVideo.failure||!youtubeVideo.reads.some(read=>read.requestKey===`youtube:videos:3:${command.videoId}`&&read.disposition==='consumed')) throw new Error('Missing final original approval refresh');
      const stages=receipt.stages!;
      parseCandidateChannelStages(stages,receipt.command);
      for(const step of ['create','update'] as const) {
        const read=youtubeVideo.reads.find(item=>item.requestKey===`youtube:channels:${step}:${stages.snapshot!.externalChannelId}`);
        if(!read||read.disposition!==(stages[step]?'consumed':'not_issued')||stages[step]&&!stages[step]!.result) throw new Error('Incomplete original channel child responsibility');
      }
      if(this.side(row)==='source'||operation.sourceSequence===null) await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,youtubeVideo);
      versionSql="EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND external_video_id=? AND content_access='normal')";
      versionBinds.push(command.candidateId,command.expectedVersion,command.videoId);
    } else if(operation.codec.id==='otw-play.candidate.refresh') {
      const receipt=await this.readCandidateMetadataReceipt(operationId);
      if(!receipt||receipt.operation.transitionId!==id||!youtubeVideo||youtubeVideo.failure||youtubeVideo.reads.length!==1||youtubeVideo.reads[0].disposition!=='consumed') throw new Error('Missing original refresh observation completion');
      if(this.side(row)==='source'||operation.sourceSequence===null) await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,youtubeVideo);
      const command=receipt.command;
      versionSql="EXISTS(SELECT 1 FROM music_ingestion_candidates WHERE id=? AND version=? AND external_video_id=? AND content_access='normal')";
      versionBinds.push(command.candidateId,command.expectedVersion,command.videoId);
    } else if(operation.codec.id==='otw-play.candidate.convert') {
      const execution=await this.videoExecutionCommand(id,operationId);
      if(execution.command.action!=='candidate_convert'||!youtubeVideo) throw new Error('Missing original conversion completion');
      if(this.side(row)==='source'||operation.sourceSequence===null) {
        const journal=new D1YouTubeVideoReadJournal(this.db,this.site,this.resource);
        await journal.assertCompletion(id,operationId,operation.payloadHash,youtubeVideo);
        if(conversionOutcome&&!await journal.failurePreparation(id,operationId,operation.payloadHash)) throw new Error('Missing original conversion outcome preparation');
      }
      if(!conversionOutcome) {
        if(youtubeVideo.failure||youtubeVideo.reads.some(read=>read.disposition!=='consumed')) throw new Error('Missing both original conversion reads');
        const revision=await this.conversionRevision(id,operationId),scope=await this.conversionJobScope(id,operationId),command=execution.command;
        versionSql=`? AND (SELECT revision FROM music_catalog_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM music_ingestion_candidates candidate WHERE candidate.id=? AND candidate.version=? AND candidate.status='ready' AND candidate.content_access='normal' AND ${scope.sql})`;
        versionBinds.push(revision.valid?1:0,revision.revision,command.input.candidateId,command.input.expectedVersion,...scope.bindings);
      }
    } else if(operation.codec.id==='otw-play.video.mutate') {
      const execution=await this.videoExecutionCommand(id,operationId),predicate=playVideoPredicate(execution.command);
      if(!youtubeVideo||youtubeVideo.failure||youtubeVideo.reads.some(read=>read.disposition!=='consumed')) throw new Error('Missing original video metadata completion');
      if(this.side(row)==='source'||operation.sourceSequence===null) await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,youtubeVideo);
      versionSql=`(${predicate.sql}) AND ?`;versionBinds.push(...predicate.bindings,execution.sourceRevisionValid?1:0);
    } else if(operation.codec.id==="otw-play.member.mutate") {
      const receipt=await this.readMemberSubmissionReceipt(operationId);
      if(!receipt || receipt.operation.transitionId!==id) throw new Error("Missing original own-user submission predicate");
      const predicate=memberSubmissionPredicate(receipt.command);versionSql=predicate.sql;versionBinds.push(...predicate.bindings);
    } else if(operation.codec.id==='otw-play.review.delete') {
      const command=parseReviewDeletion(operation.payload);if(!command) throw new Error('Missing review deletion predicate');
      const predicate=reviewDeletionPredicate(command);versionSql=predicate.sql;versionBinds.push(...predicate.bindings);
    } else if(operation.codec.id==="otw-play.proposal.reject") {
      const command=parseProposalRejection(operation.payload);
      if(!command) throw new Error("Missing original proposal rejection predicate");
      versionSql=proposalRejectionPredicate;versionBinds.push(command.id,command.input.expectedVersion);
    } else if(operation.codec.id==="otw-play.channel.mutate") {
      const executable=await this.readExecutableCommand(id,operationId),command=parseChannelMutation(executable.payload);
      if(!command || typeof executable.payload.expectedState!=="string" || !youtubeChannel || youtubeChannel.disposition!=="consumed" || youtubeChannel.failure!==null) throw new Error("Missing original channel metadata/precondition");
      if(operation.sourceSequence===null) await new D1YouTubeChannelReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,operation.payloadHash,youtubeChannel);
      const state=playChannelState(command);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,executable.payload.expectedState);
    } else if(operation.codec.id==="otw-play.delete.mutate") {
      const command=parseCatalogDeleteCommand(operation.payload);
      if(!command || typeof operation.payload.expectedState!=="string") throw new Error("Missing original deletion precondition");
      const state=playDeleteState(command);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="otw-play.publication.mutate") {
      const command=parsePublicationCommand(operation.payload);
      if(!command || typeof operation.payload.expectedState!=="string") throw new Error("Missing original publication precondition");
      const state=playPublicationState(command.id);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="otw-play.entity.mutate") {
      const command=parseEntityMutation(operation.payload);
      if(!command || typeof operation.payload.expectedState!=="string") throw new Error("Missing original entity precondition");
      const state=playEntityState(command);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="otw-play.song.create") {
      const parsed=parseCreateSong(operation.payload.input);
      if(!parsed.ok || typeof operation.payload.id!=="string" || typeof operation.payload.expectedState!=="string") throw new Error("Missing original song creation precondition");
      const state=playSongCreateState(operation.payload.id,parsed.value);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="otw-play.song.mutate") {
      const parsed=parseUpdateSong(operation.payload);
      if(!parsed.ok || typeof operation.payload.expectedState!=="string") throw new Error("Missing original song precondition");
      const state=playSongState(parsed.value);versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="x-posts.redact") {
      if(typeof operation.payload.expectedState!=="string") throw new Error("Missing original X redaction state");
      const state=xRedactionState(String(operation.payload.postId));versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,operation.payload.expectedState);
    } else if(operation.codec.id==="schedules.collector") {
      if(typeof operation.payload.expectedState!=="string") throw new Error("Missing original collector state");
      versionSql=`${collectorState(this.site)}=?`;versionBinds.push(operation.payload.expectedState);
    } else if(operation.codec.id==="schedules.chzzk_scan") {
      const executable=await this.readExecutableCommand(id,operationId),command=parseChzzkScanCommand(executable.payload);
      if(!command || typeof executable.payload.expectedState!=="string") throw new Error("Missing original CHZZK precondition");
      const state=chzzkScanState(command.members.map(member=>member.uid));
      versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings,executable.payload.expectedState);
    } else if(operation.codec.id==="assets.replace") {
      const command=await this.readExecutableCommand(id,operationId);
      versionSql="(SELECT version_key FROM asset_file_references WHERE logical_key=?) IS ? AND (? IS NULL OR EXISTS(SELECT 1 FROM members WHERE uid=? AND code=? AND content_access='normal'))";
      versionBinds.push(command.payload.logicalKey as string,command.payload.previousVersion as string|null,command.payload.memberUid as number|null,command.payload.memberUid as number|null,command.payload.memberCode as string|null);
    } else if(operation.codec.id==="schedules.live_fill") {
      const plan=parseLiveSchedulePlan(operation.payload.plan);
      if(!plan || !Array.isArray(operation.payload.expectedRows)) throw new Error("Invalid stored live-fill command");
      const version=this.liveVersion({plan,expectedRows:operation.payload.expectedRows});versionSql=version.sql;versionBinds.push(...version.bindings);
    } else if(operation.codec.id==="pending.mutate") {
      const command=parsePendingCommand(operation.payload);
      if(!command || typeof operation.payload.expectedState!=="string") throw new Error("Invalid stored pending command");
      const state=pendingMutationState(command,Number(operation.payload.memberUid),String(operation.payload.date),Boolean(operation.payload.holiday));
      versionSql=`${state.sql}=?`;versionBinds.push(...state.bindings as Array<string|number|null>,operation.payload.expectedState);
    } else if(operation.codec.id==="ddays.create" || operation.codec.id==="ddays.mutate") {
      const command=parseDDayCommand(operation.payload);
      if(!command || typeof operation.payload.expectedRows!=="string") throw new Error("Invalid stored D-day command");
      const version=this.ddayVersion(command,operation.payload.expectedRows);
      versionSql=version.sql;versionBinds.push(...version.bindings);
    } else if(operation.codec.id==="notices.mutate") {
      const command=await this.readExecutableCommand(id,operationId),parsed=parseNoticeCommand(command.payload);
      if(!parsed || typeof command.payload.expectedRows!=="string") throw new Error("Invalid stored notice mutation");
      const version=this.noticeVersion(parsed,command.payload.expectedRows);
      versionSql=version.sql;
      versionBinds.push(...version.bindings);
    } else if(operation.codec.id==="schedules.mutate" || operation.codec.id==="schedules.local") {
      const command=prepared?.sourceCommand??await this.readExecutableCommand(id,operationId);
      const parsed=parseScheduleCommand(command.payload);
      if(!parsed || !Array.isArray(command.payload.expectedRows)) throw new Error("Invalid stored schedule mutation");
      const expected=command.payload.expectedRows as Array<Record<string,string|number|null>>;
      const condition=parsed.action==="delete"?"id=?":"(member_uid=? AND date=?) OR id=?";
      const parameters=parsed.action==="delete"?[parsed.id]:[parsed.input.member_uid,parsed.input.date,parsed.input.id];
      versionSql=`(SELECT count(*) FROM schedules WHERE ${condition})=? AND ${expected.length?expected.map(()=>`EXISTS(SELECT 1 FROM schedules WHERE ${contentDispositionRegistry.schedules.values.map(column=>`"${column}" IS ?`).join(" AND ")})`).join(" AND "):"1"}`;
      versionBinds.push(...parameters,expected.length,...expected.flatMap(value=>contentDispositionRegistry.schedules.values.map(column=>value[column])));
    } else if(operation.codec.id==='otw-play.ai.unknown') {
      // Completing the original review does not edit the candidate. Preserve
      // the original review/attempt CAS rather than invent a candidate CAS.
      const {envelope,command}=await new D1AiUnknownControl(this.db,this.site,this.resource).authority(id,operationId,operation.payloadHash,'source');
      const snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
      if(!snapshot?.response||snapshot.decision) throw new Error('Missing original source AI response');
      versionSql=`((${aiReviewSnapshotSql}) IS ?) AND ((${aiAttemptSnapshotSql}) IS ?)`;
      versionBinds.push(command.reviewId,snapshot.review,command.reviewId,snapshot.attempts);
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
    const nativeCompletion=chzzkScan && !chzzkStage && this.side(row)==="target" && operation.sourceSequence===null
      ?{outcome:"committed" as const,sideEffectReconciled:!operation.attempt || ["completed","failed"].includes(operation.attempt.status),detail:"Business batch committed",chzzkScan}:null;
    try { result = await this.db.batch([
      ...(prepared?[prepared.insert,this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL),1,json('admission_identity_conflict'))").bind(id,operationId,operation.payloadHash)]:[]),
      this.db.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES(?,?)").bind(id, commitId),
      this.db.prepare(`INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,version_matches,commit_seq)
        SELECT 1,id,?,CASE WHEN phase IN (${phases}) AND ?=${this.side(row)==="source"?"generation-1":"generation"} THEN ? ELSE NULL END,
        ${versionSql} AND EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL),
        (SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id=?) FROM content_transitions WHERE id=?`)
        .bind(operationId, generation, generation, ...versionBinds,id,operationId,id, commitId, id),
      ...fileReferences.map(file=>this.db.prepare(`UPDATE content_transition_permits SET version_matches=version_matches AND EXISTS(
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
      ...(youtubeVideo&&(this.side(row)==='source'||operation.sourceSequence===null)?new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).completionGuard(id,operationId,youtubeVideo):[]),
      ...statements, ...captureStatements(this.db, id),
      ...fileReferences.map(file=>this.db.prepare("UPDATE content_transition_file_intents SET outcome_json=? WHERE transition_id=? AND operation_id=? AND intent_id=? AND outcome_json IS NULL").bind(JSON.stringify({outcome:"committed",sideEffectReconciled:true,detail:"Reference committed in business batch"}),id,operationId,file.intentId)),
      ...(candidateChannelChild?[]:chzzkStage?new D1ChzzkContinuationStore(this.db).stageStatements(id,operationId,chzzkStage,chzzkScan!):[
        this.db.prepare(`UPDATE content_transition_operations SET outcome_json=json_object('outcome','committed','sideEffectReconciled',json(iif(attempt_json IS NULL OR json_extract(attempt_json,'$.status') IN ('completed','failed'),'true','false')),'detail','Business batch committed'${chzzkScan?",'chzzkScan',json(?)":""}${youtubeVideo?",'youtubeVideo',json(?)":""}${youtubeChannel?",'youtubeChannel',json_set(json(?),'$.result',json_extract(envelope_json,'$."+(this.side(row)==="source"?"sourceReceipt":"nativeReceipt")+".result'))":""}) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(...(chzzkScan?[JSON.stringify(chzzkScan)]:[]),...(youtubeVideo?[JSON.stringify(youtubeVideo)]:[]),...(youtubeChannel?[JSON.stringify(youtubeChannel)]:[]),id, operationId),
      ]),
      ...(nativeCompletion?.sideEffectReconciled?await new D1ChzzkReadJournal(this.db,this.site,this.resource).nativeSettlementStatements(id,operationId,operation.payloadHash,nativeCompletion,Date.now()):[]),
      this.db.prepare("UPDATE content_transition_commits SET sealed=1 WHERE transition_id=? AND operation_id=?").bind(id, commitId),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(id),
    ]); } catch(error) {
      if(String(error).includes("content_transition_version_conflict") && versionSql!=="1" && !await this.db.prepare(`SELECT ${versionSql} matches`).bind(...versionBinds).first<number>("matches")) {
        if(!prepared&&!['otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve','otw-play.ai.unknown'].includes(operation.codec.id)) await this.recordOutcome(id,operationId,{outcome:"conflicted",sideEffectReconciled:!operation.attempt || operation.attempt.status==="completed",detail:"Expected version no longer matches",...(chzzkScan?{chzzkScan}: {}),...(youtubeChannel?{youtubeChannel}:{}),...(youtubeVideo?{youtubeVideo}:{})});
        throw new Error("Expected version conflict",{cause:error});
      }
      const message=error instanceof Error?error.message:String(error);
      if(operation.codec.id==="otw-play.channel.mutate" && youtubeChannel && (isPublicationCutoffSqlError(message)||/^D1_ERROR: (?:UNIQUE|NOT NULL|CHECK|FOREIGN KEY) constraint failed(?:: music_[A-Za-z0-9_. ,]+)?: SQLITE_CONSTRAINT\b/.test(message))) {
        await this.recordChannelFailure(id,operationId,youtubeChannel,{code:"validation_failed",message:isPublicationCutoffSqlError(message)?'이관된 멤버의 신규 수집은 종료되었습니다.':"Catalog command violates an identity or relationship constraint",sqlError:message});
      }
      // Only a definitive SQLite rejection of this actual atomic business
      // batch proves failure. Delivery/runtime errors and arbitrary trigger
      // failures remain recoverable; no attempt-count inference is used.
      if(!prepared && this.side(row)==="target" && operation.sourceSequence===null && !operation.attempt && fileReferences.length===0
        && ["otw-play.song.mutate","otw-play.song.create","otw-play.entity.mutate","otw-play.publication.mutate","otw-play.delete.mutate","otw-play.proposal.reject","otw-play.member.mutate","otw-play.review.delete","otw-play.candidate.mutate"].includes(operation.codec.id)
        && (/^D1_ERROR: (?:UNIQUE|NOT NULL|CHECK) constraint failed: music_[A-Za-z0-9_. ,]+: SQLITE_CONSTRAINT\b/.test(message)
          || operation.codec.id==="otw-play.delete.mutate" && /^D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT\b/.test(message))) {
        await this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.failure',json(?)),outcome_json=?
          WHERE transition_id=? AND operation_id=? AND payload_hash=? AND source_seq IS NULL AND outcome_json IS NULL AND attempt_json IS NULL
          AND json_type(envelope_json,'$.nativeReceipt.command')='object' AND json_type(envelope_json,'$.nativeReceipt.result')='null'
          AND NOT EXISTS(SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id=?)
          AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase IN ('target_owned','complete'))`)
          .bind(JSON.stringify({message}),JSON.stringify({outcome:"failed",sideEffectReconciled:true,detail:"Original catalog business batch rejected by SQLite constraint"}),id,operationId,operation.payloadHash,id,operationId,id,this.site,this.resource,generation).run();
      }
      throw error;
    }
    const offset=2+fileReferences.length+(prepared?2:0)+(youtubeVideo&&(this.side(row)==='source'||operation.sourceSequence===null)?1:0);
    return { businessResults:result.slice(offset,offset+statements.length), statements: result.length, rowsRead: result.reduce((n,r)=>n+r.meta.rows_read,0), rowsWritten: result.reduce((n,r)=>n+r.meta.rows_written,0), duration: result.reduce((n,r)=>n+r.meta.duration,0) };
  }
  async readJournal(id: string) {
    await this.row(id,true);
    return (await this.db.prepare("SELECT j.seq,j.commit_seq,j.row_table AS 'table',j.row_key,j.before_json,j.after_json FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=? AND c.sealed=1 ORDER BY j.seq").bind(id).all<{ seq: number; commit_seq: number; table: string; row_key: string; before_json: string | null; after_json: string | null }>()).results;
  }
  async recordOutcome(id: string, operationId: string, outcome: OperationOutcome): Promise<void> {
    assertOperationEvidence({attempt:null,outcome});
    const row = await this.row(id);
    if (!canCommit(this.side(row), row.phase, this.side(row)==="source"?row.generation-1:row.generation, row.generation)) throw new Error("Only final owner records business outcome");
    const actual = await this.exportOperation(id, operationId);
    if(outcome.sideEffectReconciled && actual.codec.id==="schedules.chzzk_scan" && parseChzzkScanCommand(actual.payload)?.parent) await new D1ChzzkContinuationStore(this.db).assertSettled(id,operationId);
    if(outcome.chzzkScan && actual.codec.id!=="schedules.chzzk_scan") throw new Error("CHZZK control cannot reconcile another effect");
    if(Boolean(outcome.youtubeVideo)!==["otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve"].includes(actual.codec.id)) throw new Error("Original video outcome control mismatch");
    if(outcome.youtubeVideo && (this.side(row)==='source'||actual.sourceSequence===null)) await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,actual.payloadHash,outcome.youtubeVideo);
    if(Boolean(outcome.youtubeChannel)!==(actual.codec.id==="otw-play.channel.mutate")) throw new Error("Original YouTube outcome control mismatch");
    if(outcome.youtubeChannel && actual.sourceSequence===null) await new D1YouTubeChannelReadJournal(this.db,this.site,this.resource).assertCompletion(id,operationId,actual.payloadHash,outcome.youtubeChannel);
    if(outcome.outcome==="committed" && actual.outcome?.outcome!=="committed") throw new Error("Committed outcome requires the actual final business batch");
    if (actual.outcome && JSON.stringify(actual.outcome) !== JSON.stringify(outcome)) throw new Error("Terminal outcome is immutable");
    if(!["committed","conflicted","failed"].includes(outcome.outcome)) throw new Error("Invalid terminal outcome");
    if(outcome.sideEffectReconciled && actual.attempt && !["completed","failed"].includes(actual.attempt.status)) throw new Error("Existing side effect must reconcile before terminal acknowledgement");
    const phases=this.side(row)==="source"?"'protected','copying','replaying','target_ingress_ready'":"'target_owned','complete'";
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL AND (?=0 OR attempt_json IS NULL OR json_extract(attempt_json,'$.status') IN ('completed','failed')) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase IN (${phases}))`).bind(JSON.stringify(outcome), id, operationId,outcome.sideEffectReconciled?1:0,id),
      ...(this.side(row)==="target" && actual.sourceSequence===null && outcome.chzzkScan && outcome.sideEffectReconciled?await new D1ChzzkReadJournal(this.db,this.site,this.resource).nativeSettlementStatements(id,operationId,actual.payloadHash,outcome,Date.now()):[]),
    ]);
    if(JSON.stringify((await this.exportOperation(id,operationId)).outcome)!==JSON.stringify(outcome)) throw new Error("Outcome owner moved or immutable outcome conflicts");
  }
  async reconcileNativeChzzkRetention(id:string,operationId:string) {
    const row=await this.row(id),operation=await this.exportOperation(id,operationId);
    if(this.side(row)!=="target" || operation.sourceSequence!==null || operation.codec.id!=="schedules.chzzk_scan" || !operation.outcome?.chzzkScan || !operation.outcome.sideEffectReconciled) return;
    const statements=await new D1ChzzkReadJournal(this.db,this.site,this.resource).nativeSettlementStatements(id,operationId,operation.payloadHash,operation.outcome,Date.now());
    if(statements.length) await this.db.batch(statements);
  }
  async archiveSource(id:string):Promise<SourceArchiveReceipt> {
    const row=await this.row(id);
    if(this.side(row)!=="source" || row.phase!=="source_fenced" || !row.fence_json) throw new Error("Only fenced source can archive selected roots");
    const prior=await this.db.prepare('SELECT archive_receipt_json FROM content_transitions WHERE id=?').bind(id).first<string>('archive_receipt_json');
    if(prior)return JSON.parse(prior);
    const tables=ownedRootTables.filter(table=>(contentDispositionRegistry[table].excluded as readonly string[]).includes("content_access"));
    const archiveTables=tables.map(table=>`'${table}'`).join(",");
    const statements=tables.map(table=>this.db.prepare(`UPDATE "${table}" AS a SET content_access='admin_archive' WHERE content_access='normal' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=? AND m.row_table=m.root_table AND m.row_key=m.root_key AND ${matchKey(table,"a","m.root_key")})`).bind(id,table));
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND aborted_at IS NULL AND phase='source_fenced' AND fence_json=? AND archive_receipt_json IS NULL),1,json('archive_state_race'))").bind(id,row.fence_json),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_commits(transition_id,operation_id) VALUES(?,'archive')").bind(id),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,id,'archive',generation-1,'archive',(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='archive') FROM content_transitions WHERE id=? AND local_site=source_site AND phase='source_fenced'").bind(id,id),
      ...tables.map(table=>this.db.prepare(`UPDATE content_transition_membership AS m SET archive_previous_access='normal' WHERE transition_id=? AND root_table=? AND row_table=root_table AND row_key=root_key AND archive_previous_access IS NULL AND EXISTS(SELECT 1 FROM "${table}" a WHERE ${matchKey(table,'a','m.root_key')} AND a.content_access='normal')`).bind(id,table)),
      ...statements,
      this.db.prepare(`UPDATE content_transition_permits SET version_matches=NOT EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=? AND m.root_table=m.row_table AND m.root_key=m.row_key AND m.root_table IN (${archiveTables}) AND NOT CASE m.root_table ${tables.map(table=>`WHEN '${table}' THEN EXISTS(SELECT 1 FROM "${table}" a WHERE ${matchKey(table,"a","m.root_key")} AND a.content_access='admin_archive')`).join(" ")} ELSE 0 END) WHERE transition_id=?`).bind(id,id),
      this.db.prepare(`UPDATE content_transitions SET archive_receipt_json=json_patch(?,json_object('restoreEvidence',1,'boundary',json_extract(fence_json,'$.boundary'),'archivedRoots',(SELECT count(*) FROM content_transition_membership WHERE transition_id=? AND root_table=row_table AND root_key=row_key AND root_table IN (${archiveTables})))) WHERE id=? AND phase='source_fenced'`).bind(JSON.stringify(identity(row)),id,id),
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
    if("codec" in value && value.codec.id==="schedules.chzzk_scan" && parseChzzkScanCommand(value.payload)?.parent) await new D1ChzzkContinuationStore(this.db).assertSettled(id,recordId);
    if(value.sourceSequence===null || !value.outcome || !value.outcome.sideEffectReconciled) throw new Error("No terminal reconciled outcome receipt");
    const fingerprint="payloadHash" in value?value.payloadHash:value.versionKey;
    return {...identity(row),kind,recordId,sourceSequence:value.sourceSequence,fingerprint,outcome:value.outcome,outcomeDigest:await digestText(JSON.stringify(value.outcome))};
  }
  async acknowledgeOutcome(receipt:OutcomeReceipt):Promise<OutcomeReceipt> {
    const row=await this.row(receipt.id);
    assertSameTransition(identity(row),receipt);
    if(this.side(row)!=="source" || !row.fence_json || await digestText(JSON.stringify(receipt.outcome))!==receipt.outcomeDigest || !receipt.outcome.sideEffectReconciled) throw new Error("Invalid final outcome receipt");
    const value=receipt.kind==="operation"?await this.exportOperation(row.id,receipt.recordId):await this.exportFileIntent(row.id,receipt.recordId);
    assertOperationEvidence({attempt:null,outcome:receipt.outcome});
    const ai=receipt.kind==='operation'&&'codec' in value&&value.codec.id==='otw-play.ai.unknown';
    if(Boolean(receipt.outcome.aiReview||receipt.outcome.aiReviewResult)!==ai) throw new Error('AI responsibility outcome control mismatch');
    if(ai) {
      const stage=await new D1AiUnknownControl(this.db,this.site,this.resource).transfer(row.id,receipt.recordId,receipt.fingerprint);
      if(receipt.outcome.aiReview) {
        if(stage.response||!stage.closure||JSON.stringify(stage.closure)!==JSON.stringify(receipt.outcome.aiReview)||value.attempt?.identity!==stage.closure.attemptId||value.attempt.status!=='unknown') throw new Error('AI closure lacks its original source CAS');
      } else {
        const result=receipt.outcome.aiReviewResult!;
        if(!stage.response||stage.closure||stage.response.hash!==result.responseHash||JSON.parse(stage.response.projectedJson).value.status!==result.status||!('payload' in value)||result.operationId!==value.operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>result[key]!==value.payload[key])) throw new Error('AI result lacks its original recorded response');
      }
    }
    const chzzk=receipt.kind==="operation" && "codec" in value && value.codec.id==="schedules.chzzk_scan";
    const video=receipt.kind==="operation" && "codec" in value && ["otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve"].includes(value.codec.id);
    if(Boolean(receipt.outcome.youtubeVideo)!==video) throw new Error("Original video outcome control mismatch");
    if(video&&receipt.outcome.outcome==='committed'&&receipt.outcome.youtubeVideo?.reads.some(read=>read.disposition==='not_issued')) {
      const journal=new D1YouTubeVideoReadJournal(this.db,this.site,this.resource);
      if('codec' in value&&value.codec.id==='otw-play.candidate.channel_approve') {
        const stages=await new D1CandidateChannelStages(this.db,this.site,this.resource).read(row.id,receipt.recordId,receipt.fingerprint,true);
        if(!stages.snapshot||!stages.refresh||JSON.stringify(await journal.completion(row.id,receipt.recordId,receipt.fingerprint,true))!==JSON.stringify(receipt.outcome.youtubeVideo)) throw new Error('Missing original approval conditional completion');
        for(const step of ['create','update'] as const) {
          const read=receipt.outcome.youtubeVideo.reads.find(read=>read.requestKey===`youtube:channels:${step}:${stages.snapshot!.externalChannelId}`);
          if(!read||read.disposition!==(stages[step]?'consumed':'not_issued')||stages[step]&&!stages[step]!.result) throw new Error('Unfinished original conditional channel child');
        }
      } else {
        const proof='codec' in value&&value.codec.id==='otw-play.candidate.convert'?await journal.failurePreparation(row.id,receipt.recordId,receipt.fingerprint,true):await journal.approvalNoopPreparation(row.id,receipt.recordId,receipt.fingerprint,true);
        if(!proof||JSON.stringify(proof.control)!==JSON.stringify(receipt.outcome.youtubeVideo)) throw new Error('Missing sealed original approved-result reads');
      }
    }
    const youtube=receipt.kind==="operation" && "codec" in value && value.codec.id==="otw-play.channel.mutate";
    if(chzzk && "payload" in value && parseChzzkScanCommand(value.payload)?.parent) await new D1ChzzkContinuationStore(this.db).assertSettled(row.id,receipt.recordId);
    if(Boolean(receipt.outcome.chzzkScan)!==chzzk) throw new Error("Original CHZZK outcome control mismatch");
    if(Boolean(receipt.outcome.youtubeChannel)!==youtube) throw new Error("Original YouTube outcome control mismatch");
    const fingerprint="payloadHash" in value?value.payloadHash:value.versionKey;
    if(value.sourceSequence!==receipt.sourceSequence || fingerprint!==receipt.fingerprint || value.outcome && (value.outcome.outcome!==receipt.outcome.outcome || value.outcome.detail!==receipt.outcome.detail || value.outcome.sideEffectReconciled && !receipt.outcome.sideEffectReconciled)) throw new Error("Outcome identity conflict");
    const table=receipt.kind==="operation"?"content_transition_operations":"content_transition_file_intents";
    const key=receipt.kind==="operation"?"operation_id":"intent_id";
    const acknowledgement=this.db.prepare(`UPDATE ${table} SET outcome_json=?,outcome_acknowledged=1 WHERE transition_id=? AND ${key}=? AND seq=? AND (outcome_json IS NULL OR outcome_json=?)`).bind(JSON.stringify(receipt.outcome),row.id,receipt.recordId,receipt.sourceSequence,value.outcome?JSON.stringify(value.outcome):null);
    await this.db.batch([acknowledgement,...(receipt.outcome.aiReviewResult?[this.db.prepare("UPDATE content_transition_operations SET attempt_json=? WHERE transition_id=? AND operation_id=? AND outcome_acknowledged=1 AND outcome_json=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview.response.hash')=? AND json_type(envelope_json,'$.sourceReceipt.aiReview.decision')='null'").bind(JSON.stringify({identity:receipt.outcome.aiReviewResult.attemptId,status:receipt.outcome.aiReviewResult.status==='failed'?'failed':'completed'}),row.id,receipt.recordId,JSON.stringify(receipt.outcome),receipt.outcome.aiReviewResult.responseHash)]:[]),...(video?await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).settlementStatements(row.id,receipt.recordId,fingerprint,receipt.outcome,Date.now()):[]),...(chzzk?await new D1ChzzkReadJournal(this.db,this.site,this.resource).settlementStatements(row.id,receipt.recordId,fingerprint,receipt.outcome,Date.now()):[]),...(youtube?await new D1YouTubeChannelReadJournal(this.db,this.site,this.resource).settlementStatements(row.id,receipt.recordId,fingerprint,receipt.outcome,Date.now()):[])]);
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
    const remaining=async(table:"content_transition_operations"|"content_transition_file_intents",boundary:number)=>this.db.prepare(`SELECT count(*) n FROM ${table} WHERE transition_id=? AND transferred=1 AND source_seq<=? AND generation=? AND outcome_acknowledged=1 AND (json_extract(outcome_json,'$.outcome') IN ('committed','conflicted','failed') ${table==='content_transition_operations'?"OR (json_extract(outcome_json,'$.outcome')='administratively_closed' AND json_extract(envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(outcome_json,'$.aiReview.disposition')='admin_closed_unknown' AND json_extract(outcome_json,'$.aiReview.attemptId')=json_extract(attempt_json,'$.identity') AND json_extract(attempt_json,'$.status')='unknown')":''}) AND json_extract(outcome_json,'$.sideEffectReconciled')=1`).bind(id,boundary,row.generation-1).first<number>("n");
    const operations=await remaining("content_transition_operations",fence.operationBoundary);
    const files=await remaining("content_transition_file_intents",fence.fileIntentBoundary);
    const archive=await this.db.prepare("SELECT archive_receipt_json FROM content_transitions WHERE id=?").bind(id).first<string>("archive_receipt_json");
    if (!archive || operations!==fence.operationCount || files!==fence.fileIntentCount) throw new Error("Frozen work or source archive proof is incomplete");
    await this.advance(id, "target_owned", "complete");
  }
}
