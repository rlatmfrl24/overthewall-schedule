import type { SiteId } from "@contracts/site-definition";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { memberRootPredicates } from "./member-roots";

const cutoffSeconds = Date.parse(SITE_OPENS_AT) / 1000;
const hiddenCodes = "'bing_hayu','u_lili','yang_mei'";
const hiddenUids = `SELECT uid FROM members WHERE code IN (${hiddenCodes})`;
const predicates = memberRootPredicates(expression => `${expression} IN (${hiddenUids})`);
// OTW row identities explicitly confirmed by the operator; titles are not selectors.
const reviewedDdayIds = [4, 9, 10, 11];
export const publicationCutoffSql=(siteId:SiteId)=>siteId==='otw'?`max(unixepoch(),${Math.floor(Date.now()/1000)})>=${cutoffSeconds}`:'0';
export const isPublicationCutoffSqlError=(message:string)=>/^D1_ERROR: (?:bad JSON path: 'publication_cutoff'|JSON path error near 'publication_cutoff'): SQLITE_ERROR$/.test(message);

function channelOwnerSql(channelSql: string, remaining: boolean): string {
  // Keep the ownership alternatives flat enough for D1's expression-depth limit.
  const owners = `SELECT uid FROM members WHERE youtube_channel_id=${channelSql}
    UNION SELECT member_uid FROM member_links WHERE youtube_channel_id=${channelSql}${remaining?' AND enabled=1':''}
    UNION SELECT publication_entity.member_uid FROM music_channels publication_channel JOIN music_channel_entities publication_credit ON publication_credit.channel_id=publication_channel.id JOIN music_entities publication_entity ON publication_entity.id=publication_credit.entity_id WHERE publication_channel.provider='youtube' AND publication_channel.external_channel_id=${channelSql}${remaining?" AND publication_channel.active=1 AND publication_channel.verification_status='approved' AND publication_entity.archived_at IS NULL":''}`;
  return `EXISTS(SELECT 1 FROM members publication_owner WHERE coalesce(publication_owner.code,'') ${remaining?'NOT IN':'IN'} (${hiddenCodes})${remaining?" AND publication_owner.content_access='normal' AND coalesce(publication_owner.is_deprecated,0)=0":''} AND publication_owner.uid IN (${owners}))`;
}
const hiddenChannelSql = (channelSql: string) => `(${channelOwnerSql(channelSql,false)} AND NOT ${channelOwnerSql(channelSql,true)})`;
export function publicationChannelHiddenSql(channelSql: string, siteId: SiteId): string {
  return siteId === 'otw' ? `(${publicationCutoffSql(siteId)} AND ${hiddenChannelSql(channelSql)})` : '0';
}
predicates.music_channels = hiddenChannelSql('a.external_channel_id');
predicates.music_channel_upload_monitors = `EXISTS(SELECT 1 FROM music_channels monitor_channel WHERE monitor_channel.id=a.channel_id AND ${hiddenChannelSql('monitor_channel.external_channel_id')})`;
predicates.music_ingestion_candidates = `((${predicates.music_ingestion_candidates}) OR ${hiddenChannelSql('a.channel_id')})`;
predicates.youtube_feed_sources = `(((${predicates.youtube_feed_sources}) OR ${channelOwnerSql('a.youtube_channel_id',false)}) AND NOT ${channelOwnerSql('a.youtube_channel_id',true)})`;
predicates.youtube_feed_videos = `EXISTS(SELECT 1 FROM youtube_feed_sources feed_source WHERE feed_source.id=a.source_id AND ${predicates.youtube_feed_sources.replace(/\ba\./g,'feed_source.')})`;
// A shared media source remains collectable while another normal performance needs it.
predicates.music_media_sources = `(EXISTS(SELECT 1 FROM music_channels source_channel WHERE source_channel.id=a.channel_id AND (${predicates.music_channels!.replace(/\ba\./g, "source_channel.")})) OR EXISTS(SELECT 1 FROM music_performance_sources link JOIN music_performances source_performance ON source_performance.id=link.performance_id WHERE link.source_id=a.id AND (${predicates.music_performances!.replace(/\ba\./g, "source_performance.")}))) AND NOT EXISTS(SELECT 1 FROM music_performance_sources link JOIN music_performances source_performance ON source_performance.id=link.performance_id WHERE link.source_id=a.id AND source_performance.content_access='normal' AND NOT (${predicates.music_performances!.replace(/\ba\./g, "source_performance.")}))`;

/** Reuses archive roots; SQL time also guards statements prepared before midnight. */
export function publicationHiddenSql(table: string, alias: string, siteId: SiteId, timeSql = `max(unixepoch(),${Math.floor(Date.now() / 1000)})`): string {
  if (siteId !== "otw") return "0";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid publication SQL alias");
  const predicate = predicates[table] ?? (table === "ddays" ? `EXISTS(SELECT 1 FROM content_transition_membership cm JOIN content_transitions ct ON ct.id=cm.transition_id WHERE ct.local_site='otw' AND ct.local_site=ct.source_site AND ct.aborted_at IS NULL AND cm.row_table='ddays' AND cm.row_key=json_array(a.id) AND EXISTS(SELECT 1 FROM json_each(ct.plan_json,'$.members') selected WHERE json_extract(selected.value,'$.code') IN ('bing_hayu','u_lili','yang_mei')))` : null);
  const selected = table === "ddays" ? `(a.id IN (${reviewedDdayIds.join(",")}) OR (${predicate}))` : predicate;
  return selected ? `(${timeSql} >= ${cutoffSeconds} AND (${selected.replace(/\ba\./g, `${alias}.`)}))` : "0";
}
