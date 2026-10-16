/** Explicit historical edges; values are opaque record mappings, never runnable IDs. */
export const historicalReferences:Readonly<Record<string,Readonly<Record<string,string>>>>={
  music_ingestion_candidate_origins:{job_id:"music_ingestion_jobs"},
  music_ingestion_events:{job_id:"music_ingestion_jobs"},
  music_ai_review_attempts:{review_id:"music_ai_reviews"},
  music_ai_review_requests:{review_id:"music_ai_reviews"},
  music_ai_review_batch_items:{batch_id:"music_ai_review_batches",review_id:"music_ai_reviews"},
  music_playlist_work_items:{batch_id:"music_playlist_work_batches"},
  music_playlist_work_batches:{queue_id:"music_playlist_work_queues",job_id:"music_ingestion_jobs",ai_batch_id:"music_ai_review_batches",next_batch_id:"music_playlist_work_batches"},
};
