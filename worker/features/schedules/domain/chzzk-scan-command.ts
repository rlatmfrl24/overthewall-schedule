import type {ChzzkScanCommand,ChzzkScanRequest,ChzzkScanResponse,ChzzkScanResult,ChzzkScanParent} from "@contracts/chzzk-scan";
import {isIsoDate} from "./schedule-input";

const record=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==="object" && !Array.isArray(value);
const channel=(value:unknown):value is string=>typeof value==="string" && /^[a-f0-9]{32}$/.test(value);
export const CHZZK_SESSION_RESUME_MARGIN_MS=60*60_000;
export function parseChzzkScanParent(value:unknown):ChzzkScanParent|null {
  if(!record(value) || typeof value.runId!=="string" || !value.runId || value.runId.length>200) return null;
  if(value.kind!=="scheduled" || typeof value.itemId!=="string" || !value.itemId || value.itemId.length>200 || Object.keys(value).sort().join(",")!=="itemId,kind,runId") return null;
  return {kind:"scheduled",runId:value.runId,itemId:value.itemId};
}
export function parseChzzkScanResult(value:unknown):ChzzkScanResult|null {
  if(!record(value) || !Number.isSafeInteger(value.channels) || Number(value.channels)<1 || !Number.isSafeInteger(value.observations) || Number(value.observations)<0 || !Array.isArray(value.channelResults) || value.channelResults.length!==value.channels) return null;
  const channelResults:ChzzkScanResult["channelResults"]=[];
  for(const row of value.channelResults) {
    if(!record(row) || !channel(row.channelId) || !["complete","failed","incomplete"].includes(String(row.status)) || channelResults.some(item=>item.channelId===row.channelId)) return null;
    channelResults.push({channelId:row.channelId,status:row.status as "complete"|"failed"|"incomplete"});
  }
  return {channels:Number(value.channels),observations:Number(value.observations),channelResults};
}
export function parseChzzkScanCommand(value:unknown):ChzzkScanCommand|null {
  if(!record(value) || !Array.isArray(value.members) || !value.members.length || !Number.isSafeInteger(value.rangeDays) || Number(value.rangeDays)<1 || !Number.isSafeInteger(value.startedAt) || Number(value.startedAt)<0 || !isIsoDate(value.startDate) || !isIsoDate(value.today) || value.startDate>value.today) return null;
  const members:ChzzkScanCommand["members"]=[];
  for(const row of value.members) {
    if(!record(row) || !Number.isSafeInteger(row.uid) || Number(row.uid)<1 || typeof row.code!=="string" || !row.code || typeof row.name!=="string" || !channel(row.channelId) || members.some(member=>member.uid===row.uid || member.channelId===row.channelId)) return null;
    members.push({uid:Number(row.uid),code:row.code,name:row.name,channelId:row.channelId});
  }
  const parent=value.parent===undefined?undefined:parseChzzkScanParent(value.parent);
  if(parent===null) return null;
  return {members,rangeDays:Number(value.rangeDays),startedAt:Number(value.startedAt),startDate:value.startDate,today:value.today,...(parent?{parent}:{})};
}
export function parseChzzkScanRequest(value:unknown,command:ChzzkScanCommand):ChzzkScanRequest|null {
  if(!record(value) || !channel(value.channelId) || !command.members.some(member=>member.channelId===value.channelId)) return null;
  if(value.kind==="live") return {kind:"live",channelId:value.channelId};
  if(value.kind!=="videos" || !Number.isSafeInteger(value.page) || Number(value.page)<0 || Number(value.page)>2 || value.size!==5) return null;
  return {kind:"videos",channelId:value.channelId,page:Number(value.page),size:5};
}
export const chzzkScanRequestKey=(request:ChzzkScanRequest)=>`${request.kind}:${request.channelId}:${request.kind==="videos"?request.page:0}`;
export function parseChzzkScanResponse(value:unknown,request:ChzzkScanRequest):ChzzkScanResponse|null {
  if(!record(value) || value.kind!==request.kind) return null;
  if(request.kind==="videos") {
    if(value.videos===null) return {kind:"videos",videos:null};
    if(!Array.isArray(value.videos) || value.videos.length>5) return null;
    const videos=[];
    for(const item of value.videos) {
      if(!record(item) || typeof item.videoId!=="string" || typeof item.videoTitle!=="string" || !(item.publishDateAt===null || typeof item.publishDateAt==="number" && Number.isFinite(item.publishDateAt)) || !(item.duration===null || typeof item.duration==="number" && Number.isFinite(item.duration)) || !(item.thumbnailImageUrl===null || typeof item.thumbnailImageUrl==="string")) return null;
      videos.push({videoId:item.videoId,videoTitle:item.videoTitle,publishDateAt:item.publishDateAt,duration:item.duration,thumbnailImageUrl:item.thumbnailImageUrl});
    }
    return {kind:"videos",videos};
  }
  if(typeof value.staleCacheUsed!=="boolean" || !(value.error===null || typeof value.error==="string")) return null;
  if(value.content===null) return {kind:"live",content:null,error:value.error,staleCacheUsed:value.staleCacheUsed};
  if(!record(value.content) || !["OPEN","CLOSE","CLOSED"].includes(String(value.content.status)) || !(value.content.openDate===null || typeof value.content.openDate==="string")) return null;
  return {kind:"live",content:{status:value.content.status as "OPEN"|"CLOSE"|"CLOSED",openDate:value.content.openDate},error:value.error,staleCacheUsed:value.staleCacheUsed};
}
