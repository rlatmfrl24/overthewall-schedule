import type { HistoricalContentMaterial } from "../../../../contracts/content-transition";
import { assertProjectedRecord, type ProjectedRecord } from "./projected-content";

const historicalKinds: Record<string,HistoricalContentMaterial["kind"]> = {
  music_ingestion_candidate_origins:"origin", music_catalog_events:"event", music_ingestion_events:"event",
  music_ai_reviews:"review", music_ai_review_attempts:"attempt", music_ai_review_requests:"review",
  music_ai_review_batches:"batch", music_ai_review_batch_items:"batch", music_ingestion_jobs:"job",
  music_playlist_work_queues:"work", music_playlist_work_batches:"work", music_playlist_work_items:"work",
  music_channel_automation_approvals:"approval",
};
export function historicalMaterial(record: ProjectedRecord): HistoricalContentMaterial {
  assertProjectedRecord(record);
  const kind = historicalKinds[record.table];
  if (record.destination!=="historical" || !kind) throw new Error("Not a historical content projection");
  return {sourceSite:record.sourceSite,sourceRecordId:record.sourceRecordId,sourceTable:record.table,kind,values:record.value};
}
