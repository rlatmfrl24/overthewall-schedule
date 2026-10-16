/** Version 1 references embedded in known business JSON. These are content
 * identities, never an actor, lease, dispatch or provider-execution identity. */
export const contentJsonReferences = [
  {table:"music_ingestion_candidates",columns:["review_input_json"],keys:["songId"],target:"music_songs"},
  {table:"music_ingestion_candidates",columns:["review_input_json"],keys:["entityId"],target:"music_entities"},
  {table:"music_cover_proposals",columns:["approved_performance_snapshot_json"],keys:["songId"],target:"music_songs"},
  {table:"music_cover_proposals",columns:["approved_performance_snapshot_json"],keys:["performanceId"],target:"music_performances"},
  {table:"music_cover_proposals",columns:["approved_performance_snapshot_json"],keys:["sourceId"],target:"music_media_sources"},
  {table:"music_ai_reviews",columns:["result_json"],keys:["existingSongId"],target:"music_songs"},
  {table:"music_ai_reviews",columns:["result_json"],keys:["entityId"],target:"music_entities"},
  {table:"music_ai_review_batch_items",columns:["result_json"],keys:["existingSongId"],target:"music_songs"},
  {table:"music_ai_review_batch_items",columns:["result_json"],keys:["entityId"],target:"music_entities"},
  ...([
    ["songId","music_songs"],["entityId","music_entities"],["performanceId","music_performances"],
    ["proposalId","music_cover_proposals"],["candidateId","music_ingestion_candidates"],["sourceId","music_media_sources"],
  ] as const).map(([key,target])=>({table:"music_catalog_events" as const,columns:["before_json","after_json","detail_json"],keys:[key],target})),
  {table:"music_ingestion_events",columns:["detail_json"],keys:["songId"],target:"music_songs"},
  {table:"music_ingestion_events",columns:["detail_json"],keys:["entityId"],target:"music_entities"},
  {table:"music_ingestion_events",columns:["detail_json"],keys:["performanceId","linkedPerformanceId"],target:"music_performances"},
] as const;
