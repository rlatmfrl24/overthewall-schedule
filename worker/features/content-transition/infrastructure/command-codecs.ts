import {parseReviewDeletion} from '../../otw-play/commands';
import {parseUnknownAiReviewCommand,parseResumeAiReviewCommand} from '../../otw-play/commands';
import {parseCandidateReviewMutation} from '../../otw-play/commands';
import {parseConversionOutcome} from '../../otw-play/commands';
import {parseCandidateMetadataMutation,parseCandidateChannelMutation} from '../../otw-play/commands';
import {reviewDeletionTable} from './play-review-deletion';
import {parseScheduleInput,parseScheduleCommand,parsePendingCommand,parseLiveSchedulePlan,parseChzzkScanCommand,parseChzzkScanResult,parseCollectorCommand} from "../../schedules/commands";
import {assertCollectorState} from "./collector-mutation";
import {assertPendingState} from "./pending-mutation";
import {assertChzzkScanState} from "./chzzk-scan-state";
import {parseUpdateSong,parseCreateSong,parseEntityMutation,parsePublicationCommand,parseChannelMutation,parseVideoCatalogMutation} from "../../otw-play/commands";
import {playVideoSubject} from "./play-video-mutation";
import {parseYouTubeMetadataFailure} from "./youtube-channel-read";
import {assertPlayChannelState} from "./play-channel-mutation";
import {parseYouTubeChannelResponse,youtubeChannelRequest} from "./youtube-channel-read";
import {parseFileReplacement} from "../../assets/commands";
import {parseXRedaction} from "../../x-posts/commands";
import {parseNoticeCommand,parseLocalNoticeCommand} from "../../notices/commands";
import {noticeColumns} from "./notice-mutation";
import {parseDDayCommand} from "../../ddays/commands";
import {ddayColumns} from "./dday-mutation";
import {transitionCommandCapability} from "../domain/receiver-contract";
import {assertXRedactionState} from "./x-redaction-mutation";
import {assertPlaySongState} from "./play-song-mutation";
import {assertPlayEntityState} from "./play-entity-mutation";
import {assertPlayPublicationState} from "./play-publication-mutation";
import {parseCatalogDeleteCommand} from "../../otw-play/commands";
import {parseProposalRejection} from "../../otw-play/commands";
import {parseMemberSubmissionMutation,memberSubmissionVersion} from "../../otw-play/commands";
import {assertPlayDeleteState,catalogDeleteTable} from "./play-delete-mutation";
import {projectCapturedRecord,projectBusinessJson,historicalRecordId,type ProjectionContext,type JsonValue} from "../domain/projected-content";
import type {AcceptedOperation,OperationEnvelope} from "../../../../contracts/content-transition";

export interface TransitionCommand {codec:{id:string;version:number};payload:Readonly<Record<string,unknown>>}
/** Closed registration: new producer contracts require an owning validator and
 * explicit projection. No dynamic callback registry or opaque payload bypass. */
