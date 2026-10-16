import type {TransitionPlan} from '@contracts/content-transition';
import {videoCatalogReferences,videoCatalogReads,type VideoCatalogMutation} from '../../otw-play/commands';
import {historicalRecordId,type ProjectionContext} from '../domain/projected-content';
import {readProjectionContext} from './d1-projection-context';

/** Typed prerequisites only. This private control seed is validated again at
 * the same source admission/capture boundary; it is never a business image. */
export async function videoDependencies(db:D1Database,plan:TransitionPlan,command:VideoCatalogMutation) {
  const refs=videoCatalogReferences(command),videos=videoCatalogReads(command).map(item=>item.videoId);
  const sql=`WITH refs AS (SELECT ? value),
    entity AS (SELECT e.id,e.member_uid,e.display_name FROM music_entities e,refs WHERE e.id IN (SELECT value FROM json_each(refs.value,'$.entities'))
      OR e.member_uid IN (SELECT value FROM json_each(refs.value,'$.members'))
      OR EXISTS(SELECT 1 FROM json_each(refs.value,'$.external') x WHERE e.entity_kind=json_extract(x.value,'$.entityKind') AND e.normalized_name=json_extract(x.value,'$.normalizedName') AND e.member_uid IS NULL)),
    person AS (SELECT m.uid,m.name FROM members m,refs WHERE m.uid IN (SELECT value FROM json_each(refs.value,'$.members')) OR m.uid IN (SELECT member_uid FROM entity)),
    dependency_sets(tab,ids) AS (VALUES
      ('music_entities',(SELECT json_group_array(id) FROM entity)),
      ('members',(SELECT json_group_array(uid) FROM person)),
      ('music_songs',(SELECT json_group_array(s.id) FROM music_songs s,refs WHERE s.id IN (SELECT value FROM json_each(refs.value,'$.songs')))),
      ('music_channels',(SELECT json_group_array(c.id) FROM music_channels c,refs WHERE c.id IN (SELECT value FROM json_each(refs.value,'$.channels')))),
      ('music_performances',(SELECT json_group_array(p.id) FROM music_performances p,refs WHERE p.id IN (SELECT value FROM json_each(refs.value,'$.performances')))),
      ('music_cover_proposals',(SELECT json_group_array(p.id) FROM music_cover_proposals p,refs WHERE p.id IN (SELECT value FROM json_each(refs.value,'$.proposals')))),
      ('music_media_sources',(SELECT json_group_array(s.id) FROM music_media_sources s WHERE s.provider='youtube' AND s.external_id IN (SELECT value FROM json_each(?))))),
    dependency AS (SELECT tab,j.value id FROM dependency_sets,json_each(ids) j)
    SELECT json_object('references',json((SELECT coalesce(json_group_array(json_object('table',tab,'key',json_array(id))),'[]') FROM (SELECT * FROM dependency ORDER BY tab,id))),
      'members',json((SELECT coalesce(json_group_array(json_object('uid',uid,'name',name)),'[]') FROM (SELECT * FROM person ORDER BY uid))),
      'entities',json((SELECT coalesce(json_group_array(json_object('id',id,'memberUid',member_uid,'name',display_name)),'[]') FROM (SELECT * FROM entity ORDER BY id)))) value`;
  const bindings=[JSON.stringify(refs),JSON.stringify(videos)],value=(await db.prepare(sql).bind(...bindings).first<string>('value'))!;
  const parsed=JSON.parse(value) as {references:{table:string;key:string}[];members:{uid:number;name:string}[];entities:{id:string;memberUid:number|null;name:string}[]};
  const boundary=await db.prepare('SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1').bind(plan.id).first<number>('n');
  const sealed:ProjectionContext=boundary?await readProjectionContext(db,plan,boundary):{sourceSite:plan.sourceSite,members:[]};
  const members=[...sealed.members],entities=[...(sealed.entities??[])];
  for(const member of parsed.members) {
    const prior=members.find(item=>item.uid===member.uid),selected=plan.members.find(item=>item.uid===member.uid),existing=parsed.entities.filter(item=>item.memberUid===member.uid);
    if(existing.length>1) throw new Error('Ambiguous original member dependency');
    const externalEntityId=prior?.externalEntityId??(selected?null:existing[0]?.id??`external-${await historicalRecordId(plan.sourceSite,'members',JSON.stringify([member.uid]))}`);
    if(!prior) members.push({...member,targetUid:selected?.targetUid??null,externalEntityId,canonicalPresent:existing.length>0,present:true,entityIds:existing.map(item=>item.id)});
    if(externalEntityId) for(const entity of existing) if(!entities.some(item=>item.sourceId===entity.id)) entities.push({sourceId:entity.id,targetId:externalEntityId});
  }
  for(const member of plan.members) if(!members.some(item=>item.uid===member.uid)) members.push({uid:member.uid,targetUid:member.targetUid,name:member.code,externalEntityId:null});
  return {references:parsed.references,context:{...sealed,members,entities},guard:db.prepare(`SELECT iif((SELECT value FROM (${sql}))=?,1,json('video_admission_dependency_race'))`).bind(...bindings,value)};
}
