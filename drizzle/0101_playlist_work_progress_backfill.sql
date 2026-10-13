-- Preserve existing work and isolate historical rescans without asserting an exact old snapshot.
WITH generations AS (
  SELECT id,MAX(1,SUM(page_token IS NULL) OVER(PARTITION BY queue_id ORDER BY created_at,id ROWS UNBOUNDED PRECEDING)) AS generation
  FROM music_playlist_work_batches
)
UPDATE music_playlist_work_batches SET scan_generation=(SELECT generation FROM generations WHERE generations.id=music_playlist_work_batches.id);
--> statement-breakpoint
UPDATE music_playlist_work_queues SET
  scan_generation=COALESCE((SELECT MAX(scan_generation) FROM music_playlist_work_batches WHERE queue_id=music_playlist_work_queues.id),1),
  scan_item_count=item_count,scan_checked_at=metadata_checked_at,progress_uncertain=1;