export async function parseTransitionCommand(raw:unknown,context:ProjectionContext,side:"source"|"target"):Promise<TransitionCommand> {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Unregistered transition command");
  const command=raw as TransitionCommand;
  if(command.codec?.version!==transitionCommandCapability(command.codec?.id)?.version || !command.payload || typeof command.payload!=="object" || Array.isArray(command.payload)) throw new Error("Unregistered transition command");
  if(side==="target" && Object.keys(command.codec).sort().join(",")!=="id,version") throw new Error("Target codec must match the positive allowlist");
  let payload:Record<string,unknown>;
  switch(command.codec.id) {
    case 'otw-play.ai.resume': {
      const parsed=parseResumeAiReviewCommand(command.payload);
      if(!parsed)throw new Error('Invalid original unissued AI responsibility');
      payload={...parsed};break;
    }
    case 'otw-play.ai.unknown': {
      const parsed=parseUnknownAiReviewCommand(command.payload);
      if(!parsed) throw new Error('Invalid original unknown AI responsibility');
      payload={...parsed};break;
    }
    case 'otw-play.candidate.channel_approve': {
      const parsed=parseCandidateChannelMutation(command.payload);
      if(!parsed) throw new Error('Invalid original channel approval parent');
      payload={...parsed};break;
    }
    case 'otw-play.candidate.refresh': {
      const parsed=parseCandidateMetadataMutation(command.payload);
      if(!parsed) throw new Error('Invalid original metadata refresh');
      payload={...parsed};break;
    }
    case 'otw-play.candidate.local': {
      const {action,candidateId,expectedVersion}=command.payload;
      if(!['save','ignore','change_kind'].includes(String(action))||!text(candidateId)||!time(expectedVersion)) throw new Error('Invalid local candidate review');
      payload={action,candidateId,expectedVersion};break;
    }
    case 'otw-play.candidate.mutate': {
      const parsed=parseCandidateReviewMutation(command.payload);
      if(!parsed||context.members.some(member=>member.uid!==member.targetUid)) throw new Error('Invalid native candidate review');
      payload={...parsed};break;
    }
    case "otw-play.review.delete_local":
    case "otw-play.review.delete": {
      const parsed=parseReviewDeletion(command.payload);
      if(!parsed || command.codec.id==='otw-play.review.delete' && context.members.some(member=>member.uid!==member.targetUid)) throw new Error('Invalid original review deletion');
      payload={...parsed};break;
    }
    case "otw-play.member.local": {
      const {action,proposalId,expectedVersion}=command.payload;
      if(!["create","update","withdraw"].includes(String(action)) || !text(proposalId) || (action==="create"?expectedVersion!==null:!Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<0)) throw new Error("Invalid local submission command");
      payload={action,proposalId,expectedVersion};break;
    }
    case "otw-play.member.mutate": {
      const parsed=parseMemberSubmissionMutation(command.payload);
      if(!parsed || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native submission command");
      payload={...parsed};break;
    }
    case "otw-play.proposal.reject_local": {
      const {id,expectedVersion}=command.payload;
      if(!text(id) || !Number.isSafeInteger(expectedVersion) || Number(expectedVersion)<0) throw new Error("Invalid source proposal rejection");
      payload={id,expectedVersion};break;
    }
    case "otw-play.proposal.reject": {
      const parsed=parseProposalRejection(command.payload);
      if(!parsed || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native proposal rejection");
      payload={...parsed};break;
    }
    case 'otw-play.conversion-outcome.local':
    case 'otw-play.conversion-outcome.mutate': {
      const parsed=parseConversionOutcome(command.payload);
      if(!parsed||command.codec.id==='otw-play.conversion-outcome.mutate'&&(parsed.jobOnly||context.members.some(member=>member.uid!==member.targetUid))) throw new Error('Invalid own-site conversion outcome');
      payload={...parsed,jobId:side==='source'&&command.codec.id==='otw-play.conversion-outcome.local'&&parsed.jobId!==null?await historicalRecordId(context.sourceSite,'music_ingestion_jobs',JSON.stringify([parsed.jobId])):parsed.jobId};break;
    }
    case "otw-play.video.mutate":
    case "otw-play.candidate.convert": {
      const parsed=parseVideoCatalogMutation(command.payload);
      if(!parsed||(command.codec.id==='otw-play.candidate.convert')!==(parsed.action==='candidate_convert')) throw new Error('Invalid original video catalog command');
      const entity=(id:string)=>context.entities?.find(item=>item.sourceId===id)?.targetId??id;
      if(parsed.action==='candidate_convert') {
        const reviewInput=projectBusinessJson(parsed.input.reviewInput,'review_input',context);
        const ids={...parsed.ids,entityIds:{...parsed.ids.entityIds},entityEventIds:{...parsed.ids.entityEventIds}};
        for(const member of context.members) for(const field of ['entityIds','entityEventIds'] as const) {
          const old=`member:${member.uid}`;
          if(member.targetUid===null) delete ids[field][old];
          else if(member.targetUid!==member.uid&&ids[field][old]) {ids[field][`member:${member.targetUid}`]=ids[field][old];delete ids[field][old];}
        }
        payload={...parsed,ids,input:{...parsed.input,reviewInput,jobId:side==='source'&&parsed.input.jobId!==null?await historicalRecordId(context.sourceSite,'music_ingestion_jobs',JSON.stringify([parsed.input.jobId])):parsed.input.jobId}};
      } else if(parsed.action==='performance_create') payload={...parsed,input:{...parsed.input,participants:parsed.input.participants.map(item=>({...item,entityId:entity(item.entityId)}))}};
      else {
        const input=parsed.input;
        const references=projectBusinessJson({participants:input.participants,...(parsed.action==='performance_update'?{}:{song:parsed.input.song})},'review_input',context) as {participants:JsonValue;song?:JsonValue};
        const ids={...parsed.ids,entityIds:{...parsed.ids.entityIds},entityEventIds:{...parsed.ids.entityEventIds}};
        for(const member of context.members) for(const field of ['entityIds','entityEventIds'] as const) {
          const old=`member:${member.uid}`;
          // Externalized subjects already name an installed approved entity.
          // Their unused source member-keyed generated IDs must stay private.
          if(member.targetUid===null) delete ids[field][old];
          else if(member.targetUid!==member.uid&&ids[field][old]) {ids[field][`member:${member.targetUid}`]=ids[field][old];delete ids[field][old];}
        }
        if(parsed.action==='performance_update') payload={...parsed,ids,input:{...input,participants:references.participants}};
        else {
          let channel:unknown=parsed.input.channel;
          if(parsed.input.channel.kind==='recognized_member') {
            const decision=parsed.input.channel,member=context.members.find(item=>item.uid===decision.memberUid);
            if(!member) throw new Error('Original recognized channel requires its captured source identity');
            if(member.targetUid!==null) channel={...decision,memberUid:member.targetUid};
            else {
              if(!member.externalEntityId) throw new Error('Missing captured external channel credit');
              channel={kind:'confirm',channelRole:decision.channelRole,owners:[{kind:'entity',entityId:member.externalEntityId}]};
            }
          } else if(parsed.input.channel.kind!=='existing') {
            const owners=projectBusinessJson({originalArtists:parsed.input.channel.owners.map(subject=>({subject,creditOrder:0,isPrimary:false}))},'catalog_event',context) as {originalArtists:{subject:JsonValue}[]};
            channel={...parsed.input.channel,owners:owners.originalArtists.map(item=>item.subject)};
          }
          payload={...parsed,ids,input:{...input,participants:references.participants,song:references.song,channel}};
        }
      }
      if(!parseVideoCatalogMutation(payload)) throw new Error('Invalid projected video catalog command');
      break;
    }
    case "otw-play.channel.mutate": {
      const parsed=parseChannelMutation(command.payload);
      if(!parsed || typeof command.payload.expectedState!=="string") throw new Error("Invalid original channel mutation");
      assertPlayChannelState(JSON.parse(command.payload.expectedState));
      payload={...parsed,expectedState:command.payload.expectedState};break;
    }
    case "schedules.collector_local": {
      if(!["insert_candidate","obsolete_candidate","holiday_obsolete","holiday_create"].includes(String(command.payload.action)) || !Array.isArray(command.payload.memberUids) || !command.payload.memberUids.length) throw new Error("Invalid local collector command");
      payload={action:command.payload.action,memberUids:command.payload.memberUids.map(uid=>{
        const member=context.members.find(member=>member.uid===uid);if(!member?.targetUid) throw new Error("Unapproved local collector member");return member.targetUid;
      })};break;
    }
    case "schedules.collector": {
      const parsed=parseCollectorCommand(command.payload);
      if(!parsed || typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native collector command");
      assertCollectorState(JSON.parse(command.payload.expectedState));payload={...parsed,expectedState:command.payload.expectedState};break;
    }
    case "schedules.chzzk_scan": {
      const parsed=parseChzzkScanCommand(command.payload);
      if(!parsed) throw new Error("Invalid CHZZK scan command");
      payload={...parsed,members:parsed.members.map(member=>{
        const selected=context.members.find(row=>row.uid===member.uid);
        if(!selected?.targetUid) throw new Error("Unapproved CHZZK scan member");
        return {...member,uid:selected.targetUid};
      })};
      if(typeof command.payload.expectedState!=="string") throw new Error("Missing original CHZZK state");
      const state:unknown=JSON.parse(command.payload.expectedState);assertChzzkScanState(state);
      const projected:typeof state={observations:[],assessments:[]};
      for(const key of ["observations","assessments"] as const) for(const row of state[key]) {
        const selected=context.members.find(member=>member.uid===row.member_uid);
        if(!selected?.targetUid || !parsed.members.some(member=>member.uid===row.member_uid)) throw new Error("CHZZK expected row outside original scope");
        projected[key].push({...row,member_uid:selected.targetUid});
      }
      payload.expectedState=JSON.stringify(projected);break;
    }
    case "schedules.live_local": {
      const {action,memberUid,date,scheduleId}=command.payload,member=context.members.find(member=>member.uid===memberUid);
      if(!member?.targetUid || !["create","update"].includes(String(action)) || typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(action==="create"?scheduleId===null:Number.isSafeInteger(scheduleId) && Number(scheduleId)>0)) throw new Error("Invalid local live-fill command");
      payload={action,memberUid:member.targetUid,date,scheduleId};break;
    }
    case "schedules.live_fill": {
      const plan=parseLiveSchedulePlan(command.payload.plan);
      if(!plan || !context.members.some(member=>member.uid===plan.memberUid && member.targetUid===plan.memberUid) || !Array.isArray(command.payload.expectedRows)) throw new Error("Invalid native live-fill command");
      for(const row of command.payload.expectedRows) {assertScheduleExpectedState(row,row?.id);if(row.member_uid!==plan.memberUid || row.date!==plan.scheduleDate) throw new Error("Live expected state outside affected member-day");}
      payload={plan,expectedRows:command.payload.expectedRows};break;
    }
    case "pending.local": {
      const {action,id,memberUid}=command.payload;
      const member=context.members.find(member=>member.uid===memberUid);
      if(!["approve","reject","apply_empty","reset_processed","reopen_rejection"].includes(String(action)) || !Number.isSafeInteger(id) || Number(id)<=0 || !member?.targetUid) throw new Error("Invalid local pending command");
      payload={action,id,memberUid:member.targetUid};
      break;
    }
    case "pending.mutate": {
      const parsed=parsePendingCommand(command.payload);
      const {memberUid,date,holiday,expectedState}=command.payload;
      if(!parsed || !context.members.some(member=>member.uid===memberUid && member.targetUid===memberUid) || typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof holiday!=="boolean" || typeof expectedState!=="string") throw new Error("Invalid native pending command");
      assertPendingState(JSON.parse(expectedState));
      payload={...parsed,memberUid,date,holiday,expectedState};
      break;
    }
    case "ddays.local": {
      const {action,id}=command.payload;
      if(!["update","delete"].includes(String(action)) || !Number.isSafeInteger(id) || Number(id)<=0) throw new Error("Invalid local D-day command");
      payload={action,id};
      break;
    }
    case "ddays.create":
    case "ddays.mutate": {
      const parsed=parseDDayCommand(command.payload);
      if(!parsed || (parsed.action==="create")!==(command.codec.id==="ddays.create") || typeof command.payload.expectedRows!=="string") throw new Error("Invalid native D-day command");
      const rows:unknown=JSON.parse(command.payload.expectedRows);
      if(!Array.isArray(rows) || rows.length>1 || parsed.action==="create" && rows.length!==0 || rows.some(row=>!row || typeof row!=="object" || Object.keys(row).sort().join(",")!==[...ddayColumns].sort().join(",") || Object.values(row).some(value=>value!==null && typeof value!=="string" && typeof value!=="number"))) throw new Error("Invalid D-day expected-state allowlist");
      payload={...parsed,expectedRows:command.payload.expectedRows};
      break;
    }
    case "notices.local": {
      const parsed=parseLocalNoticeCommand(command.payload);
      if(!parsed) throw new Error("Invalid local notice command");
      payload=parsed;
      break;
    }
    case "notices.mutate": {
      const parsed=parseNoticeCommand(command.payload);
      if(!parsed || typeof command.payload.expectedRows!=="string") throw new Error("Invalid native notice command");
      const rows:unknown=JSON.parse(command.payload.expectedRows);
      if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...noticeColumns].sort().join(",") || Object.values(row).some(value=>value!==null && typeof value!=="string" && typeof value!=="number"))) throw new Error("Invalid notice expected-state allowlist");
      payload={...parsed,expectedRows:command.payload.expectedRows};
      break;
    }
    case "schedules.local":
    case "schedules.mutate": {
      const parsed=parseScheduleCommand(command.payload);
      if(!parsed || !Array.isArray(command.payload.expectedRows)) throw new Error("Invalid schedule mutation command");
      const expectedRows=[];
      for(const raw of command.payload.expectedRows) {
        assertScheduleExpectedState(raw,raw?.id);
        const projected=await projectCapturedRecord("schedules",JSON.stringify([raw.id]),raw,context);
        if(projected) {
          const {content_access:access,...expected}=projected.value;
          void access;
          expectedRows.push(expected);
        }
      }
      if(parsed.action==="delete") payload={...parsed,expectedRows};
      else {
        const member=context.members.find(member=>member.uid===parsed.input.member_uid);
        if(!member) throw new Error("Unapproved schedule command member");
        if(member.targetUid===null) {
          if(command.codec.id!=="schedules.local" || parsed.input.id===null) throw new Error("Unapproved schedule command member");
          payload={action:"delete",id:parsed.input.id,expectedRows};
        } else payload={...parsed,input:{...parsed.input,member_uid:member.targetUid},expectedRows};
      }
      break;
    }
    case "x-posts.local_redaction":
    case "x-posts.redact": {
      const parsed=parseXRedaction(command.payload);
      if(!parsed) throw new Error("Invalid X redaction command");
      payload=parsed;
      if(command.codec.id==="x-posts.redact") {
        if(typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native X redaction state");
        assertXRedactionState(JSON.parse(command.payload.expectedState));payload.expectedState=command.payload.expectedState;
      }
      break;
    }
    case "assets.replace": {
      const parsed=parseFileReplacement(command.payload);
      if(!parsed) throw new Error("Invalid file replacement command");
      const member=parsed.memberUid===null?null:context.members.find(member=>member.uid===parsed.memberUid);
      if(parsed.memberUid!==null && !member?.targetUid) throw new Error("Unapproved file member");
      payload={...parsed,memberUid:member?.targetUid??null};
      break;
    }
    case "otw-play.delete.local":
    case "otw-play.delete.mutate": {
      const parsed=parseCatalogDeleteCommand(command.payload);if(!parsed) throw new Error("Invalid catalog deletion command");
      if(command.codec.id==="otw-play.delete.mutate") {
        if(typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native deletion state");
        assertPlayDeleteState(JSON.parse(command.payload.expectedState),parsed);payload={...parsed,expectedState:command.payload.expectedState};
      } else payload={...parsed};
      break;
    }
    case "otw-play.publication.local":
    case "otw-play.publication.mutate": {
      const parsed=parsePublicationCommand(command.payload);if(!parsed) throw new Error("Invalid publication command");
      if(command.codec.id==="otw-play.publication.mutate") {
        if(typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native publication state");
        assertPlayPublicationState(JSON.parse(command.payload.expectedState));payload={...parsed,expectedState:command.payload.expectedState};
      } else payload={...parsed};
      break;
    }
    case "otw-play.entity.local": {
      const {action,id,expectedVersion}=command.payload;
      if(!["create","update"].includes(String(action)) || !text(id) || (action==="create"?expectedVersion!==null:!Number.isSafeInteger(expectedVersion) || Number(expectedVersion)<0)) throw new Error("Invalid local entity mutation");
      payload={action,id,expectedVersion};break;
    }
    case "otw-play.entity.mutate": {
      const parsed=parseEntityMutation(command.payload);
      if(!parsed || typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native entity mutation");
      assertPlayEntityState(JSON.parse(command.payload.expectedState));payload={...parsed,expectedState:command.payload.expectedState};break;
    }
    case "otw-play.song.local_update": {
      const {id,expectedVersion}=command.payload;
      if(typeof id!=="string" || !id || !Number.isSafeInteger(expectedVersion) || Number(expectedVersion)<0) throw new Error("Invalid local song mutation");
      payload={id,expectedVersion};break;
    }
    case "otw-play.song.mutate": {
      const parsed=parseUpdateSong(command.payload);
      if(!parsed.ok || typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native song mutation");
      assertPlaySongState(JSON.parse(command.payload.expectedState));
      payload={...parsed.value,expectedState:command.payload.expectedState};break;
    }
    case "otw-play.song.create": {
      const parsed=parseCreateSong(command.payload.input);
      if(!parsed.ok || !text(command.payload.id) || typeof command.payload.expectedState!=="string" || context.members.some(member=>member.uid!==member.targetUid)) throw new Error("Invalid native song creation");
      assertPlaySongState(JSON.parse(command.payload.expectedState));
      payload={id:command.payload.id,input:parsed.value,expectedVersion:null,expectedState:command.payload.expectedState};break;
    }
    default:throw new Error("Unregistered transition command");
  }
  if(side==="target" && JSON.stringify(payload)!==JSON.stringify(command.payload)) throw new Error("Target command must match the parsed positive allowlist");
  return {codec:{id:command.codec.id,version:1},payload};
}

const keys=(value:unknown,allowed:string)=>!!value && typeof value==="object" && !Array.isArray(value) && Object.keys(value).sort().join(",")===allowed;
const text=(value:unknown)=>typeof value==="string" && value.length>0;
const time=(value:unknown)=>Number.isSafeInteger(value) && Number(value)>=0;
export function assertScheduleExpectedState(state:NonNullable<AcceptedOperation["expectedState"]>,id:unknown):void {
  if(!keys(state,"created_at,date,id,member_uid,start_time,status,title") || !parseScheduleInput(state,{requireId:true}) || state.id!==id || typeof state.member_uid!=="number" || !["string","number"].includes(typeof state.created_at) && state.created_at!==null) throw new Error("Schedule expected state allowlist mismatch");
}
export function assertOperationMetadata(operation:AcceptedOperation&Partial<Pick<OperationEnvelope,"outcome">>):void {
  if(!text(operation.transitionId) || !text(operation.operationId) || !text(operation.idempotencyKey) || !time(operation.admittedAt) || !time(operation.validation?.validatedAt) || operation.validation?.contract!==1 || !keys(operation.validation,"contract,validatedAt") || !keys(operation.subject,"key,table") || !(operation.expectedVersion===null || time(operation.expectedVersion))) throw new Error("Invalid operation metadata allowlist");
  let key:unknown;
  try { key=JSON.parse(operation.subject.key); } catch { throw new Error("Invalid command subject"); }
  if(!Array.isArray(key) || key.length!==1) throw new Error("Invalid command subject");
  if(['otw-play.ai.unknown','otw-play.ai.resume'].includes(operation.codec.id) && (operation.kind!=='content_edit'||operation.subject.table!=='music_ingestion_candidates'||key[0]!==operation.payload.candidateId||operation.expectedVersion!==operation.payload.expectedVersion)) throw new Error('Original AI subject identity mismatch');
  if(operation.outcome?.aiReview && (!['otw-play.ai.unknown','otw-play.ai.resume'].includes(operation.codec.id)||operation.outcome.aiReview.operationId!==operation.operationId||(operation.codec.id==='otw-play.ai.resume'||operation.outcome.aiReview.continuation?['requestHash','evidenceHash']:['attemptId','requestHash','evidenceHash','issuance']).some(key=>operation.outcome!.aiReview![key as 'attemptId']!==operation.payload[key])||(operation.codec.id==='otw-play.ai.resume'||operation.outcome.aiReview.continuation)&&operation.outcome.aiReview.issuance!=='issued')) throw new Error('AI closure belongs to a different original responsibility');
  if(operation.outcome?.aiResume&&(!['otw-play.ai.resume','otw-play.ai.unknown'].includes(operation.codec.id)||operation.outcome.aiResume.operationId!==operation.operationId||['requestHash','evidenceHash'].some(key=>operation.outcome!.aiResume![key as 'requestHash']!==operation.payload[key])))throw new Error('AI continuation result belongs to a different original request');
  if(operation.outcome?.aiReviewResult && (operation.codec.id!=='otw-play.ai.unknown'||operation.outcome.aiReviewResult.operationId!==operation.operationId||['attemptId','requestHash','evidenceHash','issuance'].some(key=>operation.outcome!.aiReviewResult![key as 'attemptId']!==operation.payload[key]))) throw new Error('AI response belongs to a different original responsibility');
  if(operation.outcome?.outcome==='administratively_closed' && !operation.outcome.aiReview) throw new Error('Administrative closure requires exact AI evidence');
  if(operation.codec.id==="schedules.chzzk_scan" && (operation.kind!=="collection_due" || operation.subject.table!=="schedule_broadcast_observations" || key[0]!==operation.operationId || operation.expectedVersion!==null)) throw new Error("CHZZK scan subject identity mismatch");
  if(operation.codec.id.startsWith("schedules.collector") && (operation.kind!=="content_edit" || operation.subject.table!=="pending_schedules" || key[0]!==operation.operationId || operation.expectedVersion!==null)) throw new Error("Collector mutation subject mismatch");
  if(["x-posts.redact","x-posts.local_redaction"].includes(operation.codec.id) && (operation.kind!=="redaction" || operation.subject.table!=="x_posts" || key[0]!==operation.payload.postId || operation.expectedVersion!==null)) throw new Error("Redaction command subject/version mismatch");
  if(operation.codec.id==="assets.replace" && (operation.kind!=="content_edit" || operation.subject.table!=="asset_file_references" || key[0]!==operation.payload.logicalKey || operation.expectedVersion!==null)) throw new Error("File command subject/version mismatch");
  if(operation.codec.id==="schedules.mutate" || operation.codec.id==="schedules.local") {
    const command=parseScheduleCommand(operation.payload);
    if(!command || operation.subject.table!=="schedules" || key[0]!== (command.action==="delete"?command.id:command.input.id) || !["content_edit","intentional_removal"].includes(operation.kind) || operation.expectedVersion!==null) throw new Error("Schedule mutation subject/version mismatch");
  }
  if(operation.codec.id==="notices.local" && (operation.subject.table!=="notices" || key[0]!==null || operation.expectedVersion!==null || !["content_edit","intentional_removal"].includes(operation.kind))) throw new Error("Local notice subject mismatch");
  if(operation.codec.id.startsWith("ddays.")) {
    if(operation.subject.table!=="ddays" || key[0] !== (operation.payload.action==="create"?null:operation.payload.id) || operation.expectedVersion!==null || operation.kind!==(operation.payload.action==="delete"?"intentional_removal":"content_edit")) throw new Error("D-day subject mismatch");
  }
  if(operation.codec.id.startsWith("pending.") && (operation.subject.table!==(operation.payload.action==="reopen_rejection"?"schedule_candidate_rejections":"pending_schedules") || key[0]!==operation.payload.id || operation.expectedVersion!==null || operation.kind!=="content_edit")) throw new Error("Pending command subject mismatch");
  if(operation.codec.id==="schedules.live_local" || operation.codec.id==="schedules.live_fill") {
    const id=operation.codec.id==="schedules.live_local"?operation.payload.scheduleId:parseLiveSchedulePlan(operation.payload.plan)?.scheduleId;
    if(operation.subject.table!=="schedules" || key[0]!==id || operation.expectedVersion!==null || operation.kind!=="content_edit") throw new Error("Live-fill subject mismatch");
  }
  if(operation.codec.id==="notices.mutate") {
    const command=parseNoticeCommand(operation.payload);
    if(!command || operation.subject.table!=="notices" || key[0]!== (command.action==="create"?null:command.id) || operation.expectedVersion!==null || !["content_edit","intentional_removal"].includes(operation.kind)) throw new Error("Notice subject mismatch");
  }
  if(operation.expectedState!==null) throw new Error("Unexpected command expected state");
  if(operation.codec.id.startsWith("otw-play.song.") && (operation.kind!=="content_edit" || operation.subject.table!=="music_songs" || !text(key[0]) || key[0]!==operation.payload.id || operation.expectedVersion!==operation.payload.expectedVersion)) throw new Error("Song command subject/version mismatch");
  if(operation.codec.id.startsWith("otw-play.entity.")) {
    const parsed=operation.codec.id==="otw-play.entity.mutate"?parseEntityMutation(operation.payload):null;
    const expected=parsed?(parsed.action==="update"?parsed.input.expectedVersion:null):operation.payload.expectedVersion;
    if(operation.kind!=="content_edit" || operation.subject.table!=="music_entities" || !text(key[0]) || key[0]!==operation.payload.id || operation.expectedVersion!==expected) throw new Error("Entity command subject/version mismatch");
  }
  if(['otw-play.video.mutate','otw-play.candidate.convert'].includes(operation.codec.id)) {
    const command=parseVideoCatalogMutation(operation.payload),subject=command?playVideoSubject(command):null;
    if(!subject||operation.kind!=='content_edit'||operation.subject.table!==subject.table||key[0]!==subject.id||operation.expectedVersion!==subject.version) throw new Error('Video command subject/version mismatch');
    if(operation.outcome?.outcome==='committed'&&operation.outcome.youtubeVideo?.reads.some(read=>read.disposition==='not_issued')&&command?.action!=='proposal_approve'&&command?.action!=='candidate_convert') throw new Error('Unused reads require an original caller shortcut');
  }
  if(operation.outcome?.youtubeVideo&&Boolean(operation.outcome.youtubeVideo.flow)!==(operation.codec.id==='otw-play.candidate.channel_approve')) throw new Error('Original metadata flow/codec mismatch');
  if(operation.codec.id==='otw-play.candidate.channel_approve') {
    const command=parseCandidateChannelMutation(operation.payload);
    if(!command||operation.kind!=='content_edit'||operation.subject.table!=='music_ingestion_candidates'||key[0]!==command.candidateId||operation.expectedVersion!==command.expectedVersion) throw new Error('Channel approval parent subject mismatch');
  }
  if(operation.codec.id==='otw-play.candidate.refresh') {
    const command=parseCandidateMetadataMutation(operation.payload);
    if(!command||operation.kind!=='content_edit'||operation.subject.table!=='music_ingestion_candidates'||key[0]!==command.candidateId||operation.expectedVersion!==command.expectedVersion||operation.outcome?.outcome==='committed'&&operation.outcome.youtubeVideo?.reads.some(read=>read.disposition!=='consumed')) throw new Error('Metadata refresh subject/result mismatch');
  }
  if(operation.codec.id==="otw-play.channel.mutate") {
    const command=parseChannelMutation(operation.payload);
    if(!command || operation.kind!=="content_edit" || operation.subject.table!=="music_channels" || key[0]!==command.id || operation.expectedVersion!==(command.action==="update"?command.input.expectedVersion:null)) throw new Error("Channel command subject/version mismatch");
  }
  if(operation.codec.id.startsWith("otw-play.publication.") && (operation.kind!=="content_edit" || operation.subject.table!=="music_performances" || !text(key[0]) || key[0]!==operation.payload.id || operation.expectedVersion!==operation.payload.expectedVersion)) throw new Error("Publication command subject/version mismatch");
  if(operation.codec.id.startsWith('otw-play.review.')) {
    const command=parseReviewDeletion(operation.payload);
    if(!command||operation.kind!=='content_edit'||operation.subject.table!==reviewDeletionTable(command)||key[0]!==command.id||operation.expectedVersion!==command.expectedVersion) throw new Error('Review deletion subject/version mismatch');
  }
  if(operation.codec.id.startsWith('otw-play.conversion-outcome.')) {
    const command=parseConversionOutcome(operation.payload);
    if(!command||operation.kind!=='content_edit'||operation.subject.table!==(command.jobOnly?'music_ingestion_jobs':'music_ingestion_candidates')||key[0]!==(command.jobOnly?command.jobId:command.candidateId)||operation.expectedVersion!==null) throw new Error('Conversion outcome subject mismatch');
  }
  if(['otw-play.candidate.local','otw-play.candidate.mutate'].includes(operation.codec.id)&&(operation.kind!=='content_edit'||operation.subject.table!=='music_ingestion_candidates'||key[0]!==operation.payload.candidateId||operation.expectedVersion!==(operation.payload.action==='save'?null:operation.payload.expectedVersion))) throw new Error('Candidate review subject/version mismatch');
  if(operation.codec.id.startsWith("otw-play.member.")) {
    const parsed=operation.codec.id==="otw-play.member.mutate"?parseMemberSubmissionMutation(operation.payload):null;
    if(operation.kind!=="content_edit" || operation.subject.table!=="music_cover_proposals" || !text(key[0]) || key[0]!==operation.payload.proposalId || operation.expectedVersion!==(parsed?memberSubmissionVersion(parsed):operation.payload.expectedVersion)) throw new Error("Member submission subject/version mismatch");
  }
  if(operation.codec.id.startsWith("otw-play.proposal.")) {
    const parsed=operation.codec.id==="otw-play.proposal.reject"?parseProposalRejection(operation.payload):null;
    if(operation.kind!=="content_edit" || operation.subject.table!=="music_cover_proposals" || !text(key[0]) || key[0]!==operation.payload.id || operation.expectedVersion!==(parsed?parsed.input.expectedVersion:operation.payload.expectedVersion)) throw new Error("Proposal rejection subject/version mismatch");
  }
  if(operation.codec.id.startsWith("otw-play.delete.")) {
    const command=parseCatalogDeleteCommand(operation.payload);
    if(!command || operation.kind!=="content_edit" || operation.subject.table!==catalogDeleteTable[command.kind] || key[0]!==command.id || operation.expectedVersion!==command.expectedVersion) throw new Error("Deletion command subject/version mismatch");
  }
}
export function assertOperationEvidence(envelope:Pick<OperationEnvelope,"attempt"|"outcome">):void {
  if(envelope.attempt!==null && (!keys(envelope.attempt,"identity,status") || !text(envelope.attempt.identity) || !["attempted","unknown","completed","failed"].includes(envelope.attempt.status))) throw new Error("Invalid attempt allowlist");
  if(envelope.outcome!==null && (!keys(envelope.outcome,envelope.outcome.aiResume?'aiResume,detail,outcome,sideEffectReconciled':envelope.outcome.aiReview?'aiReview,detail,outcome,sideEffectReconciled':envelope.outcome.aiReviewResult?'aiReviewResult,detail,outcome,sideEffectReconciled':envelope.outcome.chzzkScan?"chzzkScan,detail,outcome,sideEffectReconciled":envelope.outcome.youtubeChannel?"detail,outcome,sideEffectReconciled,youtubeChannel":envelope.outcome.youtubeVideo?"detail,outcome,sideEffectReconciled,youtubeVideo":"detail,outcome,sideEffectReconciled") || typeof envelope.outcome.detail!=="string" || typeof envelope.outcome.sideEffectReconciled!=="boolean" || !["committed","conflicted","failed","administratively_closed"].includes(envelope.outcome.outcome))) throw new Error("Invalid outcome allowlist");
  if(envelope.outcome?.aiResume) {
    const c=envelope.outcome.aiResume;
    if(!keys(c,'confirmationHash,disposition,evidenceHash,executionId,operationId,requestHash,resultHash,status')||c.disposition!=='confirmed_result'||!['succeeded','partial','failed'].includes(c.status)||![c.requestHash,c.evidenceHash,c.confirmationHash,c.resultHash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||![c.operationId,c.executionId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v))||!envelope.outcome.sideEffectReconciled||envelope.outcome.outcome!==(c.status==='failed'?'failed':'committed')||!envelope.attempt||envelope.attempt.status!==(c.status==='failed'?'failed':'completed'))throw new Error('Invalid confirmed AI completion');
  }
  if(envelope.outcome?.aiReviewResult) {
    const c=envelope.outcome.aiReviewResult;
    if(!keys(c,'attemptId,disposition,evidenceHash,issuance,operationId,requestHash,responseHash,resultHash,status')||c.disposition!=='response_consumed'||!['issued','issuance_unknown'].includes(c.issuance)||!['succeeded','partial','failed'].includes(c.status)||![c.requestHash,c.evidenceHash,c.responseHash,c.resultHash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||![c.operationId,c.attemptId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v))||!envelope.outcome.sideEffectReconciled||envelope.outcome.outcome!==(c.status==='failed'?'failed':'committed')||envelope.attempt&&(envelope.attempt.identity!==c.attemptId||envelope.attempt.status!==(c.status==='failed'?'failed':'completed'))) throw new Error('Invalid original AI response completion');
  }
  if(envelope.outcome?.aiReview) {
    const c=envelope.outcome.aiReview;
    if(!keys(c,c.continuation?'attemptId,continuation,decidedAt,decisionId,disposition,evidenceHash,issuance,operationId,requestHash':'attemptId,decidedAt,decisionId,disposition,evidenceHash,issuance,operationId,requestHash')||c.continuation&&(!keys(c.continuation,'confirmationHash,executionId')||!/^[a-zA-Z0-9_-]{1,200}$/.test(c.continuation.executionId)||!/^[a-f0-9]{64}$/.test(c.continuation.confirmationHash)||c.issuance!=='issued')||c.disposition!=='admin_closed_unknown'||envelope.outcome.outcome!=='administratively_closed'||!envelope.outcome.sideEffectReconciled||!['issued','issuance_unknown'].includes(c.issuance)||![c.operationId,c.attemptId,c.decisionId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v))||![c.requestHash,c.evidenceHash].every(v=>/^[a-f0-9]{64}$/.test(v))||!time(c.decidedAt)||envelope.attempt&&(envelope.attempt.identity!==c.attemptId||envelope.attempt.status!=='unknown')) throw new Error('Invalid explicit AI responsibility closure');
  } else if(envelope.outcome?.outcome==='administratively_closed') throw new Error('Administrative closure is restricted to exact AI evidence');
  if(envelope.outcome?.chzzkScan) {
    const control=envelope.outcome.chzzkScan;
    if(!keys(control,"reads,result") || JSON.stringify(parseChzzkScanResult(control.result))!==JSON.stringify(control.result) || !Array.isArray(control.reads) || !control.reads.length || control.reads.some((read,index)=>!keys(read,"requestHash,requestKey,responseHash") || !text(read.requestKey) || !/^[a-f0-9]{64}$/.test(read.requestHash) || !/^[a-f0-9]{64}$/.test(read.responseHash) || control.reads.slice(0,index).some(prior=>prior.requestKey===read.requestKey))) throw new Error("Invalid CHZZK control result");
  }
  if(envelope.outcome?.youtubeVideo) {
    const control=envelope.outcome.youtubeVideo,parent=control.flow==='candidate_channel_approve';
    if(!keys(control,parent?'failure,flow,reads':'failure,reads')||!Array.isArray(control.reads)||!control.reads.length||control.reads.length>100||control.failure!==null&&!parseYouTubeMetadataFailure(control.failure)) throw new Error('Invalid original video completion');
    if(parent&&![2,4].includes(control.reads.length)) throw new Error('Invalid original approval request positions');
    const first=control.reads[0].requestKey,last=control.reads.at(-1)!.requestKey;
    if(parent&&(!/^youtube:videos:0:[A-Za-z0-9_-]{11}$/.test(first)||last!==first.replace('videos:0:','videos:3:')||control.reads.length===4&&(!/^youtube:channels:create:UC[A-Za-z0-9_-]{22}$/.test(control.reads[1].requestKey)||control.reads[2].requestKey!==control.reads[1].requestKey.replace('channels:create:','channels:update:')))) throw new Error('Changed original approval request identity');
    for(const [index,read] of control.reads.entries()) {
      const unusedAllowed=parent?index===1||index===2:envelope.outcome.detail==='Original proposal already approved; no new catalog mutation';
      if(!keys(read,'disposition,requestHash,requestKey,responseHash')||!parent&&!new RegExp(`^youtube:videos:${index}:[A-Za-z0-9_-]{11}$`).test(read.requestKey)||!/^[a-f0-9]{64}$/.test(read.requestHash)||!['consumed','not_issued','exhausted_unknown'].includes(read.disposition)||(read.disposition==='consumed'?!/^[a-f0-9]{64}$/.test(read.responseHash??''):read.responseHash!==null)||read.disposition==='exhausted_unknown'&&(envelope.outcome.outcome!=='failed'||control.failure?.code!=='network')||envelope.outcome.outcome==='committed'&&(control.failure!==null||read.disposition!=='consumed'&&!(read.disposition==='not_issued'&&unusedAllowed))) throw new Error('Invalid original video read identity/outcome');
    }
    if(parent&&envelope.outcome.outcome==='committed'&&control.reads.length!==4) throw new Error('Incomplete original channel approval');
  }
  if(envelope.outcome?.youtubeChannel) {
    const control=envelope.outcome.youtubeChannel;
    if(!keys(control,"disposition,failure,requestHash,requestKey,responseHash,result") || !/^youtube:channels:snippet:UC[A-Za-z0-9_-]{22}$/.test(control.requestKey) || !/^[a-f0-9]{64}$/.test(control.requestHash) || !["consumed","exhausted_unknown"].includes(control.disposition) || (control.disposition==="consumed"?!/^[a-f0-9]{64}$/.test(control.responseHash??""):control.responseHash!==null || control.result!==null || control.failure?.code!=="network" || envelope.outcome.outcome!=="failed")) throw new Error("Invalid original YouTube completion");
    if(control.failure) {
      const failure=control.failure;
      if(failure.code==="channel_unverified") {
        if(!keys(failure,"code,message,retryAfterMs,retryable") || failure.message!=="YouTube channel metadata could not be verified" || failure.retryable!==false || failure.retryAfterMs!==null) throw new Error("Invalid original channel validation result");
      } else if(!parseYouTubeChannelResponse({status:"error",error:failure},youtubeChannelRequest(control.requestKey.slice("youtube:channels:snippet:".length)))) throw new Error("Invalid original metadata error");
    }
    if(control.result) {
      const result=control.result,data=result.data;
      if(!keys(result,"catalogRevision,data") || !time(result.catalogRevision) || !keys(data,"active,channelRole,displayName,entityIds,externalChannelId,id,provider,verificationStatus,version") || data.provider!=="youtube" || !time(data.version) || !parseChannelMutation({action:"update",id:data.id,input:{...data,expectedVersion:data.version},eventId:"validation",now:0}) || control.failure!==null || envelope.outcome.outcome!=="committed") throw new Error("Invalid original channel result");
    }
  }
}
