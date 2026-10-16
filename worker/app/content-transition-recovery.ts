import {catalogImportProjection} from "../features/otw-play";
import {parseSiteStorageResources} from "@contracts/site-definition";
import { D1TransitionRepository } from "../features/content-transition";
import type {Env} from "../platform/types";
import { deliverTransitionOutcome, transitionPeer } from "./content-transition";
import {ScheduledJobCoordinator,ScheduledJobExecutor} from "../features/scheduled-operations";
import {parseChzzkScanCommand} from "../features/schedules";
import {finishOriginalChzzkParent} from "./content-transition-chzzk";

/** Receipts, not a successful Queue send, retain receiving responsibility. */
export async function recoverTransitionWork(env:Env) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  const repository=new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection);
  if(!await env.otw_db.prepare("SELECT 1 active FROM content_transitions WHERE local_site=? AND local_resource=? AND phase<>'prepared' LIMIT 1").bind(site,database).first("active")) return;
  const failures:unknown[]=[];
  // Original run IDs survive Queue/DLQ exhaustion. Budgeted normal dispatch and
  // reconciliation recover their items independently of collection enable flags.
  let runCursor="";
  for(;;) {
    const rows=await env.otw_db.prepare(`SELECT DISTINCT json_extract(s.parent_json,'$.runId') run_id FROM content_transition_chzzk_stages s
      JOIN content_transition_operations o ON o.transition_id=s.transition_id AND o.operation_id=s.operation_id
      JOIN scheduled_job_runs r ON r.id=json_extract(s.parent_json,'$.runId') WHERE o.outcome_json IS NULL AND r.id>? ORDER BY r.id LIMIT 20`)
      .bind(runCursor).all<{run_id:string}>();
    if(!rows.results.length) break;
    for(const {run_id:runId} of rows.results) {
      try {
        const coordinator=new ScheduledJobCoordinator(env),jobs=coordinator.repository;
        await jobs.recoverOriginalTransitionDelivery(runId);
        const terminal=await env.otw_db.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND status IN ('succeeded','partial','failed','skipped','throttled') ORDER BY id").bind(runId).all<{id:string}>();
        for(const row of terminal.results) {const item=await jobs.readItem(row.id);if(item) await coordinator.advanceRun(item);}
        await coordinator.dispatchRun(runId);await jobs.refreshRun(runId);
        await new ScheduledJobExecutor(env,jobs).finalizeLegacyState(runId);
        for(const row of terminal.results){const item=await jobs.readItem(row.id);if(item)await jobs.acknowledgeReconciliation(item);}
      } catch(error) {failures.push(error);}
    }
    runCursor=rows.results[rows.results.length-1].run_id;
  }
  let transitionCursor="";
  for(;;) {
    const ids=await repository.recoveryTransitions(transitionCursor);
    if(!ids.length) break;
    for(const id of ids) {
      try {
        const owner=await repository.readTransition(id),source=owner.sourceSite===site;
        for(const kind of ["operation","file"] as const) {
          let cursor=0;
          for(;;) {
            const page=await repository.recoveryPage(id,kind,cursor);
            if(!page.length) break;
            for(const item of page) {
              try {
                if(source && owner.phase==="source_fenced") {
                  const {peer}=await transitionPeer(env,id,"source");
                  const reply=kind==="operation"?await peer.receiveOperation(id,item.recordId,item.fingerprint):await peer.receiveFileIntent(id,item.recordId,item.fingerprint);
                  if(!reply.accepted) throw new Error("Original transition receipt rejected");
                } else if(item.terminal && item.sourceSequence!==null) {
                  const operation=kind==="operation"?await repository.exportOperation(id,item.recordId):null;
                  if(operation?.codec.id==="schedules.chzzk_scan" && parseChzzkScanCommand(operation.payload)?.parent) {
                    if(!await finishOriginalChzzkParent(env,id,item.recordId)) throw new Error("Original completed scan control is pending");
                  } else await deliverTransitionOutcome(env,id,kind,item.recordId);
                } else {
                  if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error("Missing selected recovery queue");
                  await env.OTW_OPS_BACKGROUND_QUEUE.send({type:"content-transition.operation",version:1,transitionId:id,operationId:item.recordId,payloadHash:item.fingerprint});
                }
              } catch(error) {failures.push(error);}
            }
            cursor=page[page.length-1].seq;
          }
        }
      } catch(error) {failures.push(error);}
    }
    transitionCursor=ids[ids.length-1];
  }
  if(failures.length) throw new AggregateError(failures,"Accepted transition work recovery failed");
}
