import {catalogImportProjection,D1AiReviewAdoption} from "../features/otw-play";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import { parseSiteStorageResources } from "@contracts/site-definition";
import { D1TransitionRepository, D1ChzzkReadJournal, D1AiUnknownControl, D1AiResumeControl } from "../features/content-transition";
import { D1ScheduleTransitionWriter,D1PendingTransitionWriter,D1LiveScheduleTransitionWriter,D1ChzzkScanTransitionWriter,D1CollectorTransitionWriter } from "../features/schedules";
import { D1NoticeTransitionWriter } from "../features/notices";
import type { Env } from "../platform/types";
import { D1DDayTransitionWriter, type DDayRequestIdentity } from "../features/ddays";

export function buildContentTransitionRepository(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1TransitionRepository(env.otw_db,site,database,bucket,null,catalogImportProjection,new D1AiReviewAdoption(env.otw_db));
}

async function sendRecoveryMessage(env:Env,message:TransitionOperationMessage) {
  if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error("Missing selected recovery queue");
  await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
}
export async function transitionPeer(env:Env,id:string,role:"source"|"target") {
  const {site,database,bucket}=parseSiteStorageResources(env);
  const repository=new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection);
  const own=await repository.describePeer(id);
  if(own.role!==role) throw new Error("Wrong relay role");
  const peer=env.CONTENT_TRANSITION_PEER;
  if(!peer) throw new Error("Missing transition peer binding");
  const actual=await peer.describe(id);
  const expectedSite=role==="source"?own.identity.targetSite:own.identity.sourceSite;
  const expectedResource=role==="source"?own.identity.targetResource:own.identity.sourceResource;
  if(actual.schema!==1 || actual.schemaDigest!==own.schemaDigest || actual.receiverContract!==own.receiverContract || actual.site===own.site || actual.site!==expectedSite || actual.resource!==expectedResource || actual.role===role || actual.approvalDigest!==own.approvalDigest || Object.keys(own.identity).some(key=>own.identity[key as keyof typeof own.identity]!==actual.identity?.[key as keyof typeof own.identity])) throw new Error("Transition peer runtime/schema/receiver/approval mismatch");
  return {repository,peer};
}

export async function deliverTransitionOutcome(env:Env,id:string,kind:"operation"|"file",recordId:string) {
  if(kind==='operation') {
    const repository=buildContentTransitionRepository(env),operation=await repository.exportOperation(id,recordId);
    if(operation.codec.id==='otw-play.ai.unknown'&&!operation.outcome?.aiResume&&!operation.outcome?.aiReview?.continuation) {
      const {site,database}=parseSiteStorageResources(env);
      if(await new D1AiUnknownControl(env.otw_db,site,database).acknowledgeLocal(id,recordId,operation.payloadHash))return repository.readOutcomeReceipt(id,kind,recordId);
    }
    if(operation.codec.id==='otw-play.ai.resume'||operation.outcome?.aiResume||operation.outcome?.aiReview?.continuation) {
      const {site,database}=parseSiteStorageResources(env);
      await new D1AiResumeControl(env.otw_db,site,database).acknowledge(id,recordId,operation.payloadHash);
      return repository.readOutcomeReceipt(id,kind,recordId);
    }
  }
  const {repository,peer}=await transitionPeer(env,id,"target");
  const receipt=await peer.acknowledgeOutcome(id,kind,recordId);
  await repository.confirmOutcomeAcknowledgement(receipt);
  return receipt;
}

export function buildScheduleTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1ScheduleTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site);
}
export function buildChzzkScanTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1ChzzkScanTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),new D1ChzzkReadJournal(env.otw_db,site,database),site,async id=>(await transitionPeer(env,id,"target")).peer,message=>sendRecoveryMessage(env,message));
}
export function buildCollectorTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1CollectorTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site);
}
export function buildPendingTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1PendingTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site);
}
export function buildLiveScheduleTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1LiveScheduleTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site);
}

export function buildNoticeTransitionWriter(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1NoticeTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site);
}
export function buildDDayTransitionWriter(env:Env,identity:DDayRequestIdentity) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1DDayTransitionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site,identity);
}
