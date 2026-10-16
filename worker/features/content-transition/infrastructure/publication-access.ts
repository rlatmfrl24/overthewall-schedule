import type { SiteId } from "@contracts/site-definition";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { memberRootPredicates, type ContentTable } from "./capture-graph";

const cutoffSeconds = Date.parse(SITE_OPENS_AT) / 1000;
const hiddenUids = "SELECT uid FROM members WHERE code IN ('bing_hayu','u_lili','yang_mei')";
const predicates = memberRootPredicates(expression => `${expression} IN (${hiddenUids})`);
// OTW row identities explicitly confirmed by the operator; titles are not selectors.
const reviewedDdayIds = [4, 9, 10, 11];
export const publicationCutoffSql=(siteId:SiteId)=>siteId==='otw'?`max(unixepoch(),${Math.floor(Date.now()/1000)})>=${cutoffSeconds}`:'0';
export const isPublicationCutoffSqlError=(message:string)=>/^D1_ERROR: (?:bad JSON path: 'publication_cutoff'|JSON path error near 'publication_cutoff'): SQLITE_ERROR$/.test(message);

export function publicationChannelHiddenSql(channelSql: string, siteId: SiteId): string {
  if (siteId !== "otw") return "0";
  const owns = (active:boolean)=>`owner.youtube_channel_id=${channelSql} OR EXISTS(SELECT 1 FROM member_links ml WHERE ml.member_uid=owner.uid AND ml.youtube_channel_id=${channelSql}${active?' AND ml.enabled=1':''}) OR EXISTS(SELECT 1 FROM music_channels ch JOIN music_channel_entities ce ON ce.channel_id=ch.id JOIN music_entities e ON e.id=ce.entity_id WHERE ch.provider='youtube' AND ch.external_channel_id=${channelSql} AND e.member_uid=owner.uid${active?" AND ch.active=1 AND ch.verification_status='approved' AND e.archived_at IS NULL":''})`;
  return `(${publicationCutoffSql(siteId)} AND EXISTS(SELECT 1 FROM members owner WHERE owner.uid IN (${hiddenUids}) AND (${owns(false)})) AND NOT EXISTS(SELECT 1 FROM members owner WHERE owner.uid NOT IN (${hiddenUids}) AND owner.content_access='normal' AND coalesce(owner.is_deprecated,0)=0 AND (${owns(true)})))`;
}
// A shared media source remains collectable while another normal performance needs it.
predicates.music_media_sources = `(EXISTS(SELECT 1 FROM music_channels source_channel WHERE source_channel.id=a.channel_id AND (${predicates.music_channels!.replace(/\ba\./g, "source_channel.")})) OR EXISTS(SELECT 1 FROM music_performance_sources link JOIN music_performances source_performance ON source_performance.id=link.performance_id WHERE link.source_id=a.id AND (${predicates.music_performances!.replace(/\ba\./g, "source_performance.")}))) AND NOT EXISTS(SELECT 1 FROM music_performance_sources link JOIN music_performances source_performance ON source_performance.id=link.performance_id WHERE link.source_id=a.id AND source_performance.content_access='normal' AND NOT (${predicates.music_performances!.replace(/\ba\./g, "source_performance.")}))`;

/** Reuses archive roots; SQL time also guards statements prepared before midnight. */
export function publicationHiddenSql(table: ContentTable, alias: string, siteId: SiteId, timeSql = `max(unixepoch(),${Math.floor(Date.now() / 1000)})`): string {
  if (siteId !== "otw") return "0";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid publication SQL alias");
  const predicate = predicates[table] ?? (table === "ddays" ? `EXISTS(SELECT 1 FROM content_transition_membership cm JOIN content_transitions ct ON ct.id=cm.transition_id WHERE ct.local_site='otw' AND ct.local_site=ct.source_site AND ct.aborted_at IS NULL AND cm.row_table='ddays' AND cm.row_key=json_array(a.id) AND EXISTS(SELECT 1 FROM json_each(ct.plan_json,'$.members') selected WHERE json_extract(selected.value,'$.code') IN ('bing_hayu','u_lili','yang_mei')))` : null);
  const selected = table === "ddays" ? `(a.id IN (${reviewedDdayIds.join(",")}) OR (${predicate}))`
    : table === 'music_ingestion_candidates' ? `((${predicate}) OR ${publicationChannelHiddenSql('a.channel_id',siteId)})` : predicate;
  return selected ? `(${timeSql} >= ${cutoffSeconds} AND (${selected.replace(/\ba\./g, `${alias}.`)}))` : "0";
}
