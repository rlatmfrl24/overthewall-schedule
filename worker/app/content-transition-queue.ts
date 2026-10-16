import {createOtwPlayIngestionService} from './ingestion';
import {catalogImportProjection} from "../features/otw-play";
import {isTransitionOperationMessage,type TransitionOperationMessage} from "@contracts/content-transition-queue";
import {parseSiteStorageResources} from "@contracts/site-definition";
import { D1TransitionRepository, D1AiUnknownControl, D1AiResumeControl, D1YouTubeChannelReadJournal, D1YouTubeVideoReadJournal, transitionCommandCapability } from "../features/content-transition";
import {D1ScheduleTransitionWriter,D1ScheduleWriteRepository,parseScheduleCommand,parseScheduleInput,D1PendingScheduleRepository,D1PendingTransitionWriter,parsePendingCommand} from "../features/schedules";
import type {Env} from "../platform/types";
import { deliverTransitionOutcome, transitionPeer } from "./content-transition";
import { D1NoticeGateway,D1NoticeTransitionWriter,parseNoticeCommand } from "../features/notices";
import { getDb } from "../platform/db";
import { buildAssetFileStore } from "./assets";
import {D1DDayRepository,D1DDayTransitionWriter,parseDDayCommand} from "../features/ddays";
import {applyLiveScheduleFillPlan,D1LiveScheduleTransitionWriter,parseLiveSchedulePlan} from "../features/schedules";
import {executeChzzkObservationScan} from "../features/schedules";
import {executeCollectorCommand,parseCollectorCommand,D1CollectorTransitionWriter} from "../features/schedules";
import { buildChzzkScanTransitionWriter } from "./content-transition";
import {chzzkVideoCatalog} from "../features/chzzk";
import {parseChzzkScanCommand} from "../features/schedules";
import {finishOriginalChzzkParent} from "./content-transition-chzzk";
import {D1RedactionWriter} from "../features/x-posts";
import {createOtwPlayAdminCatalogService} from "./admin-catalog";
import {createOtwPlayMemberSubmissionService} from "./member-submissions";
import {createOtwPlayAiReviewService} from './ai-review';

