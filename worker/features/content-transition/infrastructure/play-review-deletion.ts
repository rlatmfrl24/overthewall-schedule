import type {ReviewDeletion} from '../../otw-play/commands';

export function reviewDeletionTable(command:ReviewDeletion) {return command.kind==='candidate'?'music_ingestion_candidates':'music_cover_proposals';}
/** These are the original inbox deletion predicates. Its live event remains
 * the owning receipt; historical imported deletion evidence is also respected. */
export function reviewDeletionPredicate(command:ReviewDeletion) {
  const table=reviewDeletionTable(command),aggregate=command.kind==='candidate'?'review_candidate':'review_proposal';
  const guard=command.kind==='candidate'?`NOT EXISTS(SELECT 1 FROM music_cover_proposals p WHERE p.youtube_video_id=item.external_video_id AND p.status='pending_review' AND p.segment_start_seconds=0 AND item.status NOT IN ('converted','ignored'))`:"item.status IN ('approved','rejected','withdrawn')";
  return {sql:`EXISTS(SELECT 1 FROM ${table} item WHERE item.id=? AND item.version=? AND item.content_access='normal' AND ${guard}
    AND NOT EXISTS(SELECT 1 FROM music_catalog_events e WHERE e.aggregate_type='${aggregate}' AND e.aggregate_id=item.id AND e.event_type='review_item.deleted')
    AND NOT EXISTS(SELECT 1 FROM content_historical_records r JOIN content_historical_links l USING(source_site,source_table,source_key)
      WHERE l.subject_table='${table}' AND l.subject_key=json_array(item.id) AND r.source_table='music_catalog_events'
        AND json_extract(r.record_json,'$.values.aggregate_type')='${aggregate}' AND json_extract(r.record_json,'$.values.event_type')='review_item.deleted'))`,bindings:[command.id,command.expectedVersion]};
}
