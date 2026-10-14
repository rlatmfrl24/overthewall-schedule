import type {TransitionPlan} from "../../../../contracts/content-transition";
import {historicalRecordId,type ProjectionContext} from "../domain/projected-content";
type Fact={row_table:string;row_key:string;commit_seq:number;seq:number;value:string|null};
/** Reads only sealed member/entity identity facts through the requested boundary.
 * No current business table or caller-supplied name/entity mapping is authority. */
export async function readProjectionContext(db:D1Database,plan:TransitionPlan,boundary:number):Promise<ProjectionContext> {
  const currentMembers=new Map<number,{uid:number;name:string}>(),lastMembers=new Map<number,{uid:number;name:string}>(),firstMembers=new Map<number,number>();
  const entityHistory=new Map<string,number>(),currentEntities=new Map<string,number|null>(),bindings=new Map<number,string>();
  const pending=new Set<number>();
  const sealBindings=async()=>{
    for(const uid of pending) {
      const linked=[...currentEntities].filter(([,memberUid])=>memberUid===uid);
      if(linked.length>1) throw new Error(`Manifest external identity is ambiguous: members/[${uid}]`);
      bindings.set(uid,linked[0]?.[0]??`external-${await historicalRecordId(plan.sourceSite,"members",JSON.stringify([uid]))}`);
    }
    pending.clear();
  };
  let cursor=0,commit=0;
  // Keep only compact per-identity state; never accumulate complete journal
  // history or full business images in Worker memory.
  for(;;) {
    const facts=(await db.prepare(`SELECT j.row_table,j.row_key,j.commit_seq,j.seq,CASE WHEN after_json IS NULL THEN NULL WHEN row_table='members' THEN json_object('uid',json_extract(after_json,'$.uid'),'name',json_extract(after_json,'$.name')) ELSE json_object('id',json_extract(after_json,'$.id'),'member_uid',json_extract(after_json,'$.member_uid')) END value FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq AND c.sealed=1 WHERE j.transition_id=? AND j.commit_seq<=? AND j.seq>? AND j.row_table IN ('members','music_entities') ORDER BY j.seq LIMIT 15`).bind(plan.id,boundary,cursor).all<Fact>()).results;
    if(!facts.length) break;
    for(const fact of facts) {
      if(commit!==fact.commit_seq) {await sealBindings();commit=fact.commit_seq;}
      cursor=fact.seq;
      const value=fact.value===null?null:JSON.parse(fact.value);
      if(fact.row_table==='members') {
        const uid=JSON.parse(fact.row_key)[0] as number;
        if(value) {
          currentMembers.set(uid,value);lastMembers.set(uid,value);
          if(!firstMembers.has(uid)) {firstMembers.set(uid,fact.commit_seq);if(!plan.members.some(member=>member.uid===uid)) pending.add(uid);}
        } else currentMembers.delete(uid);
      } else {
        const id=JSON.parse(fact.row_key)[0] as string;
        if(value) {
          currentEntities.set(id,value.member_uid);
          if(value.member_uid!==null) {
            const prior=entityHistory.get(id);
            if(prior!==undefined && prior!==value.member_uid) throw new Error(`Manifest entity identity reassignment conflict: ${fact.commit_seq}/music_entities/${fact.row_key}`);
            entityHistory.set(id,value.member_uid);
          }
        } else currentEntities.delete(id);
      }
    }
  }
  await sealBindings();
  return {sourceSite:plan.sourceSite,classifications:plan.classifications,
    members:[...lastMembers.values()].map(member=>({uid:member.uid,name:member.name,present:currentMembers.has(member.uid),targetUid:plan.members.find(approved=>approved.uid===member.uid)?.targetUid??null,externalEntityId:bindings.get(member.uid)??null,firstCommit:firstMembers.get(member.uid)!,canonicalPresent:[...currentEntities.values()].includes(member.uid),entityIds:[...entityHistory].filter(([,uid])=>uid===member.uid).map(([id])=>id)})),
    entities:[...entityHistory].flatMap(([id,uid])=>bindings.has(uid)?[{sourceId:id,targetId:bindings.get(uid)!}]:[]),
  };
}
