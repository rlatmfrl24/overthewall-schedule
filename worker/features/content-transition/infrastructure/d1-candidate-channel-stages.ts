import {OTW_PLAY_CHANNEL_ROLES} from '@contracts/otw-play';
import type {CandidateChannelApprovalStages,CandidateChannelApprovalSnapshot,CandidateChannelApprovalChild,CandidateChannelApprovalRefresh} from '@contracts/content-transition-youtube';
import type {SiteId} from '@contracts/site-definition';
import {parseCandidateChannelMutation,parseChannelMutation,parseCandidateMetadataMutation,type CandidateChannelMutation} from '../../otw-play/commands';
import {assertPlayChannelState} from './play-channel-mutation';
import {D1YouTubeVideoReadJournal} from './d1-youtube-video-read-journal';
import {candidateChannelRequestKey} from './youtube-video-read';

type Authority={source_site:SiteId;target_site:SiteId;phase:string;generation:number;fence_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null};
const object=(raw:unknown):raw is Record<string,unknown>=>!!raw&&typeof raw==='object'&&!Array.isArray(raw);
const exact=(raw:Record<string,unknown>,keys:string[])=>Object.keys(raw).sort().join(',')===keys.sort().join(',');
const digest=(raw:unknown):raw is string=>typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw);
const text=(raw:unknown):raw is string=>typeof raw==='string'&&raw.length>0&&raw.length<=128;
const integer=(raw:unknown)=>Number.isSafeInteger(raw)&&Number(raw)>=0;
export const emptyCandidateChannelStages=():CandidateChannelApprovalStages=>({snapshot:null,create:null,update:null,refresh:null});

const channelResult=(raw:unknown):raw is NonNullable<CandidateChannelApprovalChild['result']>=>{
  if(!object(raw)||!exact(raw,['data','catalogRevision'])||!integer(raw.catalogRevision)||!object(raw.data)) return false;
  const d=raw.data;
  return exact(d,['id','provider','externalChannelId','displayName','channelRole','verificationStatus','active','entityIds','version'])&&text(d.id)&&d.provider==='youtube'&&typeof d.externalChannelId==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(d.externalChannelId)&&typeof d.displayName==='string'&&OTW_PLAY_CHANNEL_ROLES.some(role=>role===d.channelRole)&&['pending','approved','revoked'].includes(String(d.verificationStatus))&&typeof d.active==='boolean'&&Array.isArray(d.entityIds)&&d.entityIds.length<=30&&d.entityIds.every(text)&&new Set(d.entityIds).size===d.entityIds.length&&integer(d.version);
};
const needsUpdate=(command:CandidateChannelMutation,result:NonNullable<CandidateChannelApprovalSnapshot['existing']>)=>result.verificationStatus!=='approved'||!result.active||result.channelRole!==command.channel.channelRole||result.entityIds.length!==command.channel.entityIds.length||result.entityIds.some(id=>!new Set<string>(command.channel.entityIds).has(id));

/** Positive stage projection: this contains neither the private parent actor nor
 * the final private candidate DTO. It is specific to approve_channel. */
