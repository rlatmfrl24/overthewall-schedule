import type { HistoricalContentMaterial } from "@contracts/content-transition";

export async function readHistoricalMaterials(db:D1Database,table:"music_ingestion_candidates"|"music_cover_proposals",ids:readonly string[]):Promise<Map<string,HistoricalContentMaterial[]>> {
  const result=new Map<string,HistoricalContentMaterial[]>();
  for(let offset=0;offset<ids.length;offset+=50) {
    const page=ids.slice(offset,offset+50);
    const rows=(await db.prepare(`WITH RECURSIVE history(source_site,source_table,source_key,subject_key) AS (
      SELECT source_site,source_table,source_key,subject_key FROM content_historical_links WHERE subject_table=? AND subject_key IN (${page.map(()=>"?").join(",")})
      UNION SELECT h.source_site,edge.to_table,edge.to_key,h.subject_key FROM history h JOIN content_historical_relations edge ON edge.source_site=h.source_site AND edge.from_table=h.source_table AND edge.from_key=h.source_key
    ) SELECT l.subject_key,r.record_json FROM history l JOIN content_historical_records r
      ON r.source_site=l.source_site AND r.source_table=l.source_table AND r.source_key=l.source_key
      ORDER BY l.subject_key,r.source_table,r.source_key`).bind(table,...page.map(id=>JSON.stringify([id]))).all<{subject_key:string;record_json:string}>()).results;
    for(const row of rows) {
      const id=JSON.parse(row.subject_key)[0] as string;
      result.set(id,[...(result.get(id)??[]),JSON.parse(row.record_json)]);
    }
  }
  return result;
}
