import type {OtwPlayAdminCreateChannelRequest,OtwPlayAdminUpdateChannelRequest} from "@contracts/otw-play";
import {parseCreateChannel,parseUpdateChannel} from "./admin-catalog-input";

export type ChannelMutation={action:"create";id:string;input:OtwPlayAdminCreateChannelRequest;eventId:string;now:number}
  |{action:"update";id:string;input:OtwPlayAdminUpdateChannelRequest;eventId:string;now:number};
export type ChannelMutationCommand=ChannelMutation & {actor:{userId:string;displayName:string|null;ipAddress:string|null}|null};
export function parseChannelMutation(value:unknown):ChannelMutation|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const raw=value as Record<string,unknown>;
  if(typeof raw.id!=="string" || !raw.id || raw.id.length>128 || typeof raw.eventId!=="string" || !raw.eventId || raw.eventId.length>128 || !Number.isSafeInteger(raw.now) || Number(raw.now)<0) return null;
  const common={id:raw.id,eventId:raw.eventId,now:Number(raw.now)};
  if(raw.action==="create") {const parsed=parseCreateChannel(raw.input);return parsed.ok?{action:"create",...common,input:parsed.value}:null;}
  if(raw.action==="update") {const parsed=parseUpdateChannel(raw.input);return parsed.ok && parsed.value.id===raw.id?{action:"update",...common,input:parsed.value}:null;}
  return null;
}
