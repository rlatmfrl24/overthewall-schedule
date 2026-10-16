export interface ReviewDeletion {kind:'candidate'|'proposal';id:string;expectedVersion:number}
export type ReviewDeletionCommand=ReviewDeletion & {actorUserId:string;eventId:string;now:number};
export function parseReviewDeletion(value:unknown):ReviewDeletion|null {
  if(!value||typeof value!=='object'||Array.isArray(value)) return null;
  const row=value as Record<string,unknown>;
  return (row.kind==='candidate'||row.kind==='proposal')&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=200&&Number.isSafeInteger(row.expectedVersion)&&Number(row.expectedVersion)>=0
    ?{kind:row.kind,id:row.id,expectedVersion:Number(row.expectedVersion)}:null;
}
