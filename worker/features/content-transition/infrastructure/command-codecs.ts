import {parseScheduleInput} from "../../schedules/commands";
import {parseUpdateSong} from "../../otw-play/commands";
import {parseFileReplacement} from "../../assets/commands";
import {parseXRedaction} from "../../x-posts/commands";
import {projectCapturedRecord,projectBusinessJson,type ProjectionContext,type JsonValue} from "../domain/projected-content";
import type {AcceptedOperation,OperationEnvelope} from "../../../../contracts/content-transition";

export interface TransitionCommand {codec:{id:string;version:number};payload:Readonly<Record<string,unknown>>}
/** Closed registration: new producer contracts require an owning validator and
 * explicit projection. No dynamic callback registry or opaque payload bypass. */
export async function parseTransitionCommand(raw:unknown,context:ProjectionContext,side:"source"|"target"):Promise<TransitionCommand> {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Unregistered transition command");
  const command=raw as TransitionCommand;
  if(command.codec?.version!==1 || !command.payload || typeof command.payload!=="object" || Array.isArray(command.payload)) throw new Error("Unregistered transition command");
  if(side==="target" && Object.keys(command.codec).sort().join(",")!=="id,version") throw new Error("Target codec must match the positive allowlist");
  let payload:Record<string,unknown>;
  switch(command.codec.id) {
    case "x-posts.redact": {
      const parsed=parseXRedaction(command.payload);
      if(!parsed) throw new Error("Invalid X redaction command");
      payload=parsed;
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
    case "schedules.save": {
      const input=parseScheduleInput(command.payload,{requireId:true});
      if(!input) throw new Error("Invalid schedule command");
      const row=await projectCapturedRecord("schedules",JSON.stringify([input.id]),{id:input.id,member_uid:input.memberUid,date:input.date,start_time:input.startTime,title:input.title,status:input.status},context);
      if(!row) throw new Error("Unapproved schedule command member");
      payload={...row.value};
      delete payload.content_access;
      break;
    }
    case "otw-play.song.update": {
      const parsed=parseUpdateSong(command.payload);
      if(!parsed.ok) throw new Error("Invalid song command");
      const projected=projectBusinessJson({song:{originalArtists:parsed.value.originalArtists}},"review_input",context) as {song:{originalArtists:JsonValue}};
      payload={...parsed.value,originalArtists:projected.song.originalArtists};
      break;
    }
    case "source.checkpoint_due": {
      const {sourceKey,checkpointGeneration,scheduledDue}=command.payload;
      if(typeof sourceKey!=="string" || !sourceKey || !Number.isSafeInteger(checkpointGeneration) || Number(checkpointGeneration)<0 || !Number.isSafeInteger(scheduledDue) || Number(scheduledDue)<0) throw new Error("Invalid checkpoint due command");
      payload={sourceKey,checkpointGeneration,scheduledDue};
      break;
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
export function assertOperationMetadata(operation:AcceptedOperation):void {
  if(!text(operation.transitionId) || !text(operation.operationId) || !text(operation.idempotencyKey) || !time(operation.admittedAt) || !time(operation.validation?.validatedAt) || operation.validation?.contract!==1 || !keys(operation.validation,"contract,validatedAt") || !keys(operation.subject,"key,table") || !(operation.expectedVersion===null || time(operation.expectedVersion))) throw new Error("Invalid operation metadata allowlist");
  let key:unknown;
  try { key=JSON.parse(operation.subject.key); } catch { throw new Error("Invalid command subject"); }
  if(!Array.isArray(key) || key.length!==1) throw new Error("Invalid command subject");
  if(operation.codec.id==="x-posts.redact" && (operation.kind!=="redaction" || operation.subject.table!=="x_posts" || key[0]!==operation.payload.postId || operation.expectedVersion!==null)) throw new Error("Redaction command subject/version mismatch");
  if(operation.codec.id==="assets.replace" && (operation.kind!=="content_edit" || operation.subject.table!=="asset_file_references" || key[0]!==operation.payload.logicalKey || operation.expectedVersion!==null)) throw new Error("File command subject/version mismatch");
  if(operation.codec.id==="schedules.save" && (operation.kind!=="content_edit" || operation.subject.table!=="schedules" || key[0]!==operation.payload.id || operation.expectedVersion!==null)) throw new Error("Schedule command subject/version mismatch");
  if(operation.codec.id==="schedules.save" && operation.expectedState!==null) {
    assertScheduleExpectedState(operation.expectedState,operation.payload.id);
  } else if(operation.expectedState!==null) throw new Error("Unexpected command expected state");
  if(operation.codec.id==="otw-play.song.update" && (operation.kind!=="content_edit" || operation.subject.table!=="music_songs" || !text(key[0]) || key[0]!==operation.payload.id || operation.expectedVersion!==operation.payload.expectedVersion)) throw new Error("Song command subject/version mismatch");
  if(operation.codec.id==="source.checkpoint_due" && (operation.kind!=="collection_due" || operation.subject.table!=="source_checkpoints" || key[0]!==operation.payload.sourceKey || operation.expectedVersion!==null)) throw new Error("Checkpoint command subject/version mismatch");
}
export function assertOperationEvidence(envelope:Pick<OperationEnvelope,"attempt"|"outcome">):void {
  if(envelope.attempt!==null && (!keys(envelope.attempt,"identity,status") || !text(envelope.attempt.identity) || !["attempted","unknown","completed","failed"].includes(envelope.attempt.status))) throw new Error("Invalid attempt allowlist");
  if(envelope.outcome!==null && (!keys(envelope.outcome,"detail,outcome,sideEffectReconciled") || typeof envelope.outcome.detail!=="string" || typeof envelope.outcome.sideEffectReconciled!=="boolean" || !["committed","conflicted","failed"].includes(envelope.outcome.outcome))) throw new Error("Invalid outcome allowlist");
}
