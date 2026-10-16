import type { PlayWorkCommand, PlayWorkDisposition, PlayWorkItem, PlayWorkQueue, PlayWorkQueueAction } from "@contracts/otw-play-work-queue";
import type { OtwPlayYouTubePlaylistSummary } from "../application/ports/youtube-metadata";
import { historicalReviewDeletedSql } from "./historical-review-sql";
import { publicationHiddenSql, publicationChannelHiddenSql } from '../../content-access';
import type {SiteId} from '@contracts/site-definition';
import { WorkQueueError, type WorkQueueBatchRecord, type WorkQueueMessage, type WorkQueueRepository, type WorkQueueSource } from "../application/ports/work-queue";

type Row = Record<string, string | number | null>;
// A shared video has one latest decision, while each playlist membership keeps its own progress slot.
const unavailableDecisionSql=(field:"disposition"|"reason")=>`SELECT d.${field} FROM music_playlist_work_items d JOIN music_playlist_work_batches db ON db.id=d.batch_id
  WHERE d.candidate_id IS NULL AND d.playlist_item_id=i.playlist_item_id AND db.queue_id=(SELECT queue_id FROM music_playlist_work_batches WHERE id=i.batch_id)
  ORDER BY d.updated_at DESC,d.rowid DESC LIMIT 1`;
const effectiveDispositionSql=`CASE WHEN i.candidate_id IS NULL THEN COALESCE((${unavailableDecisionSql("disposition")}),i.disposition) ELSE COALESCE(
  (SELECT d.disposition FROM music_playlist_work_items d WHERE d.candidate_id=i.candidate_id AND d.disposition!='duplicate' ORDER BY d.updated_at DESC,d.rowid DESC LIMIT 1),'pending') END`;
const outcomeSql=`CASE WHEN c.status='converted' OR c.classification='existing_catalog' THEN 'registered'
  WHEN c.status='ignored' OR (${effectiveDispositionSql})='excluded' THEN 'excluded'
  WHEN (${effectiveDispositionSql})='deferred' THEN 'deferred'
  WHEN c.status='ready' AND NOT EXISTS(SELECT 1 FROM music_cover_proposals p WHERE p.youtube_video_id=c.external_video_id AND p.status='pending_review' AND p.segment_start_seconds=0) THEN 'ready'
  ELSE 'pending' END`;
const latestDeferredSql=`(${outcomeSql})='deferred' AND NOT EXISTS(
  SELECT 1 FROM music_playlist_work_items n JOIN music_playlist_work_batches nb ON nb.id=n.batch_id WHERE nb.queue_id=b.queue_id
  AND (n.candidate_id=i.candidate_id OR (i.candidate_id IS NULL AND n.playlist_item_id=i.playlist_item_id))
  AND (n.updated_at>i.updated_at OR (n.updated_at=i.updated_at AND n.rowid>i.rowid)))`;
const sourceSql = `WITH memberships AS (
  SELECT b.queue_id,b.scan_generation,i.playlist_item_id,${outcomeSql} AS outcome,
  ROW_NUMBER() OVER(PARTITION BY b.queue_id,b.scan_generation,i.playlist_item_id ORDER BY b.created_at DESC,i.updated_at DESC,i.rowid DESC) AS rank
  FROM music_playlist_work_items i JOIN music_playlist_work_batches b ON b.id=i.batch_id LEFT JOIN music_ingestion_candidates c ON c.id=i.candidate_id
), counts AS (
  SELECT queue_id,scan_generation,count(*) AS inspected,
  SUM(outcome='registered') AS registered,SUM(outcome='excluded') AS excluded,SUM(outcome='deferred') AS deferred,SUM(outcome='ready') AS ready
  FROM memberships WHERE rank=1 GROUP BY queue_id,scan_generation
), deferredCounts AS (
  SELECT b.queue_id,count(*) AS deferred_count FROM music_playlist_work_items i JOIN music_playlist_work_batches b ON b.id=i.batch_id
  LEFT JOIN music_ingestion_candidates c ON c.id=i.candidate_id WHERE ${latestDeferredSql} GROUP BY b.queue_id
) SELECT q.*,COALESCE(p.inspected,0) AS inspected,COALESCE(p.registered,0) AS registered,COALESCE(p.excluded,0) AS excluded,COALESCE(p.deferred,0) AS deferred,COALESCE(p.ready,0) AS ready,COALESCE(d.deferred_count,0) AS deferred_count
  FROM music_playlist_work_queues q LEFT JOIN counts p ON p.queue_id=q.id AND p.scan_generation=q.scan_generation LEFT JOIN deferredCounts d ON d.queue_id=q.id`;
