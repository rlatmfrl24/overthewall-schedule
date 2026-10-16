import {OTW_PLAY_INGESTION_CANDIDATE_STATUSES,type OtwPlayIngestionCandidateStatus,type OtwPlayIngestionReviewInput} from '@contracts/otw-play';
import {parseCandidateReviewInput} from './candidate-review-input';

type Base={candidateId:string;expectedVersion:number};
export type CandidateReviewMutation=Base & (
  | {action:'ignore';jobId?:string}
  | {action:'change_kind';candidateKind:'official_video'|'singing_clip'}
  | {action:'save';input:OtwPlayIngestionReviewInput;expectedReviewInput?:OtwPlayIngestionReviewInput|null;expectedReviewStatus?:OtwPlayIngestionCandidateStatus}
);
export type CandidateReviewCommand=CandidateReviewMutation & {actorUserId:string;eventId:string;now:number;catalogMaterialization?:{entityIds:Record<string,string>;entityEventIds:Record<string,string>;songId:string|null;songEventId:string|null}|null};
export function parseCandidateReviewMutation(raw:unknown):CandidateReviewMutation|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>;
  if(typeof value.candidateId!=='string'||!value.candidateId||value.candidateId.length>200||!Number.isSafeInteger(value.expectedVersion)||Number(value.expectedVersion)<0) return null;
  const base={candidateId:value.candidateId,expectedVersion:Number(value.expectedVersion)};
  if(value.action==='ignore'&&(value.jobId===undefined||typeof value.jobId==='string'&&value.jobId.length>0&&value.jobId.length<=200)) return {...base,action:value.action,...(value.jobId===undefined?{}:{jobId:value.jobId})};
  if(value.action==='change_kind'&&(value.candidateKind==='official_video'||value.candidateKind==='singing_clip')) return {...base,action:value.action,candidateKind:value.candidateKind};
  if(value.action!=='save') return null;
  const input=parseCandidateReviewInput(value.input);
  const expected=value.expectedReviewInput==null?value.expectedReviewInput:parseCandidateReviewInput(value.expectedReviewInput);
  const status=value.expectedReviewStatus;
  if(!input.ok||expected!=null&&!expected.ok||status!==undefined&&!OTW_PLAY_INGESTION_CANDIDATE_STATUSES.includes(status as OtwPlayIngestionCandidateStatus)) return null;
  return {...base,action:'save',input:input.value,...(expected!==undefined?{expectedReviewInput:expected===null?null:expected.value}:{}),...(status!==undefined?{expectedReviewStatus:status as OtwPlayIngestionCandidateStatus}:{})};
}
