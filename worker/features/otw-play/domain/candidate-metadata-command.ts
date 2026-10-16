/** The original one-video refresh. Actor identity is private to the accepting
 * site; the exact candidate version remains the owning write predicate. */
export interface CandidateMetadataMutation {
  action:'candidate_refresh';candidateId:string;expectedVersion:number;
  videoId:string;eventId:string;now:number;
}
export type CandidateMetadataCommand=CandidateMetadataMutation & {actor:{userId:string;displayName:string|null;ipAddress:string|null}|null};
export function parseCandidateMetadataMutation(raw:unknown):CandidateMetadataMutation|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const v=raw as Record<string,unknown>,text=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
  if(v.action!=='candidate_refresh'||!text(v.candidateId)||!text(v.eventId)||typeof v.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(v.videoId)||!Number.isSafeInteger(v.expectedVersion)||Number(v.expectedVersion)<0||!Number.isSafeInteger(v.now)||Number(v.now)<0) return null;
  return {action:'candidate_refresh',candidateId:v.candidateId,expectedVersion:Number(v.expectedVersion),videoId:v.videoId,eventId:v.eventId,now:Number(v.now)};
}
