import type {ProtectedAssetReferenceContext} from "@contracts/assets";

/** Parses only the request's row/draft coordinates. D1 owns their permissions. */
export function parseProtectedReferenceContext(value:unknown):ProtectedAssetReferenceContext {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Invalid image context");
  const input=value as Record<string,unknown>;
  const id=(value:unknown)=>Number.isSafeInteger(value) && Number(value)>0;
  if(input.kind==="notice" && id(input.id) && Object.keys(input).sort().join(",")==="id,kind") return {kind:"notice",id:Number(input.id)};
  if(input.kind==="notice-draft" && (input.id===undefined || id(input.id)) && Array.isArray(input.relatedMemberUids) && input.relatedMemberUids.every(id) && new Set(input.relatedMemberUids).size===input.relatedMemberUids.length && Object.keys(input).every(key=>["kind","id","relatedMemberUids"].includes(key))) return {kind:"notice-draft",...(input.id===undefined?{}:{id:Number(input.id)}),relatedMemberUids:input.relatedMemberUids as number[]};
  throw new Error("Invalid image context");
}
