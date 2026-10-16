import type {YouTubeChannelReadRequest,YouTubeChannelReadResponse,YouTubeMetadataFailure,YouTubeChannelReadReceipt} from "@contracts/content-transition-youtube";
import type {OperationOutcome} from "@contracts/content-transition";

export const youtubeExhaustedOutcome=(receipt:YouTubeChannelReadReceipt):OperationOutcome=>({outcome:"failed",sideEffectReconciled:true,detail:"Original admin metadata GET exhausted four interrupted HTTP attempts without a durable response; no catalog business committed",youtubeChannel:{requestKey:receipt.requestKey,requestHash:receipt.requestHash,responseHash:null,disposition:"exhausted_unknown",result:null,failure:{message:"YouTube metadata request could not be recovered after four interrupted attempts",code:"network",retryable:false,retryAfterMs:null}}});

export const youtubeChannelRequest=(channelId:string):YouTubeChannelReadRequest=>{
  if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new Error("Invalid original YouTube channel");
  return {path:"channels",parameters:{part:"snippet",id:channelId,maxResults:"1"},httpAttemptLimit:4};
};
export const youtubeChannelRequestKey=(channelId:string)=>`youtube:channels:snippet:${channelId}`;
export function parseYouTubeMetadataFailure(raw:unknown):YouTubeMetadataFailure|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const error=raw as Record<string,unknown>;
  if(Object.keys(error).sort().join(",")!=="code,message,retryAfterMs,retryable" || typeof error.message!=="string" || error.message.length>1000 || !["timeout","network","upstream_5xx","invalid_response","rate_limited","quota_exceeded","configuration","provider_auth","invalid_request"].includes(String(error.code)) || typeof error.retryable!=="boolean" || !(error.retryAfterMs===null || Number.isFinite(error.retryAfterMs) && Number(error.retryAfterMs)>=0)) return null;
  return {message:error.message,code:error.code as YouTubeMetadataFailure["code"],retryable:error.retryable,retryAfterMs:error.retryAfterMs===null?null:Number(error.retryAfterMs)};
}
export function parseYouTubeChannelResponse(raw:unknown,request:YouTubeChannelReadRequest):YouTubeChannelReadResponse|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>;
  if(value.status==="success" && Object.keys(value).sort().join(",")==="channel,status") {
    if(value.channel===null) return {status:"success",channel:null};
    const channel=value.channel as Record<string,unknown>;
    if(channel && typeof channel==="object" && !Array.isArray(channel) && Object.keys(channel).sort().join(",")==="channelId,displayName" && channel.channelId===request.parameters.id && typeof channel.displayName==="string" && channel.displayName.trim()) return {status:"success",channel:{channelId:channel.channelId,displayName:channel.displayName}};
  }
  if(value.status==="error" && Object.keys(value).sort().join(",")==="error,status") {
    const error=parseYouTubeMetadataFailure(value.error);
    if(error) return {status:"error",error};
  }
  return null;
}