export function parseCandidateChannelStages(raw:unknown,command:CandidateChannelMutation):CandidateChannelApprovalStages {
  if(!object(raw)||!exact(raw,['snapshot','create','update','refresh'])) throw new Error('Invalid original channel approval stages');
  const stages=raw as unknown as CandidateChannelApprovalStages;
  if(stages.snapshot!==null) {
    const s=stages.snapshot;
    if(!object(s)||!exact(s,['externalChannelId','channelTitle','requestHash','responseHash','entities','existing','expectedState','capture'])||!/^UC[A-Za-z0-9_-]{22}$/.test(s.externalChannelId)||typeof s.channelTitle!=='string'||!digest(s.requestHash)||!digest(s.responseHash)||!Array.isArray(s.entities)||s.entities.length>30||s.entities.some(e=>!object(e)||!exact(e,['id','archivedAt','isMember'])||!text(e.id)||!new Set<string>(command.channel.entityIds).has(e.id)||!(e.archivedAt===null||integer(e.archivedAt))||typeof e.isMember!=='boolean')||new Set(s.entities.map(e=>e.id)).size!==s.entities.length||s.existing!==null&&!channelResult({data:s.existing,catalogRevision:0})||s.existing!==null&&s.existing.externalChannelId!==s.externalChannelId||typeof s.expectedState!=='string'||s.capture!==null&&!text(s.capture)) throw new Error('Invalid original channel ownership snapshot');
    assertPlayChannelState(JSON.parse(s.expectedState));
  }
  for(const step of ['create','update'] as const) {
    const value=stages[step];if(value===null) continue;
    if(!object(value)||!exact(value,['command','expectedState','result','resultState'])||!stages.snapshot) throw new Error('Child without original channel snapshot');
    const child=parseChannelMutation(value.command);
    if(!child||child.action!==step||JSON.stringify(child)!==JSON.stringify(value.command)||typeof value.expectedState!=='string'||value.result!==null&&!channelResult(value.result)||value.resultState!==null&&typeof value.resultState!=='string'||Boolean(value.result)!==Boolean(value.resultState)) throw new Error('Invalid original channel child');
    assertPlayChannelState(JSON.parse(value.expectedState));
    if(value.resultState!==null) assertPlayChannelState(JSON.parse(value.resultState));
    const expectedInput=step==='create'
      ?{externalChannelId:stages.snapshot.externalChannelId,displayName:stages.snapshot.channelTitle,channelRole:command.channel.channelRole,entityIds:command.channel.entityIds}
      :null;
    if(step==='create'&&(stages.snapshot.existing!==null||JSON.stringify(child.input)!==JSON.stringify(parseChannelMutation({...child,input:expectedInput})?.input))) throw new Error('Unexpected original create child');
    if(value.result&&(value.result.data.id!==child.id||value.result.data.externalChannelId!==child.input.externalChannelId||value.result.data.version!==(child.action==='create'?0:child.input.expectedVersion+1))) throw new Error('Channel child result identity mismatch');
  }
  if(stages.update) {
    const prior=stages.snapshot?.existing??stages.create?.result?.data;
    const child=stages.update.command;
    if(!prior||!needsUpdate(command,prior)||child.action!=='update'||child.id!==prior.id||child.input.expectedVersion!==prior.version||JSON.stringify(child.input)!==JSON.stringify(parseChannelMutation({...child,input:{id:prior.id,externalChannelId:stages.snapshot!.externalChannelId,displayName:stages.snapshot!.channelTitle,channelRole:command.channel.channelRole,entityIds:command.channel.entityIds,verificationStatus:'approved',active:true,expectedVersion:prior.version}})?.input)||stages.update.expectedState!==(stages.create?.resultState??stages.snapshot!.expectedState)) throw new Error('Unexpected original update child');
  }
  if(stages.refresh!==null) {
    const value=stages.refresh,child=parseCandidateMetadataMutation(value.command);
    if(!object(value)||!exact(value,['command','resultHash','facts'])||!child||JSON.stringify(child)!==JSON.stringify(value.command)||child.candidateId!==command.candidateId||child.expectedVersion!==command.expectedVersion||child.videoId!==command.videoId||value.resultHash!==null&&!digest(value.resultHash)) throw new Error('Invalid original refresh child');
    assertCandidateChannelChildrenComplete(stages,command);
    if(value.facts!==null) {
      const f=value.facts;
      if(!object(f)||!exact(f,['transitionId','operationId','payloadHash','generation','requestKey','requestHash','responseHash','externalChannelId','matchedChannelId','facts','capture','site'])||!text(f.transitionId)||!text(f.operationId)||!digest(f.payloadHash)||!integer(f.generation)||f.requestKey!==`youtube:videos:3:${command.videoId}`||!digest(f.requestHash)||!digest(f.responseHash)||!(f.externalChannelId===null||typeof f.externalChannelId==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(f.externalChannelId))||!(f.matchedChannelId===null||text(f.matchedChannelId))||!(f.capture===null||typeof f.capture==='string'&&f.capture.length<=256)||!['otw','luvdia'].includes(f.site)||!object(f.facts)||!exact(f.facts,['existingSource','existingProposal','channel'])||typeof f.facts.existingSource!=='boolean'||typeof f.facts.existingProposal!=='boolean') throw new Error('Invalid original refresh child facts');
      const c=f.facts.channel;
      if(c!==null&&(!object(c)||!exact(c,['verification_status','active','channel_role'])||!['pending','approved','revoked'].includes(c.verification_status)||![0,1].includes(c.active)||!OTW_PLAY_CHANNEL_ROLES.some(role=>role===c.channel_role))) throw new Error('Invalid original refresh channel classification');
    }
  }
  return stages;
}

