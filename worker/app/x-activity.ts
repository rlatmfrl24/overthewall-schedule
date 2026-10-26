import { getSitePublication } from "@contracts/site-publication";
import { isXActivityQueueMessage, type XActivitySitePort, type XActivityQueueMessage } from "@contracts/x-activity";
import { D1XActivityCoordinator, D1XActivitySite, XActivityError, type XActivityService } from "../features/x-posts";
import { getWorkerSiteResources } from "../platform/site";
import { D1ScheduledJobRepository } from "../platform/scheduled-jobs";
import { CloudflareD1ReadBudget } from "../platform/cloudflare-d1-read-budget";
import type { Env } from "../platform/types";
import { withXGateway, buildXGateway } from "./x-gateway";

async function send(env:Env,message:XActivityQueueMessage){
  if(!env.OTW_OPS_BACKGROUND_QUEUE)throw new Error("Missing background Queue binding");
  if(!await new D1ScheduledJobRepository(env.otw_db).reserveQueueOperations("x"))throw new Error("x_activity_queue_budget_exhausted");
  await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
}
const missingPeer=():never=>{throw new Error("x_activity_connection_unavailable");};
const unavailableSite:XActivitySitePort={snapshot:async()=>missingPeer(),rememberUser:async()=>missingPeer(),accept:async()=>missingPeer(),events:async()=>missingPeer(),setRecoveryInterval:async()=>missingPeer()};

export function buildXActivitySite(input:Env){
  const env=withXGateway(input),{site}=getWorkerSiteResources(env);
  return new D1XActivitySite({db:env.otw_db,siteId:site.id,gateway:env.X_API_GATEWAY!,
    publicationOpen:()=>getSitePublication(site.id,Date.now(),env.SITE_PUBLICATION_HOLD==="true").phase==="open",
    dispatch:eventId=>send(env,{type:"x_activity",eventId})});
}

export function buildXActivityCoordinator(input:Env){
  const env=withXGateway(input),{site}=getWorkerSiteResources(env);
  if(site.id!=="otw"||!site.publicOrigin)throw new Error("x_activity_wrong_coordinator");
  return new D1XActivityCoordinator({db:env.otw_db,origin:site.publicOrigin,bearerToken:env.X_BEARER_TOKEN,clientSecret:env.X_CLIENT_SECRET,
    gateway:buildXGateway(env,"otw"),sites:{otw:buildXActivitySite(env),luvdia:env.X_ACTIVITY_LUVDIA??unavailableSite},
    peerReady:async()=>{if(!env.X_ACTIVITY_LUVDIA)return false;const result=await env.X_ACTIVITY_LUVDIA.protocol();return result.version===1&&result.site==="luvdia";},
    admitD1:async()=>(await new CloudflareD1ReadBudget(env.CLOUDFLARE_ACCOUNT_ID,env.CLOUDFLARE_D1_TOKEN,env.OTW_PLAY_D1_READ_DAILY_TARGET).read()).status==="available",
    dispatch:eventId=>send(env,{type:"x_activity_dispatch",eventId})});
}

export function buildXActivityService(input:Env):XActivityService{
  const env=withXGateway(input),{site}=getWorkerSiteResources(env),local=buildXActivitySite(env);
  if(site.id==="otw"){
    const coordinator=buildXActivityCoordinator(env);
    return {status:()=>coordinator.status("otw"),start:()=>coordinator.start("otw"),stop:()=>coordinator.stop("otw"),
      accept:body=>coordinator.accept(body),process:id=>local.process(id),deliver:id=>coordinator.deliver(id),
      reconcile:async(canProcess=true)=>{await coordinator.reconcile(canProcess);if(canProcess)await local.recover();}};
  }
  const remote=()=>env.X_ACTIVITY_COORDINATOR??missingPeer();
  const control=async(action:"start"|"stop")=>{const result=await remote().controlForLuvdia(action);if(!result.ok)throw new XActivityError(result.error,result.status);return result.value;};
  return {status:()=>remote().statusForLuvdia(),start:()=>control("start"),stop:()=>control("stop"),
    accept:async()=>false,process:id=>local.process(id),deliver:async()=>missingPeer(),
    reconcile:async(canProcess=true)=>{if(canProcess)await local.recover();}};
}

export async function handleXActivityQueue(batch:MessageBatch<unknown>,env:Env){
  const service=buildXActivityService(env);
  const budget=await new CloudflareD1ReadBudget(env.CLOUDFLARE_ACCOUNT_ID,env.CLOUDFLARE_D1_TOKEN,env.OTW_PLAY_D1_READ_DAILY_TARGET).read();
  for(const message of batch.messages){
    if(!isXActivityQueueMessage(message.body))continue;
    try{
      if(budget.status!=="available"){message.ack();continue;}
      if(message.body.type==="x_activity_dispatch"){await service.deliver(message.body.eventId);await service.reconcile(true);}
      else await service.process(message.body.eventId);
      message.ack();
    }catch(error){
      console.error("x_activity_processing_failed",{eventId:message.body.eventId,error:error instanceof Error?error.message:"unknown"});
      if(batch.queue===getWorkerSiteResources(env).queues.deadLetter)message.ack();
      else if(await new D1ScheduledJobRepository(env.otw_db).reserveQueueOperations("x"))message.retry({delaySeconds:60});
      else message.ack();
    }
  }
}