const itemSql = `SELECT i.*,b.queue_id,b.job_id,q.title AS playlist_title,c.version AS candidate_version,c.status AS candidate_status,c.candidate_kind,c.classification,c.external_video_id,c.title,c.metadata_checked_at,c.retention_expires_at,${outcomeSql} AS outcome,
  CASE WHEN i.candidate_id IS NULL THEN (${unavailableDecisionSql("reason")})
    WHEN c.classification='existing_catalog' THEN '기존 카탈로그' ELSE
    (SELECT d.reason FROM music_playlist_work_items d WHERE d.candidate_id=i.candidate_id AND d.disposition!='duplicate' ORDER BY d.updated_at DESC,d.rowid DESC LIMIT 1) END AS decision_reason,
  (SELECT a.status FROM music_ai_review_batch_items a WHERE a.candidate_id=i.candidate_id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS ai_status,
  (SELECT p.id FROM music_cover_proposals p WHERE p.youtube_video_id=c.external_video_id AND p.status='pending_review' AND p.segment_start_seconds=0 LIMIT 1) AS proposal_id
  FROM music_playlist_work_items i JOIN music_playlist_work_batches b ON b.id=i.batch_id
  JOIN music_playlist_work_queues q ON q.id=b.queue_id LEFT JOIN music_ingestion_candidates c ON c.id=i.candidate_id`;
const source = (r: Row): WorkQueueSource => ({ id: String(r.id), playlistId: String(r.playlist_id), url: String(r.source_url),
  title: r.title as string | null, itemCount: r.item_count === null ? null : Number(r.item_count), status: r.status as PlayWorkQueue["status"],
  errorMessage: r.error_message as string | null, version: Number(r.version), createdAt: Number(r.created_at),
  counts: { registered: Number(r.registered ?? 0), excluded: Number(r.excluded ?? 0), deferred: Number(r.deferred ?? 0), inspected: Number(r.inspected ?? 0) },
  deferredCount:Number(r.deferred_count ?? 0),
  progress: {scanGeneration:Number(r.scan_generation),total:r.scan_item_count === null ? null : Number(r.scan_item_count),checkedAt:r.scan_checked_at === null ? null : Number(r.scan_checked_at),
    registered:Number(r.registered),excluded:Number(r.excluded),deferred:Number(r.deferred),ready:Number(r.ready),inspected:Number(r.inspected),
    completed:Number(r.registered)+Number(r.excluded),remaining:r.scan_item_count === null ? null : Math.max(0,Number(r.scan_item_count)-Number(r.registered)-Number(r.excluded)),
    uncertain:Boolean(r.progress_uncertain) || r.scan_item_count === null || Number(r.inspected)>Number(r.scan_item_count)},
  pageToken: r.page_token as string | null, ownerChannelId: r.owner_channel_id as string | null, ownerChannelTitle: r.owner_channel_title as string | null,
  metadataCheckedAt: r.metadata_checked_at === null ? null : Number(r.metadata_checked_at), actor: String(r.actor) });
