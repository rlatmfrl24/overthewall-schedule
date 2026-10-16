export function memberRootPredicates(selectedUid: (expression: string) => string): Partial<Record<string, string>> {
const selectedChannel = (expression: string) => `EXISTS(SELECT 1 FROM music_channel_entities ce JOIN music_entities e ON e.id=ce.entity_id WHERE ce.channel_id=${expression} AND ${selectedUid("e.member_uid")}) OR EXISTS(SELECT 1 FROM music_channels ch JOIN members m ON m.youtube_channel_id=ch.external_channel_id WHERE ch.id=${expression} AND ${selectedUid("m.uid")}) OR EXISTS(SELECT 1 FROM music_channels ch JOIN member_links ml ON ml.youtube_channel_id=ch.external_channel_id WHERE ch.id=${expression} AND ${selectedUid("ml.member_uid")})`;
const selectedPerformance = (expression: string) => `EXISTS(SELECT 1 FROM music_performance_participants p JOIN music_entities e ON e.id=p.entity_id WHERE p.performance_id=${expression} AND ${selectedUid("e.member_uid")})`;
const selectedHandle = (expression:string) => {
  const url="lower(trim(m.url_twitter))";
  const normalized=`iif(instr(${url},'://')>0,substr(${url},instr(${url},'://')+3),${url})`;
  // Match the existing X handle contract's direct/@ and accepted host forms,
  // including URL path/query suffixes; do not match a longer handle prefix.
  return `EXISTS(SELECT 1 FROM members m WHERE ${selectedUid("m.uid")} AND (${url}=lower(${expression}) OR ${url}='@'||lower(${expression}) OR EXISTS(SELECT 1 FROM json_each('["x.com","www.x.com","twitter.com","www.twitter.com"]') host WHERE substr(${normalized},1,length(host.value)+1+length(${expression}))=host.value||'/'||lower(${expression}) AND substr(${normalized},length(host.value)+length(${expression})+2,1) IN ('','/','?','#'))))`;
};
return {
  members: selectedUid("a.uid"),
  schedules: selectedUid("a.member_uid"), pending_schedules: selectedUid("a.member_uid"),
  schedule_broadcast_observations: selectedUid("a.member_uid"), schedule_candidate_rejections: selectedUid("a.member_uid"),
  schedule_day_assessments: selectedUid("a.member_uid"), update_logs: selectedUid("a.member_uid"),
  naver_cafe_sources: selectedUid("a.member_uid"), naver_cafe_posts: selectedUid("a.member_uid"),
  youtube_feed_sources: selectedUid("a.member_uid"),
  youtube_feed_videos: `EXISTS(SELECT 1 FROM youtube_feed_sources s WHERE s.id=a.source_id AND ${selectedUid("s.member_uid")})`,
  music_performances: selectedPerformance("a.id"),
  music_cover_proposals: `EXISTS(SELECT 1 FROM music_cover_proposal_participants p LEFT JOIN music_entities e ON e.id=p.resolved_entity_id WHERE p.proposal_id=a.id AND (${selectedUid("p.submitted_member_uid")} OR ${selectedUid("e.member_uid")}))`,
  music_channels: selectedChannel("a.id"),
  music_channel_upload_monitors: selectedChannel("a.channel_id"),
  music_ingestion_candidates: `(${selectedPerformance("a.linked_performance_id")}) OR EXISTS(SELECT 1 FROM music_channels ch WHERE ch.external_channel_id=a.channel_id AND (${selectedChannel("ch.id")})) OR EXISTS(SELECT 1 FROM json_tree(COALESCE(a.review_input_json,'null')) j WHERE j.key='memberUid' AND ${selectedUid("j.value")})`,
  notices: `${selectedUid("a.publisher_member_uid")} OR EXISTS(SELECT 1 FROM json_each(a.related_member_uids) j WHERE ${selectedUid("j.value")})`,
  x_post_facts: selectedUid("a.member_uid"),
  x_posts: `${selectedHandle("a.handle")} OR EXISTS(SELECT 1 FROM x_post_facts f WHERE f.post_id=a.id AND ${selectedUid("f.member_uid")})`,
  x_post_sources:selectedHandle("a.handle"),
};

}
