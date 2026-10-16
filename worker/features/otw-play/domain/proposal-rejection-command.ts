import type {OtwPlayAdminRejectProposalRequest} from "@contracts/otw-play";
import {parseRejectProposal} from "./admin-catalog-input";

export interface ProposalRejection {id:string;input:OtwPlayAdminRejectProposalRequest}
export type ProposalRejectionCommand=ProposalRejection & {actor:{userId:string;displayName:string|null;ipAddress:string|null};eventId:string;now:number};
export function parseProposalRejection(value:unknown):ProposalRejection|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const raw=value as Record<string,unknown>,parsed=parseRejectProposal(raw.input);
  return typeof raw.id==="string" && raw.id.length>0 && raw.id.length<=128 && parsed.ok?{id:raw.id,input:parsed.value}:null;
}
