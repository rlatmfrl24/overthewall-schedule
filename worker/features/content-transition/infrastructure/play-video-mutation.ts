import {videoCatalogReferences,type VideoCatalogMutation} from '../../otw-play/commands';
import {playPublicationResultSql} from './play-publication-mutation';
import {playSongResultSql} from './play-song-mutation';
import {playChannelResultSql} from './play-channel-mutation';
import {playEntityResultSql} from './play-entity-mutation';
import {proposalRejectionResultSql} from './play-proposal-rejection';

export function playVideoSubject(command:VideoCatalogMutation) {
  if(command.action==='candidate_convert') return {table:'music_ingestion_candidates',id:command.input.candidateId,version:command.input.expectedVersion};
  return command.action==='proposal_approve'?{table:'music_cover_proposals',id:command.proposalId,version:command.input.expectedVersion}:
    {table:'music_performances',id:command.action==='performance_update'?command.input.id:command.ids.performanceId,version:command.action==='performance_update'?command.input.expectedVersion:null};
}
export function playVideoPredicate(command:VideoCatalogMutation,revision?:number) {
  const subject=playVideoSubject(command);
  const version=subject.version===null?'NOT EXISTS(SELECT 1 FROM music_performances WHERE id=?)':`EXISTS(SELECT 1 FROM ${subject.table} WHERE id=? AND version=? AND content_access='normal'${command.action==='proposal_approve'?" AND status='pending_review'":''})`;
  const bindings:Array<string|number>=[subject.id,...(subject.version===null?[]:[subject.version])];
  if(command.action==='catalog_create'||command.action==='proposal_approve') {
    bindings.push(revision??command.input.expectedCatalogRevision);
    return {sql:`(${version}) AND (SELECT revision FROM music_catalog_meta WHERE id=1)=?`,bindings};
  }
  return {sql:version,bindings};
}
export function playVideoSourceScope(command:VideoCatalogMutation) {
  const refs=videoCatalogReferences(command),subject=playVideoSubject(command);
  return {sql:`(EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table=? AND m.row_key=json_array(?) AND m.root_table=m.row_table AND m.root_key=m.row_key)
    OR EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') approved WHERE json_extract(approved.value,'$.uid') IN (SELECT value FROM json_each(?))
      OR EXISTS(SELECT 1 FROM music_entities e WHERE e.member_uid=json_extract(approved.value,'$.uid') AND e.id IN (SELECT value FROM json_each(?)))))`,bindings:[subject.table,subject.id,JSON.stringify(refs.members),JSON.stringify(refs.entities)]};
}
export type VideoResultCapture={kind:'performance';id:string}|{kind:'entry';songId:string;performanceId:string;channelId:string;entityIds:readonly string[];proposalId?:string};
/** Original DTOs are captured in the original catalog transaction. Source
 * account-bearing proposal results remain private; the wire carries hashes. */
export function playVideoResult(capture:VideoResultCapture) {
  if(capture.kind==='performance') return {sql:playPublicationResultSql,bindings:[capture.id]};
  const sql=`json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json_object(
    'song',json_extract(${playSongResultSql},'$.data'),'performance',json_extract(${playPublicationResultSql},'$.data'),
    'channel',json_extract(${playChannelResultSql},'$.data'),'createdEntities',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM
      (SELECT json_extract(${playEntityResultSql.replace('WHERE id=?','WHERE id=requested.value')},'$.data') value FROM json_each(?) requested)))))`;
  return {sql,bindings:[capture.songId,capture.performanceId,capture.channelId,JSON.stringify(capture.entityIds)]};
}
export const playVideoProposalResultSql=proposalRejectionResultSql;
