/** The original rejection predicate is status + version. Review leases and
 * unrelated catalog parents do not invent additional ownership/preconditions. */
export const proposalRejectionPredicate="EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=? AND version=? AND status='pending_review' AND content_access='normal')";

const fields:Record<string,string>={
  id:"p.id",contentAccess:"p.content_access",submittedByUserId:"p.submitted_by_user_id",
  historicalProvenance:"json(CASE WHEN p.historical_source_site IS NOT NULL AND p.historical_source_record_id IS NOT NULL THEN json_object('sourceSite',p.historical_source_site,'sourceRecordId',p.historical_source_record_id) ELSE 'null' END)",
  historicalReview:"json(iif(p.historical_review,'true','false'))",
  historicalMaterials:`json((WITH RECURSIVE history(source_site,source_table,source_key) AS (
    SELECT source_site,source_table,source_key FROM content_historical_links WHERE subject_table='music_cover_proposals' AND subject_key=json_array(p.id)
    UNION SELECT h.source_site,e.to_table,e.to_key FROM history h JOIN content_historical_relations e ON e.source_site=h.source_site AND e.from_table=h.source_table AND e.from_key=h.source_key
  ) SELECT coalesce(json_group_array(json(record_json)),'[]') FROM (SELECT r.record_json FROM history h JOIN content_historical_records r USING(source_site,source_table,source_key) ORDER BY r.source_table,r.source_key)))`,
  submittedUrl:"p.submitted_url",youtubeVideoId:"p.youtube_video_id",segmentStartSeconds:"p.segment_start_seconds",submittedTitle:"p.submitted_title",submissionKind:"p.submission_kind",
  broadcastJson:"p.submitted_broadcast_json",suggestedSongId:"p.suggested_song_id",tags:"json(p.submitted_tags_json)",submittedNote:"p.submitted_note",
  status:"p.status",version:"p.version",reviewedByUserId:"p.reviewed_by_user_id",reviewedAt:"p.reviewed_at",reviewResultCode:"p.review_result_code",reviewNote:"p.review_note",approvedPerformanceId:"p.approved_performance_id",
  approvedPerformanceDeleted:"json(iif(p.approved_performance_snapshot_json IS NOT NULL,'true','false'))",createdAt:"p.created_at",
  participants:`json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object('creditOrder',credit_order,'resolvedEntityId',resolved_entity_id,'submittedMemberUid',submitted_member_uid,'submittedNameSnapshot',submitted_name_snapshot,'participantRole',participant_role) value FROM music_cover_proposal_participants WHERE proposal_id=p.id ORDER BY credit_order)))`,
  originalArtists:`json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object('creditOrder',credit_order,'resolvedEntityId',resolved_entity_id,'submittedMemberUid',submitted_member_uid,'submittedNameSnapshot',submitted_name_snapshot) value FROM music_cover_proposal_original_artists WHERE proposal_id=p.id ORDER BY credit_order)))`,
};
let proposal="'{}'";
const entries=Object.entries(fields);
for(let i=0;i<entries.length;i+=15) proposal=`json_set(${proposal},${entries.slice(i,i+15).flatMap(([key,value])=>[`'$.${key}'`,value]).join(",")})`;
export const proposalRejectionResultSql=`(SELECT json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json(${proposal})) FROM music_cover_proposals p WHERE p.id=?)`;
