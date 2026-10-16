import {parseCreateSubmission,parseUpdateSubmission,parseWithdrawSubmission} from "./member-submission-input";
import type {OtwPlayCreateSubmissionRequest,OtwPlayUpdateSubmissionRequest} from "@contracts/otw-play";
export type MemberSubmissionMutation =
  | {action:"create";proposalId:string;input:OtwPlayCreateSubmissionRequest}
  | {action:"update";proposalId:string;input:OtwPlayUpdateSubmissionRequest}
  | {action:"withdraw";proposalId:string;expectedVersion:number};
export type MemberSubmissionCommand =
  | Extract<MemberSubmissionMutation,{action:"create"}> & {userId:string;now:number;videoId:string;canonicalUrl:string;dayStart:number;dayEnd:number}
  | Extract<MemberSubmissionMutation,{action:"update"}> & {userId:string;now:number;eventId:string;videoId:string;canonicalUrl:string}
  | Extract<MemberSubmissionMutation,{action:"withdraw"}> & {userId:string;now:number;eventId:string};
export function parseMemberSubmissionMutation(raw:unknown):MemberSubmissionMutation|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>;
  if(typeof value.proposalId!=="string" || !value.proposalId || value.proposalId.length>128) return null;
  if(value.action==="create") {const input=parseCreateSubmission(value.input);return input.ok?{action:"create",proposalId:value.proposalId,input:input.value}:null;}
  if(value.action==="update") {const input=parseUpdateSubmission(value.input);return input.ok?{action:"update",proposalId:value.proposalId,input:input.value}:null;}
  if(value.action==="withdraw") {const input=parseWithdrawSubmission({expectedVersion:value.expectedVersion});return input.ok?{action:"withdraw",proposalId:value.proposalId,expectedVersion:input.value.expectedVersion}:null;}
  return null;
}
export const memberSubmissionVersion=(command:MemberSubmissionMutation)=>command.action==="create"?null:command.action==="update"?command.input.expectedVersion:command.expectedVersion;
