import type {AcceptedOperation,TransitionPlan} from "@contracts/content-transition";
import type {ChzzkScanCommand,ChzzkScanCompletion,ChzzkScanStage} from "@contracts/content-transition-chzzk";
import {parseChzzkScanCommand,CHZZK_SESSION_RESUME_MARGIN_MS} from "../../schedules/commands";
import {assertOperationEvidence} from "./command-codecs";

/** Local control for the original run. Stage rows never constitute a terminal
 * operation receipt, and child identities never create top-level admissions. */
export class D1ChzzkContinuationStore {
  private readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}
  registration(operation:AcceptedOperation,command:ChzzkScanCommand) {
    const parent=command.parent;if(!parent) return [];
    // Both the real manual HTTP entry and Cron use existing scheduled run/item
    // identities; the run's source preserves their distinct actor/accounting.
    return [
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM scheduled_job_items i JOIN scheduled_job_runs r ON r.id=i.run_id
        WHERE i.id=? AND i.run_id=? AND i.phase='scan' AND r.job_type='schedule_auto_update'
          AND NOT EXISTS(SELECT 1 FROM json_each(?) member WHERE NOT EXISTS(SELECT 1 FROM json_each(i.continuation_json,'$.channelIds') channel WHERE channel.value=json_extract(member.value,'$.channelId')))),1,json('unknown_original_scan_parent'))`)
        .bind(parent.itemId,parent.runId,JSON.stringify(command.members)),
      this.db.prepare(`INSERT OR IGNORE INTO content_transition_chzzk_stages(transition_id,operation_id,parent_json)
        SELECT transition_id,operation_id,? FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=?`)
        .bind(JSON.stringify(parent),operation.transitionId,operation.operationId,operation.payloadHash),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=? AND parent_json=?),1,json('original_scan_parent_conflict'))")
        .bind(operation.transitionId,operation.operationId,JSON.stringify(parent)),
    ];
  }
  stageStatements(id:string,operationId:string,command:ChzzkScanCommand,completion:ChzzkScanCompletion) {
    if(!command.parent) throw new Error("Missing original CHZZK parent");
    const rangeStart=Date.parse(`${command.startDate}T00:00:00+09:00`)-CHZZK_SESSION_RESUME_MARGIN_MS;
    const rangeEnd=Date.parse(`${command.today}T23:59:59.999+09:00`);
    return [
      this.db.prepare("INSERT OR IGNORE INTO content_transition_chzzk_stages(transition_id,operation_id,parent_json) VALUES(?,?,?)").bind(id,operationId,JSON.stringify(command.parent)),
      this.db.prepare(`INSERT INTO content_transition_chzzk_children(transition_id,operation_id,child_key,member_uid,member_code,date)
        SELECT ?,?,json_extract(member.value,'$.code')||':'||days.date,json_extract(member.value,'$.uid'),json_extract(member.value,'$.code'),days.date
        FROM json_each(?) member JOIN (
          SELECT member_uid,strftime('%Y-%m-%d',started_at/1000,'unixepoch','+9 hours') date FROM schedule_broadcast_observations
            WHERE ended_at>=? AND started_at<=? AND content_access='normal'
          UNION SELECT member_uid,date FROM schedule_day_assessments WHERE checked_at=? AND content_access='normal'
        ) days ON days.member_uid=json_extract(member.value,'$.uid')
        WHERE days.date>=? AND days.date<=? AND EXISTS(SELECT 1 FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=? AND completion_json IS NULL)
        GROUP BY json_extract(member.value,'$.uid'),days.date`)
        .bind(id,operationId,JSON.stringify(command.members),rangeStart,rangeEnd,command.startedAt,command.startDate,command.today,id,operationId),
      this.db.prepare(`UPDATE content_transition_chzzk_stages SET completion_json=(SELECT json_object(
        'transitionId',t.id,'operationId',o.operation_id,'payloadHash',o.payload_hash,'parent',json(?),'completion',json(?),
        'owner',json_object('site',t.local_site,'resource',t.local_resource,'generation',p.generation,'commitSequence',p.commit_seq),
        'targets',json((SELECT json_group_array(json_object('key',child_key,'memberUid',member_uid,'memberCode',member_code,'date',date)) FROM
          (SELECT * FROM content_transition_chzzk_children WHERE transition_id=t.id AND operation_id=o.operation_id ORDER BY date,member_uid))))
        FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id JOIN content_transition_permits p ON p.transition_id=t.id AND p.operation_id=o.operation_id
        WHERE t.id=? AND o.operation_id=?) WHERE transition_id=? AND operation_id=? AND parent_json=? AND completion_json IS NULL`)
        .bind(JSON.stringify(command.parent),JSON.stringify(completion),id,operationId,id,operationId,JSON.stringify(command.parent)),
    ];
  }
  async read(id:string,operationId:string):Promise<ChzzkScanStage|null> {
    const row=await this.db.prepare(`SELECT s.parent_json,s.completion_json,o.payload_hash,o.envelope_json,t.plan_json FROM content_transition_chzzk_stages s
      JOIN content_transition_operations o ON o.transition_id=s.transition_id AND o.operation_id=s.operation_id JOIN content_transitions t ON t.id=s.transition_id WHERE s.transition_id=? AND s.operation_id=?`)
      .bind(id,operationId).first<{parent_json:string;completion_json:string|null;payload_hash:string;envelope_json:string;plan_json:string}>();
    if(!row?.completion_json) return null;
    const envelope=JSON.parse(row.envelope_json),command=parseChzzkScanCommand(envelope.sourceCommand?.payload??envelope.payload);
    if(!command?.parent || JSON.stringify(command.parent)!==row.parent_json) throw new Error("Corrupt original scan parent");
    const stage:ChzzkScanStage=JSON.parse(row.completion_json);
    this.validate(stage,command,JSON.parse(row.plan_json),row.payload_hash,id,operationId);
    return stage;
  }
  private validate(stage:ChzzkScanStage,command:ChzzkScanCommand,plan:TransitionPlan,payloadHash:string,id:string,operationId:string) {
    if(!stage || stage.transitionId!==id || stage.operationId!==operationId || stage.payloadHash!==payloadHash || JSON.stringify(stage.parent)!==JSON.stringify(command.parent) || !stage.owner || !Array.isArray(stage.targets)) throw new Error("Original scan stage identity mismatch");
    const source=stage.owner.site===plan.sourceSite;
    if(stage.owner.site!==(source?plan.sourceSite:plan.targetSite) || stage.owner.resource!==(source?plan.sourceResource:plan.targetResource) || stage.owner.generation!==plan.generation-(source?1:0) || !Number.isSafeInteger(stage.owner.commitSequence) || stage.owner.commitSequence<1) throw new Error("Original scan stage owner mismatch");
    assertOperationEvidence({attempt:null,outcome:{outcome:"committed",sideEffectReconciled:true,detail:"Business batch committed",chzzkScan:stage.completion}});
    if(stage.completion.result.channels!==command.members.length || stage.completion.result.channelResults.some(channel=>!command.members.some(member=>member.channelId===channel.channelId))) throw new Error("Original scan stage result mismatch");
    const seen=new Set<string>();
    for(const target of stage.targets) {
      const member=plan.members.find(member=>member.code===target.memberCode);
      if(!member || !command.members.some(member=>member.code===target.memberCode) || target.memberUid!==(source?member.uid:member.targetUid) || target.key!==`${target.memberCode}:${target.date}` || target.date<command.startDate || target.date>command.today || seen.has(target.key)) throw new Error("Original continuation scope mismatch");
      seen.add(target.key);
    }
  }
  async receive(stage:ChzzkScanStage) {
    const row=await this.db.prepare(`SELECT t.plan_json,t.local_site,t.phase,t.fence_json,o.payload_hash,o.envelope_json,o.source_seq,o.seq FROM content_transitions t
      JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND json_extract(o.envelope_json,'$.codec.id')='schedules.chzzk_scan'`)
      .bind(stage.transitionId,stage.operationId).first<{plan_json:string;local_site:string;phase:string;fence_json:string|null;payload_hash:string;envelope_json:string;source_seq:number|null;seq:number}>();
    const envelope=row?JSON.parse(row.envelope_json):null,command=parseChzzkScanCommand(envelope?.sourceCommand?.payload??envelope?.payload);
    if(!row || !command?.parent || !row.fence_json || !["source_fenced","target_owned","complete"].includes(row.phase) || (row.source_seq??row.seq)>JSON.parse(row.fence_json).operationBoundary || stage.owner.site===row.local_site) throw new Error("Not an opposite frozen original scan stage");
    const plan:TransitionPlan=JSON.parse(row.plan_json);
    this.validate(stage,command,plan,row.payload_hash,stage.transitionId,stage.operationId);
    if(stage.owner.site===plan.sourceSite && stage.owner.commitSequence>JSON.parse(row.fence_json).boundary) throw new Error("Scan stage outside committed source tail");
    const prior=await this.read(stage.transitionId,stage.operationId);
    if(prior && JSON.stringify(prior)!==JSON.stringify(stage)) throw new Error("Immutable original scan stage conflict");
    if(prior) return prior;
    const targets=stage.targets.map(target=>({...target,memberUid:command.members.find(member=>member.code===target.memberCode)!.uid}));
    await this.db.batch([
      this.db.prepare(`INSERT INTO content_transition_chzzk_stages(transition_id,operation_id,parent_json,completion_json,handover_acknowledged) VALUES(?,?,?,?,1)
        ON CONFLICT(transition_id,operation_id) DO UPDATE SET completion_json=excluded.completion_json,handover_acknowledged=1 WHERE content_transition_chzzk_stages.completion_json IS NULL AND content_transition_chzzk_stages.parent_json=excluded.parent_json`)
        .bind(stage.transitionId,stage.operationId,JSON.stringify(stage.parent),JSON.stringify(stage)),
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_stages WHERE transition_id=? AND operation_id=? AND completion_json=?),1,json('original_scan_stage_conflict'))").bind(stage.transitionId,stage.operationId,JSON.stringify(stage)),
      ...targets.map(target=>this.db.prepare("INSERT OR IGNORE INTO content_transition_chzzk_children(transition_id,operation_id,child_key,member_uid,member_code,date) VALUES(?,?,?,?,?,?)").bind(stage.transitionId,stage.operationId,target.key,target.memberUid,target.memberCode,target.date)),
    ]);
    return (await this.read(stage.transitionId,stage.operationId))!;
  }
  async assertSettled(id:string,operationId:string) {
    const pending=await this.db.prepare(`SELECT NOT EXISTS(SELECT 1 FROM content_transition_chzzk_stages s WHERE s.transition_id=? AND s.operation_id=? AND
      s.completion_json IS NOT NULL AND s.finalizer_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_children c WHERE c.transition_id=s.transition_id AND c.operation_id=s.operation_id AND (c.result_json IS NULL OR c.accounted_at IS NULL))) pending`)
      .bind(id,operationId).first<number>("pending");
    if(pending) throw new Error("Original scan continuation/finalizer accounting is pending");
  }
}