const record = (r: Row): WorkQueueBatchRecord => ({ id: String(r.id), queueId: String(r.queue_id), jobId: String(r.job_id),
  aiBatchId: r.ai_batch_id as string | null, actor: String(r.actor), status: r.status as WorkQueueBatchRecord["status"],
  pageToken: r.page_token as string | null, nextPageToken: r.next_page_token as string | null, pageRecorded: Boolean(r.page_recorded),
  scanGeneration:Number(r.scan_generation),
  version: Number(r.version), completionKey: r.completion_key as string | null, startNext: Boolean(r.start_next), nextBatchId: r.next_batch_id as string | null,
  errorMessage: r.error_message as string | null });
const item = (r: Row): PlayWorkItem => ({ id: String(r.id), batchId: String(r.batch_id), queueId: String(r.queue_id), jobId: String(r.job_id),
  playlistTitle: r.playlist_title as string | null, candidateId: r.candidate_id as string|null, candidateVersion: Number(r.candidate_version ?? 0),
  candidateKind: (r.candidate_kind ?? 'singing_clip') as PlayWorkItem["candidateKind"], candidateStatus: String(r.candidate_status ?? 'unavailable'), classification: String(r.classification ?? 'unavailable'),
  videoId: r.external_video_id as string|null, title: r.title as string | null, disposition: r.disposition as PlayWorkDisposition,
  playlistItemId:String(r.playlist_item_id),playlistPosition:r.playlist_position === null ? null : Number(r.playlist_position),outcome:r.outcome as PlayWorkItem['outcome'],
  reason: r.decision_reason as string | null, errorMessage: r.error_message as string | null, version: Number(r.version),
  aiStatus: r.ai_status as PlayWorkItem["aiStatus"], pendingProposalId: r.proposal_id as string | null,
  metadataExpiresAt:r.metadata_checked_at == null ? null : Math.min(Number(r.retention_expires_at),Number(r.metadata_checked_at)+30*86400000) });
const table = (m: WorkQueueMessage) => m.target === "queue" ? "music_playlist_work_queues" : "music_playlist_work_batches";

export class D1WorkQueueRepository implements WorkQueueRepository {
  private readonly db: D1Database;

  private readonly siteId:SiteId;
  constructor(db:D1Database,siteId:SiteId="otw") {this.db=db;this.siteId=siteId;}

