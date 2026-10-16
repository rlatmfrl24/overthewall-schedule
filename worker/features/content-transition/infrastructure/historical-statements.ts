import { historicalMaterial } from "../domain/historical-material";
import type { ProjectedRecord } from "../domain/projected-content";
import { historicalReferences } from "../domain/historical-references";

/** Composes into the import/replay transaction; it cannot run or arm a job. */
export function historicalStatements(db: D1Database, record: ProjectedRecord, subjects: readonly {table:"music_ingestion_candidates"|"music_cover_proposals"|"music_performances";key:string}[]): D1PreparedStatement[] {
  const material = historicalMaterial(record);
  const references=Object.entries(historicalReferences[record.table]??{}).flatMap(([column,target])=>{
    const key=record.value[column];
    if(typeof key!=="string") return [];
    const reverse=["music_ai_review_attempts","music_ai_review_requests"].includes(record.table);
    return [db.prepare("INSERT OR IGNORE INTO content_historical_relations(source_site,from_table,from_key,to_table,to_key) VALUES(?,?,?,?,?)").bind(record.sourceSite,reverse?target:record.table,reverse?key:record.sourceRecordId,reverse?record.table:target,reverse?record.sourceRecordId:key)];
  });
  return [
    db.prepare("INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) VALUES(?,?,?,?,?) ON CONFLICT(source_site,source_table,source_key) DO UPDATE SET record_json=excluded.record_json WHERE content_historical_records.protocol=excluded.protocol")
      .bind(record.sourceSite,record.table,record.sourceRecordId,JSON.stringify(material),record.version),
    ...subjects.map(subject=>db.prepare("INSERT OR IGNORE INTO content_historical_links(source_site,source_table,source_key,subject_table,subject_key) VALUES(?,?,?,?,?)").bind(record.sourceSite,record.table,record.sourceRecordId,subject.table,subject.key)),
    ...references,
  ];
}
