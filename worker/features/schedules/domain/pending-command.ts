import type { PendingApprovalOptions, PendingRejectionOptions } from "../../../../contracts/pending-schedules";
import { isPendingApplyMode, isPendingTargetMode, isPendingTimeMode, isPendingRejectionReasonCode } from "./pending-schedule";

export type PendingCommand = { action:"approve"; id:number; options:PendingApprovalOptions|null }
  | { action:"reject"; id:number; options:PendingRejectionOptions|null }
  | { action:"apply_empty"; id:number; targetId:number }
  | { action:"reset_processed"|"reopen_rejection"; id:number };
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==="object" && !Array.isArray(value);
const id=(value:unknown):value is number=>Number.isSafeInteger(value) && Number(value)>0;
export function parsePendingCommand(value:unknown):PendingCommand|null {
  if(!object(value) || !id(value.id)) return null;
  if(value.action==="reset_processed" || value.action==="reopen_rejection") return {action:value.action,id:value.id};
  if(value.action==="apply_empty") return id(value.targetId)?{action:"apply_empty",id:value.id,targetId:value.targetId}:null;
  if(value.action==="approve") {
    if(value.options===null) return {action:"approve",id:value.id,options:null};
    const options=value.options;
    if(!object(options) || !isPendingApplyMode(options.applyMode) || !isPendingTargetMode(options.targetMode) || !isPendingTimeMode(options.timeMode) || !(options.targetScheduleId===null || options.targetScheduleId===undefined || id(options.targetScheduleId))) return null;
    return {action:"approve",id:value.id,options:{applyMode:options.applyMode,targetMode:options.targetMode,timeMode:options.timeMode,targetScheduleId:options.targetScheduleId??null}};
  }
  if(value.action==="reject") {
    if(value.options===null) return {action:"reject",id:value.id,options:null};
    const options=value.options;
    if(!object(options) || !(options.reasonCode===null || options.reasonCode===undefined || isPendingRejectionReasonCode(options.reasonCode)) || !(options.reasonNote===null || options.reasonNote===undefined || typeof options.reasonNote==="string" && options.reasonNote.length<=500)) return null;
    return {action:"reject",id:value.id,options:{reasonCode:options.reasonCode??null,reasonNote:typeof options.reasonNote==="string"?options.reasonNote.trim()||null:null}};
  }
  return null;
}
