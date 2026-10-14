/** Inbox deletion survives transfer as read-only evidence, without recreating
 * a source admin event or attributing it to a target account. Arguments are
 * fixed repository SQL expressions, never request input. */
export function historicalReviewDeletedSql(aggregate: "review_candidate" | "review_proposal", id: string): string {
  const table=aggregate==="review_candidate"?"music_ingestion_candidates":"music_cover_proposals";
  return `EXISTS(SELECT 1 FROM content_historical_links h JOIN content_historical_records r
    ON r.source_site=h.source_site AND r.source_table=h.source_table AND r.source_key=h.source_key
    WHERE h.subject_table='${table}' AND h.subject_key=json_array(${id}) AND h.source_table='music_catalog_events'
      AND json_extract(r.record_json,'$.values.event_type')='review_item.deleted'
      AND json_extract(r.record_json,'$.values.aggregate_type')='${aggregate}')`;
}