async function resumeOperation(env:Env,message:TransitionOperationMessage) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  const repository=new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection);
  const owner=await repository.readTransition(message.transitionId);
  const original=await repository.exportOperation(message.transitionId,message.operationId);
  if(original.payloadHash!==message.payloadHash) throw new Error("Queue receipt hash mismatch");
  if(owner.sourceSite===site&&original.codec.id==='otw-play.ai.unknown'&&await new D1AiUnknownControl(env.otw_db,site,database).sourceHandedOff(owner.id,original.operationId,original.payloadHash))return;
  if(owner.sourceSite===site&&original.codec.id==='otw-play.ai.resume'&&await new D1AiResumeControl(env.otw_db,site,database).sourceHandedOff(owner.id,original.operationId,original.payloadHash))return;
  const sourceScan=["schedules.chzzk_scan","otw-play.channel.mutate","otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve","otw-play.ai.unknown"].includes(original.codec.id) && owner.sourceSite===site && ["protected","copying","replaying","target_ingress_ready"].includes(owner.phase);
  if(!sourceScan && (owner.targetSite!==site || !["target_owned","complete"].includes(owner.phase))) throw new Error("Operation is waiting for final ownership");
  if(original.outcome?.sideEffectReconciled) {
    if(["otw-play.video.mutate","otw-play.candidate.convert","otw-play.candidate.refresh","otw-play.candidate.channel_approve"].includes(original.codec.id) && owner.targetSite===site && original.sourceSequence===null) await new D1YouTubeVideoReadJournal(env.otw_db,site,database).settle(owner.id,original.operationId,original.payloadHash,original.outcome,Date.now());
    if(original.codec.id==="otw-play.channel.mutate" && owner.targetSite===site && original.sourceSequence===null) await new D1YouTubeChannelReadJournal(env.otw_db,site,database).settle(owner.id,original.operationId,original.payloadHash,original.outcome,Date.now());
    if(owner.targetSite===site && original.sourceSequence===null && original.codec.id==="schedules.chzzk_scan") await repository.reconcileNativeChzzkRetention(message.transitionId,message.operationId);
    if(owner.targetSite===site && original.sourceSequence!==null && original.codec.id==="schedules.chzzk_scan" && parseChzzkScanCommand(original.payload)?.parent) {
      if(!await finishOriginalChzzkParent(env,owner.id,original.operationId)) throw new Error("Original completed scan finalizer is not available");
      return;
    }
    if(owner.targetSite===site && original.sourceSequence!==null) await deliverTransitionOutcome(env,message.transitionId,"operation",message.operationId);
    return;
  }
  if(original.codec.id==='otw-play.ai.resume'||original.codec.id==='otw-play.ai.unknown'&&owner.targetSite===site&&await new D1AiResumeControl(env.otw_db,site,database).find(String(original.payload.reviewId))) {
    const control=new D1AiResumeControl(env.otw_db,site,database),local=await control.local(owner.id,original.operationId,original.payloadHash),executionId=local.envelope.nativeReceipt.aiResume?.confirmation?.reviewId;
    if(!executionId)throw new Error('Current administrator confirmation is required');
    const service=createOtwPlayAiReviewService(env);
    if(!await service.resumeOriginalResponse(executionId))await service.process(executionId);
    await control.acknowledge(owner.id,original.operationId,original.payloadHash);
    return;
  }
  if(original.codec.id==='otw-play.ai.unknown') {
    if(await createOtwPlayAiReviewService(env).resumeOriginalResponse(String(original.payload.reviewId))) {
      if(owner.targetSite===site) await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);return;
    }
    if(sourceScan) throw new Error('Original source AI response or explicit decision is pending');
    const control=new D1AiUnknownControl(env.otw_db,site,database),args=[owner.id,original.operationId,original.payloadHash] as const;
    // Only a previously authenticated, durably saved target decision can resume.
    // A delivery never creates the decision or issues another model request.
    await control.decisionProof(...args);
    if(!await control.localStage(...args))throw new Error('Original AI responsibility has not been installed locally');
    await control.finishDecision(...args);
    await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);
    return;
  }
  if(original.codec.id==='otw-play.candidate.channel_approve') {
    const receipt=await repository.readCandidateChannelReceipt(original.operationId);
    if(!receipt||receipt.operation.transitionId!==owner.id) throw new Error('Missing original channel approval parent');
    try {await createOtwPlayIngestionService(env,message).resumeCandidateChannel(receipt.command);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Original channel approval parent is incomplete');
    if(owner.targetSite===site&&original.sourceSequence!==null) await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);
    return;
  }
  if(original.codec.id==='otw-play.candidate.refresh') {
    const receipt=await repository.readCandidateMetadataReceipt(original.operationId);
    if(!receipt||receipt.operation.transitionId!==owner.id) throw new Error('Missing original candidate refresh');
    try {await createOtwPlayIngestionService(env,message).resumeCandidateMetadata(receipt.command);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Original refresh responsibility is incomplete');
    if(owner.targetSite===site&&original.sourceSequence!==null) await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);
    return;
  }
  if(original.codec.id==='otw-play.candidate.convert') {
    const receipt=await repository.readVideoReceipt(original.operationId);
    if(!receipt||receipt.operation.transitionId!==owner.id||receipt.command.action!=='candidate_convert') throw new Error('Missing original candidate conversion');
    try {await createOtwPlayIngestionService(env,message).resumeCandidateConversion(receipt.command);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Original conversion bookkeeping is incomplete');
    if(owner.targetSite===site&&original.sourceSequence!==null) await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);
    return;
  }
  if(original.codec.id==='otw-play.conversion-outcome.mutate') {
    const receipt=await repository.readConversionOutcomeReceipt(original.operationId);
    if(!receipt||receipt.operation.transitionId!==owner.id||original.sourceSequence!==null) throw new Error('Missing native original conversion outcome');
    await createOtwPlayIngestionService(env,message).resumeConversionOutcome(receipt.command);
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Original no-GET outcome responsibility is incomplete');
    return;
  }
  if(original.codec.id==='otw-play.video.mutate') {
    const receipt=await repository.readVideoReceipt(original.operationId);
    if(!receipt||receipt.operation.transitionId!==owner.id) throw new Error('Missing original video command');
    try {await createOtwPlayAdminCatalogService(env,undefined,message).resumeVideoCatalog(receipt.command);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Accepted video command is not terminal');
    if(owner.targetSite===site&&original.sourceSequence!==null) await deliverTransitionOutcome(env,owner.id,'operation',original.operationId);
    return;
  }
  if(original.codec.id==="otw-play.channel.mutate") {
    const receipt=await repository.readChannelReceipt(original.operationId);
    if(!receipt || receipt.operation.transitionId!==owner.id) throw new Error("Missing original channel command");
    try {await createOtwPlayAdminCatalogService(env,undefined,message).executeAcceptedChannel(receipt.command);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted channel command is not terminal");
    if(owner.targetSite===site && original.sourceSequence!==null) await deliverTransitionOutcome(env,owner.id,"operation",original.operationId);
    return;
  }
  if(original.codec.id==="otw-play.member.mutate") {
    const receipt=await repository.readMemberSubmissionReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error('Missing native original member submission');
    const service=createOtwPlayMemberSubmissionService(env,undefined,message),command=receipt.command;
    try {
      if(command.action==='create') await service.create(command.userId,command.input);
      else if(command.action==='update') await service.update(command.userId,command.proposalId,command.input);
      else await service.withdraw(command.userId,command.proposalId,{expectedVersion:command.expectedVersion});
    } catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Accepted member submission is not terminal');
    return;
  }
  if(original.codec.id==="otw-play.proposal.reject") {
    const receipt=await repository.readProposalRejectionReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing native original proposal rejection");
    try {await createOtwPlayAdminCatalogService(env,undefined,message).rejectProposal(receipt.command.id,receipt.command.input,receipt.command.actor);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted proposal rejection is not terminal");
    return;
  }
  if(original.codec.id==="otw-play.delete.mutate") {
    const receipt=await repository.readCatalogDeleteReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing owning native deletion receipt");
    const service=createOtwPlayAdminCatalogService(env,undefined,message),command=receipt.command;
    try {
      if(command.kind==="entity") await service.deleteEntity(command.id,{expectedVersion:command.expectedVersion},command.actor);
      else if(command.kind==="song") await service.deleteSong(command.id,{expectedVersion:command.expectedVersion},command.actor);
      else if(command.kind==="channel") await service.deleteChannel(command.id,{expectedVersion:command.expectedVersion},command.actor);
      else await service.deletePerformance(command.id,{expectedVersion:command.expectedVersion},command.actor);
    } catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted catalog deletion is not terminal");
    return;
  }
  if(original.codec.id==='otw-play.review.delete') {
    const receipt=await repository.readReviewDeletionReceipt(original.operationId);
    if(!receipt||original.sourceSequence!==null||receipt.operation.transitionId!==owner.id) throw new Error('Missing native review deletion receipt');
    const command=receipt.command;
    try {await createOtwPlayIngestionService(env,message).deleteReviewItem(command.id,{kind:command.kind,expectedVersion:command.expectedVersion},command.actorUserId);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Review deletion is not terminal');
    return;
  }
  if(original.codec.id==='otw-play.candidate.mutate') {
    const receipt=await repository.readCandidateReviewReceipt(original.operationId);
    if(!receipt||original.sourceSequence!==null||receipt.operation.transitionId!==owner.id) throw new Error('Missing native candidate review receipt');
    const {candidateId,actorUserId,...input}=receipt.command;
    try {
      const service=createOtwPlayIngestionService(env,message),actor={userId:actorUserId,displayName:null,ipAddress:null};
      if(input.action==='ignore'&&input.jobId) await service.ignoreCandidates(input.jobId,{candidates:[{id:candidateId,expectedVersion:input.expectedVersion}]},actor);
      else await service.updateCandidate(candidateId,input,actor);
    }
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error('Candidate review is not terminal');
    return;
  }
  if(original.codec.id==="otw-play.publication.mutate") {
    const receipt=await repository.readPublicationReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing owning native publication receipt");
    try {await createOtwPlayAdminCatalogService(env,undefined,message).transitionPerformance(receipt.command.id,{expectedVersion:receipt.command.expectedVersion},receipt.command.target,receipt.command.actor);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted publication is not terminal");
    return;
  }
  if(original.codec.id==="otw-play.entity.mutate") {
    const receipt=await repository.readEntityReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing owning native entity receipt");
    const service=createOtwPlayAdminCatalogService(env,undefined,message);
    try {if(receipt.command.action==="create") await service.createEntity(receipt.command.input,receipt.command.actor);else await service.updateEntity(receipt.command.input,receipt.command.actor);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted entity mutation is not terminal");
    return;
  }
  if(original.codec.id==="otw-play.song.create") {
    const receipt=await repository.readSongCreationReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing native song creation receipt");
    try {await createOtwPlayAdminCatalogService(env,undefined,message).createSong(receipt.command.input,receipt.command.actor);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted song creation is not terminal");
    return;
  }
  if(original.codec.id==="otw-play.song.mutate") {
    const receipt=await repository.readSongReceipt(original.operationId);
    if(!receipt || original.sourceSequence!==null || receipt.operation.transitionId!==owner.id) throw new Error("Missing owning native song receipt");
    try {await createOtwPlayAdminCatalogService(env,undefined,message).updateSong(receipt.command.input,receipt.command.actor);}
    catch(error) {if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(owner.id,original.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted song mutation is not terminal");
    return;
  }
  const executable=await repository.readExecutableCommand(message.transitionId,message.operationId);
  const capability=transitionCommandCapability(executable.codec.id);
  if(!capability?.executor || capability.executor==="terminal-only") throw new Error("No owning executor for accepted command");
  if(capability.executor==="x-redaction") {
    const receipt=await repository.readXRedactionReceipt(message.transitionId,message.operationId);
    if(!receipt?.actor || typeof executable.payload.postId!=="string") throw new Error("Missing native X redaction receipt");
    try {await new D1RedactionWriter(env.otw_db,repository,site,message).redact(executable.payload.postId,receipt.actor);}
    catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("X redaction is not terminal");
    return;
  }
  if(capability.executor==="collector") {
    const command=parseCollectorCommand(executable.payload);if(!command) throw new Error("Missing original collector command");
    try {await executeCollectorCommand(getDb(env),command,new D1CollectorTransitionWriter(repository,site,message));}
    catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Collector command is not terminal");
    return;
  }
  if(capability.executor==="chzzk-scan") {
    try {await buildChzzkScanTransitionWriter(env).resume(original,chzzkVideoCatalog,(command,catalog,commit)=>executeChzzkObservationScan(getDb(env),command,env.otw_db,catalog,commit,parseSiteStorageResources(env).site));}
    catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    const stage=await repository.readChzzkScanStage(message.transitionId,message.operationId);
    if(stage) {
      if(owner.targetSite===site && original.sourceSequence!==null && stage.owner.site===site) await (await transitionPeer(env,owner.id,"target")).peer.receiveChzzkStage(owner.id,original.operationId,original.payloadHash);
      if(owner.targetSite===site && original.sourceSequence!==null) await finishOriginalChzzkParent(env,owner.id,original.operationId);
      return;
    }
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("CHZZK scan is not terminal");
    if(owner.targetSite===site && original.sourceSequence!==null) await deliverTransitionOutcome(env,message.transitionId,"operation",message.operationId);
    return;
  }
  if(capability.executor==="live") {
    const plan=parseLiveSchedulePlan(executable.payload.plan);
    if(!plan || !Array.isArray(executable.payload.expectedRows)) throw new Error("Missing owning live-fill command");
    try {
      await applyLiveScheduleFillPlan(getDb(env),{plan,expectedRows:executable.payload.expectedRows},new D1LiveScheduleTransitionWriter(repository,site,message));
    } catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted live-fill command is not terminal");
    return;
  }
  if(capability.executor==="pending") {
    const command=parsePendingCommand(executable.payload),receipt=await repository.readNativePendingReceipt(message.transitionId,message.operationId);
    if(!command || !receipt) throw new Error("Missing owning native pending command");
    const writer=new D1PendingScheduleRepository(env.otw_db,new D1PendingTransitionWriter(repository,site,message));
    try {
      const item=command.action==="reopen_rejection"?null:await writer.findById(command.id);
      const target=command.action==="apply_empty" && item?await writer.findEmptyTarget(item):null;
      const result=command.action==="reopen_rejection"?await writer.reopenRejection(command.id,receipt.actor):!item?null:
        command.action==="approve"?await writer.approve(item,command.options,receipt.actor):command.action==="reject"?await writer.reject(item,receipt.actor,command.options):
        command.action==="reset_processed"?await writer.resetProcessed(item,receipt.actor):command.action==="apply_empty" && target && target.id===command.targetId?await writer.applyToEmptyTarget(item,target,receipt.actor):null;
      if(!result?.success && !(await repository.exportOperation(message.transitionId,message.operationId)).outcome) await repository.recordOutcome(message.transitionId,message.operationId,{outcome:"conflicted",sideEffectReconciled:true,detail:"Original pending precondition no longer matches"});
    } catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted pending command is not terminal");
    return;
  }
  if(capability.executor==="dday") {
    const command=parseDDayCommand(executable.payload),receipt=await repository.readDDayReceipt(message.operationId);
    if(!command || !receipt) throw new Error("Missing owning native D-day command");
    const writer=new D1DDayRepository(getDb(env),false,new D1DDayTransitionWriter(repository,site,{actorId:receipt.actorId},message));
    try {
      const result=command.action==="create"?await writer.create(command.input):command.action==="update"?await writer.update(command.id,command.input):await writer.remove(command.id);
      if(!result) throw new Error("Accepted D-day command did not persist");
    } catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted D-day command is not terminal");
    return;
  }
  if(capability.executor==="notice") {
    if(!await repository.reconcileNativeNoticePrecondition(message.transitionId,message.operationId)) return;
    const command=parseNoticeCommand(executable.payload);
    if(!command) throw new Error("Invalid owning notice command");
    const writer=new D1NoticeGateway(getDb(env),env.ASSET_BUCKET,false,env.ASSET_BUCKET?buildAssetFileStore(env):undefined,new D1NoticeTransitionWriter(repository,site,message));
    try {
      const result=command.action==="create"?await writer.create(command.input):command.action==="update"?await writer.update(command.id,command.input):command.action==="delete"?await writer.remove(command.id):await writer.feature(command.id);
      if(result===false || typeof result!=="boolean" && result.status!=="success") throw new Error("Accepted notice command did not persist");
    } catch(error) {if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;}
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted notice operation is not terminal");
    return;
  }
  const command=executable.codec.id==="schedules.mutate"?parseScheduleCommand(executable.payload):null;
  if(!command) throw new Error("No owning executor for accepted command");
  const native=await repository.readNativeScheduleReceipt(message.operationId);
  // Old source validation remains its authority. No source actor is mapped into
  // a target account; new native work retains its own target-local audit actor.
  const actor=native?.actor??{actorId:null,actorName:null,actorIp:null};
  const writer=new D1ScheduleWriteRepository(env.otw_db,new D1ScheduleTransitionWriter(repository,site,message));
  try {
    if(command.action==="delete") await writer.delete(command.id,actor);
    else {
      const input=parseScheduleInput(command.input,{requireId:command.action==="update"})!;
      if(command.action==="save") await writer.saveWithConflictResolution(input,actor);
      else await writer[command.action](input,actor);
    }
  } catch(error) {
    if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw error;
  }
  if(!(await repository.exportOperation(message.transitionId,message.operationId)).outcome?.sideEffectReconciled) throw new Error("Accepted operation is not terminal");
  if(original.sourceSequence!==null) await deliverTransitionOutcome(env,message.transitionId,"operation",message.operationId);
}

export async function handleTransitionQueue(messages:Message<unknown>[],env:Env) {
  for(const message of messages) {
    try {
      if(!isTransitionOperationMessage(message.body)) throw new Error("Invalid transition queue message");
      await resumeOperation(env,message.body);
      message.ack();
    } catch {message.retry({delaySeconds:30});}
  }
}
