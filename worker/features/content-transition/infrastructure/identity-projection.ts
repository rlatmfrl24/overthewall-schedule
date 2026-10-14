import type {TransitionPlan} from "../../../../contracts/content-transition";
import {normalizeOtwPlaySearchText} from "../../../../contracts/otw-play-search";
import {readProjectionContext} from "./d1-projection-context";

const selected=(uid:string)=>`EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') approved WHERE json_extract(approved.value,'$.uid')=${uid})`;
const memberUid="json_extract(m.image_json,'$.uid')";
export const identityProjectionValidSql=(transition="t")=>`NOT EXISTS(SELECT 1 FROM content_transition_identity_missing p WHERE p.transition_id=${transition}.id) AND NOT EXISTS(SELECT 1 FROM content_transition_identity_conflicts c WHERE c.transition_id=${transition}.id)`;
export function identityProjectionStatements():string[] {
  const binding=`(SELECT p.target_entity_id FROM content_transition_identity_proofs p WHERE p.transition_id=e.transition_id AND p.member_uid=coalesce(json_extract(e.image_json,'$.member_uid'),(SELECT json_extract(j.after_json,'$.member_uid') FROM content_transition_journal j WHERE j.transition_id=e.transition_id AND j.row_table='music_entities' AND j.row_key=e.row_key AND j.commit_seq<=e.commit_seq AND json_extract(j.after_json,'$.member_uid') IS NOT NULL ORDER BY j.seq DESC LIMIT 1)) LIMIT 1)`;
  const projected=`SELECT e.transition_id,e.commit_seq,e.row_key,coalesce(${binding},json_extract(e.image_json,'$.id')) id,json_extract(e.image_json,'$.entity_kind') kind,json_extract(e.image_json,'$.normalized_name') normalized,json_extract(e.image_json,'$.slug') slug FROM content_transition_identity_images e JOIN content_transitions t ON t.id=e.transition_id WHERE e.row_table='music_entities' AND (json_extract(e.image_json,'$.member_uid') IS NULL OR NOT (${selected("json_extract(e.image_json,'$.member_uid')")}))
    UNION ALL SELECT m.transition_id,m.commit_seq,m.row_key,p.target_entity_id,'person',p.normalized_name,p.target_entity_id FROM content_transition_identity_images m JOIN content_transition_identity_proofs p ON p.transition_id=m.transition_id AND p.member_uid=${memberUid} AND p.source_name=json_extract(m.image_json,'$.name') WHERE m.row_table='members' AND NOT EXISTS(SELECT 1 FROM content_transition_identity_images e WHERE e.transition_id=m.transition_id AND e.commit_seq=m.commit_seq AND e.row_table='music_entities' AND json_extract(e.image_json,'$.member_uid')=${memberUid})`;
  return [
    // Only identity-changing boundaries. No target-tail or general source-tail
    // freshness receipt; SQL checks the immutable replay-relevant identity set.
    `CREATE VIEW content_transition_identity_images AS WITH boundaries AS MATERIALIZED(SELECT DISTINCT transition_id,commit_seq FROM content_transition_journal WHERE row_table IN ('members','music_entities','music_entity_aliases')), identities AS MATERIALIZED(SELECT DISTINCT transition_id,row_table,row_key FROM content_transition_journal WHERE row_table IN ('members','music_entities','music_entity_aliases')) SELECT b.transition_id,b.commit_seq,i.row_table,i.row_key,j.after_json image_json FROM boundaries b JOIN identities i ON i.transition_id=b.transition_id JOIN content_transition_journal j ON j.seq=(SELECT max(f.seq) FROM content_transition_journal f WHERE f.transition_id=b.transition_id AND f.row_table=i.row_table AND f.row_key=i.row_key AND f.commit_seq<=b.commit_seq) WHERE j.after_json IS NOT NULL`,
    `CREATE VIEW content_transition_identity_missing AS SELECT m.transition_id,m.commit_seq,m.row_key FROM content_transition_journal m JOIN content_transitions t ON t.id=m.transition_id WHERE m.row_table='members' AND m.after_json IS NOT NULL AND NOT (${selected("json_extract(m.after_json,'$.uid')")}) AND NOT EXISTS(SELECT 1 FROM content_transition_identity_proofs p WHERE p.transition_id=m.transition_id AND p.member_uid=json_extract(m.after_json,'$.uid') AND p.source_name=json_extract(m.after_json,'$.name') AND p.protocol=t.protocol AND p.generation=t.generation AND p.manifest_digest=t.manifest_digest AND p.manifest_revision=t.manifest_revision)`,
    `CREATE VIEW content_transition_projected_identities AS ${projected}`,
    `CREATE VIEW content_transition_identity_conflicts AS WITH projected AS MATERIALIZED(SELECT * FROM content_transition_projected_identities),images AS MATERIALIZED(SELECT * FROM content_transition_identity_images)
      SELECT transition_id,commit_seq,min(row_key) row_key,'normalized external name collision' reason FROM projected GROUP BY transition_id,commit_seq,kind,normalized HAVING count(*)>1
      UNION SELECT transition_id,commit_seq,min(row_key),'projected entity key collision' FROM projected GROUP BY transition_id,commit_seq,id HAVING count(*)>1
      UNION SELECT transition_id,commit_seq,min(row_key),'projected slug collision' FROM projected GROUP BY transition_id,commit_seq,slug HAVING count(*)>1
      UNION SELECT p.transition_id,p.commit_seq,a.row_key,'ambiguous historical alias' FROM projected p JOIN images a ON a.transition_id=p.transition_id AND a.commit_seq=p.commit_seq AND a.row_table='music_entity_aliases' AND json_extract(a.image_json,'$.normalized_alias')=p.normalized JOIN images e ON e.transition_id=a.transition_id AND e.commit_seq=a.commit_seq AND e.row_table='music_entities' AND json_extract(e.image_json,'$.id')=json_extract(a.image_json,'$.entity_id') WHERE coalesce(${binding},json_extract(e.image_json,'$.id'))<>p.id
      UNION SELECT j.transition_id,max(j.commit_seq),j.row_key,'canonical identity reassignment' FROM content_transition_journal j WHERE j.row_table='music_entities' AND json_extract(j.after_json,'$.member_uid') IS NOT NULL GROUP BY j.transition_id,j.row_key HAVING count(DISTINCT json_extract(j.after_json,'$.member_uid'))>1`,
    ...["INSERT","UPDATE"].map(action=>`CREATE TRIGGER content_identity_proof_${action.toLowerCase()} BEFORE ${action} ON content_transition_identity_proofs BEGIN SELECT RAISE(ABORT,'content_identity_internal_proof_required') WHERE NOT EXISTS(SELECT 1 FROM content_transition_permits p JOIN content_transitions t ON t.id=p.transition_id WHERE p.transition_id=NEW.transition_id AND p.mode='identity' AND t.local_site=t.source_site AND t.fence_json IS NULL); SELECT RAISE(ABORT,'content_identity_binding_immutable') WHERE EXISTS(SELECT 1 FROM content_transition_identity_proofs p WHERE p.transition_id=NEW.transition_id AND p.member_uid=NEW.member_uid AND (p.first_commit<>NEW.first_commit OR p.target_entity_id<>NEW.target_entity_id)); END`),
    `CREATE TRIGGER content_identity_binding_immutable BEFORE UPDATE ON content_transition_identity_proofs WHEN OLD.first_commit<>NEW.first_commit OR OLD.target_entity_id<>NEW.target_entity_id OR OLD.source_name<>NEW.source_name OR OLD.normalized_name<>NEW.normalized_name BEGIN SELECT RAISE(ABORT,'content_identity_binding_immutable'); END`,
  ];
}
/** No proof argument: normalization is minted internally from sealed facts. */
export async function validateIdentityProjection(db:D1Database,plan:TransitionPlan,revision:number):Promise<void> {
  const boundary=await db.prepare("SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1").bind(plan.id).first<number>("n");
  if(!boundary) throw new Error("Identity proof requires a sealed source boundary");
  const context=await readProjectionContext(db,plan,boundary);
  const names=(await db.prepare("SELECT DISTINCT json_extract(after_json,'$.uid') uid,json_extract(after_json,'$.name') name FROM content_transition_journal WHERE transition_id=? AND row_table='members' AND after_json IS NOT NULL AND commit_seq<=?").bind(plan.id,boundary).all<{uid:number;name:string}>()).results;
  for(const fact of names) {
    const member=context.members.find(member=>member.uid===fact.uid);
    if(!member || member.targetUid!==null) continue;
    const normalized=normalizeOtwPlaySearchText(fact.name);
    if(!normalized || !member.externalEntityId) throw new Error(`Manifest external persona name conflict: members/[${fact.uid}]`);
    await db.batch([
      db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,id,'identity-proof',generation-1,'identity',? FROM content_transitions WHERE id=? AND local_site=source_site AND fence_json IS NULL AND manifest_revision=? AND manifest_digest=?").bind(boundary,plan.id,revision,plan.manifestDigest),
      db.prepare(`INSERT INTO content_transition_identity_proofs(transition_id,member_uid,first_commit,target_entity_id,source_name,normalized_name,protocol,manifest_digest,manifest_revision,generation) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(transition_id,member_uid,source_name) DO UPDATE SET protocol=excluded.protocol,manifest_digest=excluded.manifest_digest,manifest_revision=excluded.manifest_revision,generation=excluded.generation`).bind(plan.id,member.uid,member.firstCommit!,member.externalEntityId,fact.name,normalized,plan.protocol,plan.manifestDigest,revision,plan.generation),
      db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(plan.id),
    ]);
  }
  const conflict=await db.prepare("SELECT commit_seq,row_key,reason FROM content_transition_identity_conflicts WHERE transition_id=? ORDER BY commit_seq LIMIT 1").bind(plan.id).first();
  if(conflict) throw new Error(`Manifest identity/name/alias conflict: ${JSON.stringify(conflict)}`);
  if(!await db.prepare(`SELECT ${identityProjectionValidSql()} valid FROM content_transitions t WHERE id=?`).bind(plan.id).first<number>("valid")) throw new Error("Manifest missing/stale sealed identity proof");
}