  async add(id: string, playlistId: string, url: string, actor: string, now: number) {
    await this.db.batch([this.db.prepare(`INSERT OR IGNORE INTO music_playlist_work_queues(id,playlist_id,source_url,actor,created_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(id, playlistId, url, actor, now, now)]);
    const row = await this.db.prepare(`${sourceSql} WHERE q.playlist_id=?`).bind(playlistId).first<Row>();
    return source(row!);
  }
  async sources() { return (await this.db.prepare(`${sourceSql} ORDER BY q.created_at,q.id`).all<Row>()).results.map(source); }
  async source(id: string) {
    const row = await this.db.prepare(`${sourceSql} WHERE q.id=?`).bind(id).first<Row>();
    if (!row) throw new WorkQueueError("not_found", "플레이리스트 작업을 찾을 수 없습니다.", 404);
    return source(row);
  }
  async commandSource(id: string, action: Exclude<PlayWorkQueueAction,"start">, command: PlayWorkCommand, actor: string, now: number) {
    const version=command.expectedVersion,status=action === "archive" ? "archived" : "checking";
    const eventId=`playlist-work-command:${actor}:${command.idempotencyKey}`;
    const replay=async()=>{
      const event=await this.db.prepare("SELECT aggregate_id,detail_json FROM music_catalog_events WHERE id=? AND aggregate_type='playlist_work_queue'").bind(eventId).first<{aggregate_id:string;detail_json:string}>();
      if(!event)return false;
      const detail=JSON.parse(event.detail_json) as {action:string;expectedVersion:number};
      if(event.aggregate_id!==id || detail.action!==action || detail.expectedVersion!==version)throw new WorkQueueError("idempotency_conflict","다른 작업에 사용된 요청 키입니다.");
      return true;
    };
    if(await replay())return;
    const results = await this.db.batch([
      this.db.prepare(`UPDATE music_playlist_work_batches SET status='completed',start_next=0,version=version+1,updated_at=?
        WHERE queue_id=? AND status='preparing' AND page_recorded=0 AND error_message IS NOT NULL AND COALESCE(lease_until,0)<=?
        AND EXISTS(SELECT 1 FROM music_playlist_work_queues WHERE id=? AND version=?)
        AND NOT EXISTS(SELECT 1 FROM music_catalog_events WHERE id=?)`).bind(now,id,now,id,version,eventId),
      this.db.prepare(`UPDATE music_playlist_work_queues SET status=?,page_token=CASE WHEN ?='checking' THEN NULL ELSE page_token END,
      scan_generation=scan_generation+CASE WHEN ?='checking' AND EXISTS(SELECT 1 FROM music_playlist_work_batches WHERE queue_id=music_playlist_work_queues.id) THEN 1 ELSE 0 END,
      scan_item_count=CASE WHEN ?='checking' THEN NULL ELSE scan_item_count END,scan_checked_at=CASE WHEN ?='checking' THEN NULL ELSE scan_checked_at END,
      error_message=NULL,dispatch_until=NULL,version=version+1,updated_at=? WHERE id=? AND version=?
      AND NOT EXISTS(SELECT 1 FROM music_playlist_work_batches WHERE queue_id=? AND status!='completed')
      AND NOT EXISTS(SELECT 1 FROM music_catalog_events WHERE id=?)`).bind(status,status,status,status,status,now,id,version,id,eventId),
      this.db.prepare(`INSERT INTO music_catalog_events(id,aggregate_type,aggregate_id,event_type,actor_kind,actor_user_id,detail_json,created_at)
        SELECT ?,'playlist_work_queue',?,'work_queue.command','admin',?,?,? WHERE changes()=1`).bind(eventId,id,actor,JSON.stringify({action,expectedVersion:version}),now),
    ]);
    if (!results[1].meta.changes && !await replay()) throw new WorkQueueError("stale_write", "진행 중인 묶음을 먼저 처리하거나 최신 상태를 불러오세요.");
  }
  async saveSummary(id: string, token: string, s: OtwPlayYouTubePlaylistSummary, now: number) {
    await this.db.batch([this.db.prepare(`UPDATE music_playlist_work_queues SET title=?,owner_channel_id=?,owner_channel_title=?,item_count=?,metadata_checked_at=?,
      scan_item_count=?,scan_checked_at=?,progress_uncertain=0,
      status='waiting',error_message=NULL,version=version+1,updated_at=? WHERE id=? AND lease_token=? AND status='checking'`).bind(s.title,s.ownerChannelId,s.ownerChannelTitle,s.itemCount,now,s.itemCount,now,now,id,token)]);
  }
  async observeSummary(id:string,s:OtwPlayYouTubePlaylistSummary,now:number) {
    await this.db.batch([this.db.prepare(`UPDATE music_playlist_work_queues SET item_count=?,metadata_checked_at=?,progress_uncertain=CASE WHEN scan_item_count!=? OR scan_checked_at IS NULL THEN 1 ELSE progress_uncertain END WHERE id=?`).bind(s.itemCount,now,s.itemCount,id)]);
  }
  async reserve(id: string, queueId: string, actor: string, command: PlayWorkCommand, now: number) {
    const key = `${actor}:${command.idempotencyKey}`;
    const existing = await this.db.prepare("SELECT * FROM music_playlist_work_batches WHERE request_key=?").bind(key).first<Row>();
    if (existing) {
      if (existing.queue_id !== queueId) throw new WorkQueueError("idempotency_conflict", "다른 작업에 사용된 요청 키입니다.");
      return record(existing);
    }
    try {
      await this.db.batch([
        this.db.prepare(`UPDATE music_playlist_work_queues SET version=version+1,updated_at=? WHERE id=? AND version=? AND status='waiting'`).bind(now,queueId,command.expectedVersion),
        this.db.prepare(`INSERT INTO music_playlist_work_batches(id,queue_id,job_id,request_key,actor,page_token,scan_generation,created_at,updated_at)
          SELECT ?,q.id,?,?,?,q.page_token,q.scan_generation,?,? FROM music_playlist_work_queues q WHERE q.id=? AND changes()=1`).bind(id,`work-${id}`,key,actor,now,now,queueId),
      ]);
    } catch {
      const raced = await this.db.prepare("SELECT * FROM music_playlist_work_batches WHERE request_key=?").bind(key).first<Row>();
      if (raced && raced.queue_id === queueId) return record(raced);
      throw new WorkQueueError("active_batch", "현재 묶음을 완료하거나 이어서 검수해 주세요.");
    }
    const created = await this.db.prepare("SELECT * FROM music_playlist_work_batches WHERE request_key=?").bind(key).first<Row>();
    if (!created) throw new WorkQueueError("stale_write", "플레이리스트 상태가 변경되었습니다. 최신 상태를 확인하세요.");
    return record(created);
  }
  async active() {
    const row = await this.db.prepare("SELECT * FROM music_playlist_work_batches WHERE status!='completed'").first<Row>();
    return row ? record(row) : null;
  }
  async record(id: string) {
    const row = await this.db.prepare(`SELECT b.*,COALESCE(b.ai_batch_id,(SELECT a.id FROM music_ai_review_batches a WHERE a.request_key=b.actor||':work-'||b.id)) AS recovered_ai_batch_id FROM music_playlist_work_batches b WHERE b.id=?`).bind(id).first<Row>();
    if (!row) throw new WorkQueueError("not_found", "작업 묶음을 찾을 수 없습니다.", 404);
    return record({...row,ai_batch_id:row.recovered_ai_batch_id});
  }
  async byJob(jobId: string) {
    const row = await this.db.prepare("SELECT * FROM music_playlist_work_batches WHERE job_id=?").bind(jobId).first<Row>();
    return row ? record(row) : null;
  }
  async items(id: string) { return (await this.db.prepare(`${itemSql} WHERE i.batch_id=? ORDER BY i.playlist_position,i.id`).bind(id).all<Row>()).results.map(item); }
  async deferred(cursor = "",queueId?:string) {
    const rows = (await this.db.prepare(`${itemSql} WHERE ${latestDeferredSql} AND i.id>? AND (? IS NULL OR b.queue_id=?)
      ORDER BY i.id LIMIT 51`).bind(cursor,queueId ?? null,queueId ?? null).all<Row>()).results;
    return { items: rows.slice(0,50).map(item), cursor: rows.length>50 ? String(rows[49].id) : null };
  }
  async snapshot(id: string, now: number) {
    const blocked=`(c.content_access='admin_archive' OR ${publicationHiddenSql('music_ingestion_candidates','c',this.siteId)} OR ${publicationChannelHiddenSql('c.channel_id',this.siteId)} OR EXISTS(SELECT 1 FROM music_ingestion_events response,json_each(response.detail_json,'$.observations') observed WHERE response.job_id=b.job_id AND response.event_type='ingestion.response' AND json_extract(observed.value,'$.videoId')=c.external_video_id AND ${publicationChannelHiddenSql("json_extract(observed.value,'$.video.channelId')",this.siteId)}))`;
    await this.db.batch([this.db.prepare(`INSERT OR IGNORE INTO music_playlist_work_items(id,batch_id,candidate_id,playlist_item_id,playlist_position,disposition,reason,created_at,updated_at)
      SELECT o.id,b.id,o.candidate_id,o.playlist_item_id,o.playlist_position,
        CASE WHEN ${blocked} THEN 'excluded' WHEN o.is_playlist_duplicate=1 OR c.classification='existing_catalog' OR EXISTS(SELECT 1 FROM music_catalog_events e WHERE e.aggregate_type='review_candidate' AND e.aggregate_id=c.id AND e.event_type='review_item.deleted') OR ${historicalReviewDeletedSql("review_candidate","c.id")} THEN 'duplicate'
          ELSE COALESCE((SELECT prior.disposition FROM music_playlist_work_items prior WHERE prior.candidate_id=c.id AND prior.batch_id!=b.id AND prior.disposition!='duplicate' ORDER BY prior.updated_at DESC,prior.rowid DESC LIMIT 1),'pending') END,
        CASE WHEN ${blocked} THEN 'publication_cutoff' WHEN o.is_playlist_duplicate=1 THEN '플레이리스트 내 중복' WHEN c.classification='existing_catalog' THEN '기존 카탈로그'
          ELSE (SELECT prior.reason FROM music_playlist_work_items prior WHERE prior.candidate_id=c.id AND prior.batch_id!=b.id AND prior.disposition!='duplicate' ORDER BY prior.updated_at DESC,prior.rowid DESC LIMIT 1) END,?,?
      FROM music_playlist_work_batches b JOIN music_ingestion_candidate_origins o ON o.job_id=b.job_id JOIN music_ingestion_candidates c ON c.id=o.candidate_id WHERE b.id=?`).bind(now,now,id)]);
  }
  async reviewed(id: string, token: string, aiId: string | null, now: number) {
    await this.db.batch([this.db.prepare(`UPDATE music_playlist_work_batches SET status='review',ai_batch_id=?,error_message=NULL,version=version+1,updated_at=? WHERE id=? AND lease_token=? AND status='preparing'`).bind(aiId,now,id,token)]);
  }
  async disposition(id: string, version: number, value: PlayWorkDisposition, reason: string | null, actor: string, now: number) {
    const current = await this.db.prepare("SELECT i.*,b.job_id,b.status FROM music_playlist_work_items i JOIN music_playlist_work_batches b ON b.id=i.batch_id WHERE i.id=?").bind(id).first<Row>();
    if (!current || current.status === "completing") throw new WorkQueueError("stale_write", "등록 중인 항목은 변경할 수 없습니다.");
    const results=await this.db.batch([
      this.db.prepare(`UPDATE music_playlist_work_items SET disposition=?,reason=?,error_message=NULL,version=version+1,updated_at=MAX(updated_at+1,?) WHERE id=? AND version=?
        AND EXISTS(SELECT 1 FROM music_playlist_work_batches b WHERE b.id=music_playlist_work_items.batch_id AND b.status!='completing')
        AND NOT EXISTS(SELECT 1 FROM music_playlist_work_items shared JOIN music_playlist_work_batches b ON b.id=shared.batch_id
          WHERE b.status='completing' AND (shared.candidate_id=music_playlist_work_items.candidate_id OR
            (music_playlist_work_items.candidate_id IS NULL AND shared.candidate_id IS NULL AND shared.playlist_item_id=music_playlist_work_items.playlist_item_id
              AND b.queue_id=(SELECT queue_id FROM music_playlist_work_batches WHERE id=music_playlist_work_items.batch_id))))`).bind(value,reason,now,id,version),
      this.db.prepare(`INSERT INTO music_ingestion_events(id,job_id,candidate_id,event_type,actor_user_id,detail_json,created_at)
        SELECT ?,?,?, 'work_item.disposition',?,?,? WHERE changes()=1`).bind(`${id}:disposition:${version}`,current.job_id,current.candidate_id,actor,JSON.stringify({ disposition:value,reason }),now),
    ]);
    if (!results[0].meta.changes) throw new WorkQueueError("stale_write", "항목이 변경되었습니다. 최신 상태를 확인하세요.");
  }
  async beginCompletion(id: string, actor: string, c: PlayWorkCommand & { startNext: boolean }, now: number) {
    const b = await this.record(id), key = `${actor}:${c.idempotencyKey}`;
    if (b.completionKey === key && b.startNext === c.startNext) return;
    if (b.completionKey === key) throw new WorkQueueError("idempotency_conflict", "완료 요청의 다음 작업 설정이 변경되었습니다.");
    const [result] = await this.db.batch([this.db.prepare(`UPDATE music_playlist_work_batches SET status='completing',completion_key=?,start_next=?,actor=?,error_message=NULL,dispatch_until=NULL,version=version+1,updated_at=?
      WHERE id=? AND version=? AND status='review'`).bind(key,Number(c.startNext),actor,now,id,c.expectedVersion)]);
    if (!result.meta.changes) throw new WorkQueueError("stale_write", "현재 묶음의 최신 상태를 확인하세요.");
  }
  async itemError(id: string, message: string | null, now: number) { await this.db.batch([this.db.prepare("UPDATE music_playlist_work_items SET error_message=?,updated_at=? WHERE id=?").bind(message,now,id)]); }
  async close(id: string, token: string, now: number) {
    const results=await this.db.batch([
      this.db.prepare(`UPDATE music_playlist_work_queues SET page_token=(SELECT next_page_token FROM music_playlist_work_batches WHERE id=?),
        status=CASE WHEN (SELECT next_page_token FROM music_playlist_work_batches WHERE id=?) IS NULL THEN 'exhausted' ELSE 'waiting' END,
        version=version+1,updated_at=? WHERE id=(SELECT queue_id FROM music_playlist_work_batches WHERE id=? AND lease_token=? AND status='completing')
        AND NOT EXISTS(SELECT 1 FROM music_playlist_work_items i LEFT JOIN music_ingestion_candidates c ON c.id=i.candidate_id WHERE i.batch_id=? AND (${outcomeSql}) IN ('pending','ready'))`).bind(id,id,now,id,token,id),
      this.db.prepare(`UPDATE music_playlist_work_batches SET status='completed',error_message=NULL,version=version+1,updated_at=? WHERE id=? AND lease_token=? AND status='completing' AND changes()=1`).bind(now,id,token),
    ]);
    if (!results[1].meta.changes) throw new WorkQueueError("stale_write","등록 결과가 변경되었습니다. 현재 묶음을 다시 확인하세요.");
  }
  async linkNext(id: string, nextId: string, now: number) { await this.db.batch([this.db.prepare("UPDATE music_playlist_work_batches SET next_batch_id=?,updated_at=? WHERE id=? AND next_batch_id IS NULL").bind(nextId,now,id)]); }
  async nextSource() { const row=await this.db.prepare(`${sourceSql} WHERE q.status='waiting' ORDER BY q.created_at,q.id LIMIT 1`).first<Row>(); return row ? source(row) : null; }
  async claim(m: WorkQueueMessage, token: string, now: number) {
    const condition=m.target === "queue" ? "status='checking'" : "(status IN ('preparing','completing') OR (status='completed' AND start_next=1 AND next_batch_id IS NULL))";
    const [result] = await this.db.batch([this.db.prepare(`UPDATE ${table(m)} SET lease_token=?,lease_until=? WHERE id=? AND ${condition} AND (lease_until IS NULL OR lease_until<=?) AND error_message IS NULL`).bind(token,now+300000,m.id,now)]);
    return Boolean(result.meta.changes);
  }
  async release(m: WorkQueueMessage, token: string, now: number) { await this.db.batch([this.db.prepare(`UPDATE ${table(m)} SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(now,m.id,token)]); }
  async failed(m: WorkQueueMessage, token: string, message: string, now: number) {
    await this.db.batch([this.db.prepare(`UPDATE ${table(m)} SET error_message=?,${m.target === "queue" ? "status='failed'," : ""}version=version+1,updated_at=? WHERE id=? AND lease_token=?${m.target === "queue" ? " AND status='checking'" : ""}`).bind(message,now,m.id,token)]);
  }
  async retryBatch(id: string, command: PlayWorkCommand, actor: string, now: number) {
    const eventId=`playlist-work-batch-command:${actor}:${command.idempotencyKey}`;
    const replay=async()=>{
      const event=await this.db.prepare("SELECT aggregate_id,detail_json FROM music_catalog_events WHERE id=? AND aggregate_type='playlist_work_batch'").bind(eventId).first<{aggregate_id:string;detail_json:string}>();
      if(!event)return false;
      if(event.aggregate_id!==id || JSON.parse(event.detail_json).expectedVersion!==command.expectedVersion)throw new WorkQueueError("idempotency_conflict","다른 작업에 사용된 요청 키입니다.");
      return true;
    };
    if(await replay())return;
    const results=await this.db.batch([
      this.db.prepare(`UPDATE music_playlist_work_batches SET status=CASE WHEN status='completing' THEN 'review' ELSE status END,completion_key=NULL,start_next=0,error_message=NULL,dispatch_until=NULL,version=version+1,updated_at=?
        WHERE id=? AND version=? AND status!='completed' AND (lease_until IS NULL OR lease_until<=?)
        AND NOT EXISTS(SELECT 1 FROM music_catalog_events WHERE id=?)`).bind(now,id,command.expectedVersion,now,eventId),
      this.db.prepare(`INSERT INTO music_catalog_events(id,aggregate_type,aggregate_id,event_type,actor_kind,actor_user_id,detail_json,created_at)
        SELECT ?,'playlist_work_batch',?,'work_batch.retry','admin',?,?,? WHERE changes()=1`).bind(eventId,id,actor,JSON.stringify({expectedVersion:command.expectedVersion}),now),
    ]);
    if (!results[0].meta.changes && !await replay()) throw new WorkQueueError("stale_write", "최신 묶음 상태를 확인하세요.");
  }
  async pending(now: number) {
    const rows=(await this.db.prepare(`SELECT 'queue' AS target,id FROM music_playlist_work_queues WHERE status='checking' AND error_message IS NULL AND COALESCE(dispatch_until,0)<=? AND COALESCE(lease_until,0)<=?
      UNION ALL SELECT 'batch',id FROM music_playlist_work_batches WHERE (status IN ('preparing','completing') OR (status='completed' AND start_next=1 AND next_batch_id IS NULL)) AND error_message IS NULL AND COALESCE(dispatch_until,0)<=? AND COALESCE(lease_until,0)<=? LIMIT 20`).bind(now,now,now,now).all<{ target:WorkQueueMessage["target"]; id:string }>()).results;
    return rows.map(r=>({kind:"otw_play_work_queue" as const,schemaVersion:1 as const,...r}));
  }
  async dispatched(m: WorkQueueMessage, now: number) { await this.db.batch([this.db.prepare(`UPDATE ${table(m)} SET dispatch_until=? WHERE id=?`).bind(now+60000,m.id)]); }
  async clearExpired(now: number) { await this.db.batch([this.db.prepare("UPDATE music_playlist_work_queues SET title=NULL,owner_channel_title=NULL,item_count=NULL,metadata_checked_at=NULL,scan_item_count=NULL,scan_checked_at=NULL,progress_uncertain=1 WHERE metadata_checked_at<=?").bind(now-30*86400000)]); }
  async hasExpired(now: number) { return Boolean(await this.db.prepare("SELECT id FROM music_playlist_work_queues WHERE metadata_checked_at<=? LIMIT 1").bind(now-30*86400000).first()); }
  async hasRecoveryWork(now: number, allowCollection: boolean) {
    return Boolean(await this.db.prepare(`SELECT id FROM music_playlist_work_batches WHERE (status='completing' OR (status='completed' AND start_next=1 AND next_batch_id IS NULL) OR (?=1 AND status='preparing'))
      AND error_message IS NULL AND COALESCE(dispatch_until,0)<=? AND COALESCE(lease_until,0)<=?
      UNION ALL SELECT id FROM music_playlist_work_queues WHERE ?=1 AND status='checking' AND error_message IS NULL AND COALESCE(dispatch_until,0)<=? AND COALESCE(lease_until,0)<=? LIMIT 1`).bind(Number(allowCollection),now,now,Number(allowCollection),now,now).first());
  }
}
