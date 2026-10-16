import type { SiteId } from "@contracts/site-definition";
import type {ChzzkScanCommand} from "@contracts/content-transition-chzzk";
import {CHZZK_SESSION_RESUME_MARGIN_MS} from "../../schedules/commands";
import {editableCollectorSql} from "./collector-mutation";

export function chzzkMatchInputSql(command:ChzzkScanCommand,memberUid:number,date:string,siteId:SiteId="otw") {
  const arrays:Array<{key:string;table:Parameters<typeof editableCollectorSql>[0];fields:string[];where:string;bindings:unknown[];order:string}>=[
    {key:"members",table:"members",fields:["uid","name","url_chzzk"],where:"a.uid=? AND coalesce(a.is_deprecated,0)<>1",bindings:[memberUid],order:"uid"},
    {key:"schedules",table:"schedules",fields:["id","member_uid","date","start_time","title","status"],where:"a.member_uid=? AND a.date=?",bindings:[memberUid,date],order:"id"},
    {key:"observations",table:"schedule_broadcast_observations",fields:["member_uid","vod_id","title","started_at","ended_at","duration_seconds","thumbnail_url"],where:"a.member_uid=? AND a.ended_at>=? AND a.started_at<=?",bindings:[memberUid,Date.parse(`${command.startDate}T00:00:00+09:00`)-CHZZK_SESSION_RESUME_MARGIN_MS,Date.parse(`${command.today}T23:59:59.999+09:00`)],order:"vod_id"},
    {key:"rejections",table:"schedule_candidate_rejections",fields:["vod_id","source_vod_ids"],where:"EXISTS(SELECT 1 FROM schedule_broadcast_observations observation WHERE observation.member_uid=? AND (observation.vod_id=a.vod_id OR EXISTS(SELECT 1 FROM json_each(a.source_vod_ids) rejected WHERE rejected.value=observation.vod_id)))",bindings:[memberUid],order:"vod_id"},
    {key:"pending",table:"pending_schedules",fields:["id","member_uid","date","start_time","action_type","existing_schedule_id","candidate_kind","vod_id"],where:"a.member_uid=? AND a.date=?",bindings:[memberUid,date],order:"id"},
  ];
  return {sql:`json_object('startedAt',?,${arrays.map(entry=>`'${entry.key}',json((SELECT json_group_array(json(value)) FROM (SELECT json_object(${entry.fields.flatMap(field=>[`'${field}'`,`a.${field}`]).join(",")}) value FROM ${entry.table} a WHERE ${entry.where} AND ${editableCollectorSql(entry.table,"a",siteId)} ORDER BY a.${entry.order})))`).join(",")})`,bindings:[command.startedAt,...arrays.flatMap(entry=>entry.bindings)]};
}
