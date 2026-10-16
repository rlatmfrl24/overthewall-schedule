import {catalogImportProjection} from "../features/otw-play";
import {parseSiteStorageResources} from "@contracts/site-definition";
import type {ChzzkChildResult} from "@contracts/content-transition-chzzk";
import {D1TransitionRepository} from "../features/content-transition";
import {autoUpdateSchedules,D1ChzzkCollectorWriter,parseChzzkScanCommand} from "../features/schedules";
import {getDb} from "../platform/db";
import type {Env} from "../platform/types";
import {transitionPeer,deliverTransitionOutcome} from "./content-transition";

export async function executeOriginalChzzkChild(env:Env,id:string,operationId:string,childKey:string):Promise<ChzzkChildResult> {
  const {site,database,bucket}=parseSiteStorageResources(env),repository=new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection);
  const args=[id,operationId,childKey] as const;
  const existing=await repository.readChzzkChildResult(...args);if(existing) return existing;
  const owner=await repository.readTransition(id);
  if(owner.sourceSite===site && owner.phase==="source_fenced") {
    const {peer}=await transitionPeer(env,id,"source");
    return repository.receiveChzzkChildResult(...args,await peer.executeChzzkChild(...args));
  }
  const operation=await repository.exportOperation(id,operationId);
  let withdrawn=0,sourceConflict=false;
  if(owner.targetSite===site && operation.sourceSequence!==null) {
    const {peer}=await transitionPeer(env,id,"target");
    await repository.receiveChzzkChild(await peer.chzzkChild(...args));
    const copied=await repository.readChzzkChildResult(...args);if(copied) return copied;
    const source=await peer.executeChzzkSourceHoliday(...args);withdrawn=source.withdrawn;sourceConflict=source.conflicted;
  }
  const stage=(await repository.readChzzkScanStage(id,operationId))!,command=parseChzzkScanCommand(operation.payload)!;
  const member=command.members.find(member=>member.code===stage.targets.find(target=>target.key===childKey)?.memberCode);
  if(!member) throw new Error("Unknown original child member");
  const incomplete=!stage.completion.result.channelResults.some(channel=>channel.channelId===member.channelId && channel.status==="complete");
  const original=await repository.prepareChzzkMatchInput(...args);
  const writer=await D1ChzzkCollectorWriter.create(repository,...args);
  const result=await autoUpdateSchedules(getDb(env),original.rangeDays,{skipScan:true,matchTarget:original.target,originalInput:original.input,collectorWriter:writer});
  return repository.recordChzzkChildResult(...args,{status:incomplete||writer.hasConflicts||sourceConflict?"partial":"succeeded",result:{...result,obsoletePending:result.obsoletePending+withdrawn}});
}

export async function finishOriginalChzzkParent(env:Env,id:string,operationId:string) {
  const {repository,peer}=await transitionPeer(env,id,"target"),receipt=await peer.chzzkFinalizer(id,operationId);
  if(!receipt) return false;
  if(!await repository.readChzzkScanStage(id,operationId)) {
    const stage=await peer.chzzkStage(id,operationId);if(!stage) throw new Error("Missing original completed scan stage");
    await repository.receiveChzzkScanStage(stage);
  }
  for(const child of receipt.children) if(!await repository.readChzzkChildResult(id,operationId,child.key)) await repository.receiveChzzkChild(await peer.chzzkChild(id,operationId,child.key));
  await repository.receiveChzzkFinalizer(receipt);await deliverTransitionOutcome(env,id,"operation",operationId);return true;
}
