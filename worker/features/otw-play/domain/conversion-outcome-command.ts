/** Original no-GET conversion outcome. The own actor and generated event ID
 * remain private to the accepting site. */
export type ConversionOutcomeInput={jobId:string|null;candidateId:string;expectedVersion:number;outcome:'duplicate'|'stale'|'validation_failed'|'retryable_failed';performanceId:string|null;errorCode:string|null;jobOnly?:true};
export type ConversionOutcomeCommand=ConversionOutcomeInput & {actorUserId:string;eventId:string;now:number;validatedVersion?:number};
export function parseConversionOutcome(raw:unknown):ConversionOutcomeInput|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>,text=(item:unknown):item is string=>typeof item==='string'&&item.length>0&&item.length<=200;
  if(!text(value.candidateId)||!Number.isSafeInteger(value.expectedVersion)||Number(value.expectedVersion)<0||!(value.jobId===null||text(value.jobId))||!['duplicate','stale','validation_failed','retryable_failed'].includes(String(value.outcome))||!(value.performanceId===null||text(value.performanceId))||!(value.errorCode===null||text(value.errorCode))) return null;
  if(value.jobOnly!==undefined&&(value.jobOnly!==true||!text(value.jobId)||value.outcome!=='validation_failed'||value.performanceId!==null)) return null;
  return {jobId:value.jobId,candidateId:value.candidateId,expectedVersion:Number(value.expectedVersion),outcome:value.outcome as ConversionOutcomeInput['outcome'],performanceId:value.performanceId,errorCode:value.errorCode,...(value.jobOnly===true?{jobOnly:true as const}:{})};
}