export function assertCandidateChannelChildrenComplete(stages:CandidateChannelApprovalStages,command:CandidateChannelMutation) {
  const prior=stages.snapshot?.existing??stages.create?.result?.data;
  if(!prior||(!stages.snapshot!.existing&&!stages.create?.result)||needsUpdate(command,prior)&&!stages.update?.result) throw new Error('Original channel children are incomplete');
}

/** One exact source/native parent control. Frozen-target callers use the same
 * source CAS; no child gets an independent operation or admission identity. */
export class D1CandidateChannelStages {
  private readonly db:D1Database;private readonly site:SiteId;private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string) {this.db=db;this.site=site;this.resource=resource;}
  async authority(id:string,operationId:string,payloadHash:string,frozen=false) {
    const row=await this.db.prepare(`SELECT t.source_site,t.target_site,t.phase,t.generation,t.fence_json,o.seq,o.source_seq,o.generation operation_generation,o.envelope_json,o.outcome_json
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.channel_approve'`)
      .bind(id,operationId,payloadHash,this.site,this.resource).first<Authority>();
    if(!row||row.source_seq!==null||row.operation_generation!==(this.site===row.source_site?row.generation-1:row.generation)) throw new Error('Wrong original channel parent control');
    if(frozen&&(this.site!==row.source_site||row.phase!=='source_fenced'||!row.fence_json||row.seq>JSON.parse(row.fence_json).operationBoundary)) throw new Error('Not the frozen original channel parent');
    const value=JSON.parse(row.envelope_json),key=this.site===row.source_site?'sourceReceipt':'nativeReceipt';
    const command=parseCandidateChannelMutation(this.site===row.source_site?value.sourceCommand?.payload:value.payload);
    if(!command||!value[key]||!value[key].actorId||value[key].command?.actor?.userId!==value[key].actorId) throw new Error('Missing original private channel parent');
    const stages=parseCandidateChannelStages(value[key].channelApproval,command);
    if(stages.snapshot) {
      const first=await this.db.prepare('SELECT request_hash,response_hash,response_json FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=?').bind(id,operationId,`youtube:videos:0:${command.videoId}`).first<{request_hash:string;response_hash:string|null;response_json:string|null}>();
      const response=first?.response_json?JSON.parse(first.response_json):null;
      if(!first||first.request_hash!==stages.snapshot.requestHash||first.response_hash!==stages.snapshot.responseHash||response?.status!=='success'||response.video?.channelId!==stages.snapshot.externalChannelId||response.video?.channelTitle!==stages.snapshot.channelTitle) throw new Error('Original channel snapshot response mismatch');
      if(this.site===row.source_site&&(!stages.snapshot.capture||!await this.db.prepare('SELECT 1 FROM content_transition_commits WHERE transition_id=? AND operation_id=? AND sealed=1').bind(id,stages.snapshot.capture).first())) throw new Error('Missing original channel dependency capture');
    }
    return {row,key,command,stages};
  }
  async read(id:string,operationId:string,payloadHash:string,frozen=false) {return (await this.authority(id,operationId,payloadHash,frozen)).stages;}
  private phase(frozen:boolean) {
    return frozen?"t.local_site=t.source_site AND t.phase='source_fenced' AND o.seq<=json_extract(t.fence_json,'$.operationBoundary')":"((t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')) OR (t.local_site=t.target_site AND t.phase IN ('target_owned','complete') AND o.source_seq IS NULL))";
  }
  private guard(id:string,operationId:string,payloadHash:string,prior:CandidateChannelApprovalStages,key:string,frozen:boolean) {
    return this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=? AND t.local_resource=? AND o.generation=CASE WHEN t.local_site=t.source_site THEN t.generation-1 ELSE t.generation END AND ${this.phase(frozen)} AND json_extract(o.envelope_json,'$.${key}.channelApproval')=json(?)),1,json('candidate_channel_stage_race'))`).bind(id,operationId,payloadHash,this.site,this.resource,JSON.stringify(prior));
  }
  async prepareChild(id:string,operationId:string,payloadHash:string,step:'create'|'update',raw:unknown,frozen=false):Promise<CandidateChannelApprovalChild> {
    if(step!=='create'&&step!=='update') throw new Error('Unknown channel continuation step');
    const {key,command,stages}=await this.authority(id,operationId,payloadHash,frozen),child=parseChannelMutation(raw);
    if(!child||JSON.stringify(child)!==JSON.stringify(raw)||child.action!==step||!stages.snapshot) throw new Error('Invalid parent-derived channel continuation');
    const prior=stages[step];
    if(prior) {
      // Generated identities/time belong to the first preparation. Subsequent
      // deliveries may propose new generated values but not different inputs.
      if(JSON.stringify(prior.command.input)!==JSON.stringify(child.input)) throw new Error('Changed original channel continuation input');
      return prior;
    }
    const expectedState=step==='create'?JSON.stringify({channel:[],relations:[],entities:command.channel.entityIds.slice().sort().map(id=>({id})),sources:[]}):stages.create?.resultState??stages.snapshot.expectedState;
    const value:CandidateChannelApprovalChild={command:child,expectedState,result:null,resultState:null};
    parseCandidateChannelStages({...stages,[step]:value},command);
    await this.db.batch([
      this.guard(id,operationId,payloadHash,stages,key,frozen),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.${step}',json(?)) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(JSON.stringify(value),id,operationId),
    ]);
    return (await this.read(id,operationId,payloadHash,frozen))[step]!;
  }
  async prepareRefresh(id:string,operationId:string,payloadHash:string,raw:unknown,frozen=false):Promise<CandidateChannelApprovalRefresh> {
    const {key,command,stages}=await this.authority(id,operationId,payloadHash,frozen),child=parseCandidateMetadataMutation(raw);
    if(!child||JSON.stringify(child)!==JSON.stringify(raw)) throw new Error('Invalid parent-derived refresh continuation');
    if(stages.refresh) {
      if(child.candidateId!==stages.refresh.command.candidateId||child.expectedVersion!==stages.refresh.command.expectedVersion||child.videoId!==stages.refresh.command.videoId) throw new Error('Changed original refresh continuation input');
      return stages.refresh;
    }
    const value:CandidateChannelApprovalRefresh={command:child,resultHash:null,facts:null};
    parseCandidateChannelStages({...stages,refresh:value},command);
    await this.db.batch([
      this.guard(id,operationId,payloadHash,stages,key,frozen),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.refresh',json(?)) WHERE transition_id=? AND operation_id=? AND outcome_json IS NULL`).bind(JSON.stringify(value),id,operationId),
    ]);
    return (await this.read(id,operationId,payloadHash,frozen)).refresh!;
  }
  /** The relay obtains this result from the configured target's sealed owning
   * batch. A caller-provided DTO cannot acknowledge a child. */
  async acknowledgeChild(id:string,operationId:string,payloadHash:string,step:'create'|'update',actual:CandidateChannelApprovalChild) {
    if(step!=='create'&&step!=='update') throw new Error('Unknown channel continuation acknowledgement');
    const {key,command,stages}=await this.authority(id,operationId,payloadHash,true),prior=stages[step];
    if(!prior||JSON.stringify(prior.command)!==JSON.stringify(actual.command)||prior.expectedState!==actual.expectedState||!actual.result||!actual.resultState) throw new Error('Original child acknowledgement identity mismatch');
    parseCandidateChannelStages({...stages,[step]:actual},command);
    if(prior.result) {
      if(JSON.stringify(prior)!==JSON.stringify(actual)) throw new Error('Changed committed original child result');
      return prior;
    }
    const read=await new D1YouTubeVideoReadJournal(this.db,this.site,this.resource).read(id,operationId,payloadHash,candidateChannelRequestKey(actual.command.input.externalChannelId,step),true);
    if(read.response?.status!=='channel'||!read.response.channel||!read.responseHash) throw new Error('Missing original consumed child channel response');
    await this.db.batch([
      this.guard(id,operationId,payloadHash,stages,key,true),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND response_hash=?),1,json('candidate_channel_ack_read_race'))`).bind(id,operationId,read.requestKey,read.requestHash,read.responseHash),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.channelApproval.${step}',json(?)) WHERE transition_id=? AND operation_id=?`).bind(JSON.stringify(actual),id,operationId),
    ]);
    return (await this.read(id,operationId,payloadHash,true))[step]!;
  }
}
