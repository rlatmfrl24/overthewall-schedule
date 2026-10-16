import type {OtwPlayAdminCreateEntityRequest,OtwPlayAdminUpdateEntityRequest} from "@contracts/otw-play";
import {parseCreateEntity,parseUpdateEntity} from "./admin-catalog-input";

export type EntityMutation = {action:"create";id:string;input:OtwPlayAdminCreateEntityRequest}|{action:"update";id:string;input:OtwPlayAdminUpdateEntityRequest};
export function parseEntityMutation(value:unknown):EntityMutation|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const command=value as Record<string,unknown>;
  if(typeof command.id!=="string" || !command.id || command.id.length>128) return null;
  if(command.action==="create") {const parsed=parseCreateEntity(command.input);return parsed.ok?{action:"create",id:command.id,input:parsed.value}:null;}
  if(command.action==="update") {const parsed=parseUpdateEntity(command.input);return parsed.ok && parsed.value.id===command.id?{action:"update",id:command.id,input:parsed.value}:null;}
  return null;
}
