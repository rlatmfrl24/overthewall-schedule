import type {OtwPlayUpdateIngestionCandidateRequest} from '@contracts/otw-play';

export type CandidateChannelInput=Extract<OtwPlayUpdateIngestionCandidateRequest,{action:'approve_channel'}>['channel'];
export type CandidateChannelMutation={action:'candidate_channel_approve';candidateId:string;expectedVersion:number;videoId:string;channel:CandidateChannelInput;now:number};
export type CandidateChannelCommand=CandidateChannelMutation & {actor:{userId:string;displayName:string|null;ipAddress:string|null}|null};

/** The same closed ownership input used by the original administrator API. */
export function parseCandidateChannelInput(raw:unknown):CandidateChannelInput|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>,external=value.ownershipKind==='external';
  const keys=external?['ownershipKind','channelRole','entityIds','externalApprovalConfirmed']:['ownershipKind','channelRole','entityIds'];
  if(Object.keys(value).some(key=>!keys.includes(key))||!Array.isArray(value.entityIds)||value.entityIds.length>30) return null;
  const entityIds:string[]=[];
  for(const rawId of value.entityIds) {
    if(typeof rawId!=='string') return null;
    const id=rawId.trim();if(!id||[...id].length>128||entityIds.includes(id)) return null;
    entityIds.push(id);
  }
  if(value.ownershipKind==='otw_official'&&value.channelRole==='otw_official'&&entityIds.length===0) return {ownershipKind:'otw_official',channelRole:'otw_official',entityIds:[]};
  if(value.ownershipKind==='member'&&(value.channelRole==='member_music'||value.channelRole==='member_main')&&entityIds.length>0) return {ownershipKind:'member',channelRole:value.channelRole,entityIds};
  if(external&&value.channelRole==='project_official'&&entityIds.length>0&&value.externalApprovalConfirmed===true) return {ownershipKind:'external',channelRole:'project_official',entityIds,externalApprovalConfirmed:true};
  return null;
}

export function parseCandidateChannelMutation(raw:unknown):CandidateChannelMutation|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>,channel=parseCandidateChannelInput(value.channel);
  if(value.action!=='candidate_channel_approve'||!channel||typeof value.candidateId!=='string'||!value.candidateId||value.candidateId.length>128||typeof value.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(value.videoId)||!Number.isSafeInteger(value.expectedVersion)||Number(value.expectedVersion)<0||!Number.isSafeInteger(value.now)||Number(value.now)<0) return null;
  return {action:'candidate_channel_approve',candidateId:value.candidateId,expectedVersion:Number(value.expectedVersion),videoId:value.videoId,channel,now:Number(value.now)};
}
