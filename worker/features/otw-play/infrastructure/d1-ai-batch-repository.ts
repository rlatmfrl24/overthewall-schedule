import type { AiBatchDraft, AiBatchItem, AiBatchSelection, AiBatchSummary } from "@contracts/otw-play-ai-batch";
import { playlistAiRequestKey } from "@contracts/otw-play-ai-batch";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";
import type { AiBatchRepository, AiBatchRetryCommand, AiBatchWork } from "../application/ports/ai-batch";
import { AiReviewError } from "../application/ports/ai-review";
import { historicalReviewDeletedSql } from "./historical-review-sql";

type Row = Record<string, string | number | null>;
const pending = "('queued','analyzing','saving')";
const eligible = `c.status IN ('discovered','needs_input','blocked') AND c.availability_status='playable'
  AND c.linked_performance_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM music_catalog_events deleted WHERE deleted.aggregate_type='review_candidate' AND deleted.aggregate_id=c.id AND deleted.event_type='review_item.deleted')
  AND NOT ${historicalReviewDeletedSql("review_candidate","c.id")}
  AND NOT EXISTS (SELECT 1 FROM music_cover_proposals p WHERE p.youtube_video_id=c.external_video_id AND p.status='pending_review' AND p.segment_start_seconds=0)`;
const current = `${eligible} AND c.version=i.candidate_version AND c.candidate_kind=i.candidate_kind`;
const sameRevision = (item: string) => `${item}.candidate_id=c.id AND ${item}.candidate_version=c.version
  AND ${item}.candidate_kind=c.candidate_kind`;
export const aiDraftOrder = `(i.status IN ${pending}) DESC, (${sameRevision("i")}) DESC,
  i.created_at DESC, i.id DESC`;
const batchScope = (batchId: string) => `
  SELECT i.id FROM music_ai_review_batch_items i
  JOIN music_ai_review_batches b ON b.id=i.batch_id
  WHERE b.id=${batchId} AND NOT EXISTS (SELECT 1 FROM music_ingestion_candidate_origins o
    WHERE o.job_id=json_extract(b.selection_json,'$.importJobId') AND o.candidate_id=i.candidate_id)
  UNION
  SELECT (SELECT i.id FROM music_ai_review_batch_items i
    JOIN music_ingestion_candidates c ON c.id=i.candidate_id
    WHERE i.candidate_id=o.candidate_id AND (${sameRevision("i")} OR i.status IN ${pending} OR i.batch_id=b.id)
    ORDER BY ${aiDraftOrder} LIMIT 1)
  FROM music_ai_review_batches b
  JOIN music_ingestion_candidate_origins o ON o.job_id=json_extract(b.selection_json,'$.importJobId')
  JOIN music_ingestion_candidates candidate ON candidate.id=o.candidate_id
  WHERE b.id=${batchId} AND candidate.content_access='normal'`;
const decode = (r: Row): AiBatchItem => ({ id: String(r.id), batchId: String(r.batch_id), candidateId: String(r.candidate_id),
  candidateVersion: Number(r.candidate_version), candidateKind: r.candidate_kind as AiBatchItem["candidateKind"],
  title: r.title as string | null, status: r.status as AiBatchItem["status"], errorMessage: r.error_message as string | null,
  jobId: r.job_id as string | null ?? null, candidateStatus: r.candidate_status as string | null ?? null });
const historicalPlaylistOrigin = `EXISTS(SELECT 1 FROM content_historical_links h WHERE h.subject_table='music_ingestion_candidates'
  AND h.subject_key=json_array(c.id) AND h.source_table='music_ingestion_candidate_origins')`;
function selectionSql(selection: AiBatchSelection) {
  const bindings: (string | number)[] = [];
  let where = eligible;
  if ("candidates" in selection) {
    where += " AND EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=c.id AND json_extract(j.value,'$.version')=c.version)";
    bindings.push(JSON.stringify(selection.candidates));
    where += ` AND (EXISTS (SELECT 1 FROM music_ingestion_candidate_origins o WHERE o.candidate_id=c.id)
      OR EXISTS (SELECT 1 FROM music_channel_upload_candidate_origins o WHERE o.candidate_id=c.id) OR ${historicalPlaylistOrigin})`;
  } else if ("importJobId" in selection) {
    where += ` AND c.content_access='normal'
      AND c.id IN (SELECT o.candidate_id FROM music_ingestion_candidate_origins o WHERE o.job_id=?)
      AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items d WHERE ${sameRevision("d")})`;
    bindings.push(selection.importJobId);
  } else {
    where += " AND NOT EXISTS (SELECT 1 FROM music_playlist_work_items wi WHERE wi.candidate_id=c.id)";
    const f = selection.filters;
    where += f.source === "automatic"
      ? " AND EXISTS (SELECT 1 FROM music_channel_upload_candidate_origins o WHERE o.candidate_id=c.id)"
      : ` AND (EXISTS (SELECT 1 FROM music_ingestion_candidate_origins o WHERE o.candidate_id=c.id${f.jobId ? " AND o.job_id=?" : ""})${f.jobId ? "" : ` OR ${historicalPlaylistOrigin}`})`;
    if (f.source === "playlist" && f.jobId) bindings.push(f.jobId);
    if (f.candidateKind) { where += " AND c.candidate_kind=?"; bindings.push(f.candidateKind); }
  }
  where += ` AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items i WHERE i.candidate_id=c.id AND i.status IN ${pending})`;
  return { where, bindings };
}
export class D1AiBatchRepository implements AiBatchRepository {
  private readonly db: D1Database;

  constructor(db:D1Database) {this.db=db;}

  async hasUnbatchedImportItems(importJobId: string, batchId: string) {
    const { where, bindings } = selectionSql({ importJobId });
    return Boolean(await this.db.prepare(`SELECT 1 FROM music_ingestion_candidates c WHERE ${where}
      AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items i WHERE i.batch_id = ? AND i.candidate_id = c.id)
      LIMIT 1`).bind(...bindings, batchId).first());
  }

  async hasPendingImportItems(importJobId: string, batchId: string | null) {
    return Boolean(await this.db.prepare(`SELECT 1 FROM music_ai_review_batch_items i WHERE i.status IN ${pending}
      AND (i.batch_id=? OR EXISTS (
        SELECT 1 FROM music_ingestion_candidates c
        JOIN music_ingestion_candidate_origins o ON o.candidate_id=c.id AND o.job_id=?
        WHERE c.id=i.candidate_id AND c.content_access='normal'
      )) LIMIT 1`).bind(batchId, importJobId).first());
  }

  async preview(selection: AiBatchSelection) {
    const { where, bindings } = selectionSql(selection);
    const r = await this.db.prepare(`SELECT count(*) AS n FROM music_ingestion_candidates c WHERE ${where}`).bind(...bindings).first<{ n: number }>();
    return r!.n;
  }
  async create(id: string, actor: string, key: string, selection: AiBatchSelection, now: number) {
    const requestKey = "importJobId" in selection ? playlistAiRequestKey(selection.importJobId) : `${actor}:${key}`;
    const json = JSON.stringify(selection);
    if ("importJobId" in selection) {
      const job = await this.db.prepare(`SELECT status, EXISTS (SELECT 1 FROM music_ingestion_messages m
        WHERE m.job_id=j.id AND m.status='pending') AS pending FROM music_ingestion_jobs j WHERE j.id=? AND j.source_kind='playlist_import'`)
        .bind(selection.importJobId).first<{ status: string; pending: number }>();
      if (!job) throw new AiReviewError("not_found", "가져오기 작업을 찾을 수 없습니다.", 404);
      if (job.pending || job.status !== "completed") {
        throw new AiReviewError("import_incomplete", "영상 수집이 끝난 뒤 AI 일괄 검수를 시작할 수 있습니다.", 409);
      }
    }
    const { where, bindings } = selectionSql(selection);
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO music_ai_review_batches(id,actor,request_key,selection_json,created_at) VALUES(?,?,?,?,?)").bind(id, actor, requestKey, json, now),
      this.db.prepare(`INSERT INTO music_ai_review_batch_items(id,batch_id,candidate_id,candidate_version,candidate_kind,title,auto_apply,created_at,updated_at)
        SELECT lower(hex(randomblob(16))),batch.id,c.id,c.version,c.candidate_kind,c.title,c.review_input_json IS NULL,?,?
        FROM music_ai_review_batches batch CROSS JOIN music_ingestion_candidates c
        WHERE batch.request_key=? AND batch.selection_json=? AND ${where}
        ${"importJobId" in selection
          ? "AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items i WHERE i.batch_id=batch.id AND i.candidate_id=c.id)"
          : "AND batch.id=?"}`).bind(now, now, requestKey, json, ...bindings, ...("importJobId" in selection ? [] : [id])),
    ]);
    const saved = await this.db.prepare("SELECT id,selection_json FROM music_ai_review_batches WHERE request_key=?").bind(requestKey).first<{ id: string; selection_json: string }>();
    if (!saved || saved.selection_json !== json) throw new AiReviewError("idempotency_conflict", "다른 요청에 사용된 요청 키입니다.", 409);
    return this.summary(saved.id);
  }
  private async summary(id: string): Promise<AiBatchSummary> {
    const row = await this.db.prepare("SELECT id,created_at FROM music_ai_review_batches WHERE id=?").bind(id).first<{ id: string; created_at: number }>();
    if (!row) throw new AiReviewError("not_found", "일괄 요청을 찾을 수 없습니다.", 404);
    const counts: AiBatchSummary["counts"] = { queued: 0, analyzing: 0, saving: 0, saved: 0, needs_selection: 0, failed: 0, changed: 0 };
    const groups = await this.db.prepare(`SELECT i.status,count(*) AS n,max(i.updated_at) AS updated_at,
      SUM(CASE WHEN r.status='retry_wait' AND r.error_code='daily_limit' AND i.status='analyzing' THEN 1 ELSE 0 END) AS budget_waiting
      FROM music_ai_review_batch_items i LEFT JOIN music_ai_reviews r ON r.id=i.review_id WHERE i.id IN (${batchScope("?1")}) GROUP BY i.status`)
      .bind(id).all<{ status: AiBatchItem["status"]; n: number; updated_at: number; budget_waiting: number }>();
    for (const g of groups.results) counts[g.status] = g.n;
    const budgetWaiting = groups.results.reduce((sum, group) => sum + group.budget_waiting, 0);
    return { id, createdAt: row.created_at, updatedAt: Math.max(row.created_at, ...groups.results.map(g => g.updated_at)), counts,
      ...(budgetWaiting > 0 ? { budgetWaiting } : {}), total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }
  async list() {
    const rows = await this.db.prepare(`SELECT b.id,b.created_at,i.status,count(i.id) AS n,max(i.updated_at) AS updated_at FROM music_ai_review_batches b
      LEFT JOIN music_ai_review_batch_items i ON i.batch_id=b.id
      WHERE b.id IN (SELECT id FROM music_ai_review_batches ORDER BY created_at DESC,id DESC LIMIT 20)
        OR b.id IN (SELECT batch_id FROM music_ai_review_batch_items WHERE status IN ${pending})
      GROUP BY b.id,i.status ORDER BY b.created_at DESC,b.id DESC`).all<{ id: string; created_at: number; updated_at: number | null; status: AiBatchItem["status"] | null; n: number }>();
    const batches = new Map<string, AiBatchSummary>();
    for (const row of rows.results) {
      const batch = batches.get(row.id) ?? { id: row.id, createdAt: row.created_at, updatedAt: row.created_at, total: 0, counts: { queued: 0, analyzing: 0, saving: 0, saved: 0, needs_selection: 0, failed: 0, changed: 0 } };
      batch.updatedAt = Math.max(batch.updatedAt, row.updated_at ?? row.created_at);
      if (row.status) batch.counts[row.status] = row.n;
      batch.total += row.n;
      batches.set(row.id, batch);
    }
    return [...batches.values()];
  }
  async get(id: string, cursor?: string) {
    const batch = await this.summary(id);
    const rows = await this.db.prepare(`SELECT i.id,i.batch_id,i.candidate_id,i.candidate_version,i.candidate_kind,i.title,i.status,i.error_message,
      (SELECT o.job_id FROM music_ingestion_candidate_origins o WHERE o.candidate_id=i.candidate_id ORDER BY o.job_id LIMIT 1) AS job_id,
      (SELECT c.status FROM music_ingestion_candidates c WHERE c.id=i.candidate_id) AS candidate_status
      FROM music_ai_review_batch_items i WHERE i.id IN (${batchScope("?1")}) AND i.id>? ORDER BY i.id LIMIT 51`).bind(id, cursor ?? "").all<Row>();
    return { batch, items: rows.results.slice(0, 50).map(decode), nextCursor: rows.results.length > 50 ? String(rows.results[49].id) : null };
  }
  async draft(candidateId: string): Promise<AiBatchDraft | null> {
    const row = await this.db.prepare(`SELECT i.*, EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current} AND c.review_input_json IS NULL) AS can_apply
      FROM music_ai_review_batch_items i JOIN music_ingestion_candidates c ON c.id=i.candidate_id
      WHERE i.candidate_id=? ORDER BY ${aiDraftOrder} LIMIT 1`).bind(candidateId).first<Row>();
    if (!row?.result_json || ["queued", "analyzing", "saving"].includes(String(row.status))) return null;
    return { itemId: String(row.id), candidateVersion: Number(row.candidate_version), candidateKind: row.candidate_kind as AiBatchItem["candidateKind"],
      status: row.status as AiBatchItem["status"], result: JSON.parse(String(row.result_json)),
      autoApply: ["saved", "needs_selection"].includes(String(row.status)) && Boolean(row.auto_apply) && Boolean(row.can_apply) };
  }
  async claim(id: string, generation: number, token: string, now: number): Promise<AiBatchWork | null> {
    const result=await this.db.batch([this.db.prepare(`UPDATE music_ai_review_batch_items SET lease_token=?,lease_until=?,updated_at=?
      WHERE id=? AND generation=? AND status IN ${pending} AND (lease_until IS NULL OR lease_until<=?) RETURNING *`).bind(token, now + 300000, now, id, generation, now)]);
    const row=result[0].results[0] as Row|undefined;
    if (!row) return null;
    const batch = await this.db.prepare("SELECT actor FROM music_ai_review_batches WHERE id=?").bind(row.batch_id).first<{ actor: string }>();
    return { ...decode(row), actor: batch!.actor, reviewId: row.review_id as string | null, generation: Number(row.generation), result: row.result_json ? JSON.parse(String(row.result_json)) : null };
  }
  async current(item: AiBatchWork) {
    return Boolean(await this.db.prepare(`SELECT i.id FROM music_ai_review_batch_items i JOIN music_ingestion_candidates c ON c.id=i.candidate_id WHERE i.id=? AND ${current}`).bind(item.id).first());
  }
  async attach(id: string, token: string, reviewId: string, now: number, waiting?: { message: string | null; retryAt: number | null }) {
    await this.db.batch([this.db.prepare("UPDATE music_ai_review_batch_items SET review_id=?,status='analyzing',error_message=?,dispatch_until=?,updated_at=? WHERE id=? AND lease_token=?")
      .bind(reviewId, waiting?.message ?? null, Math.max(now + 600000, waiting?.retryAt ?? 0), now, id, token)]);
  }
  async capture(id: string, token: string, result: AiReviewResult, now: number) {
    await this.db.batch([this.db.prepare("UPDATE music_ai_review_batch_items SET result_json=?,status='saving',updated_at=? WHERE id=? AND lease_token=?").bind(JSON.stringify(result), now, id, token)]);
  }
  async finish(id: string, token: string, status: AiBatchItem["status"], message: string | null, now: number) {
    await this.db.batch([this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET
      status=CASE WHEN EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current}) THEN ? ELSE 'changed' END,
      error_message=?,updated_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`).bind(status, message, now, id, token)]);
  }
  async release(id: string, token: string, now: number) {
    await this.db.batch([this.db.prepare("UPDATE music_ai_review_batch_items SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(now, id, token)]);
  }
  async pending(now: number, batchId?: string) {
    const rows = await this.db.batch([this.db.prepare(`UPDATE music_ai_review_batch_items SET dispatch_until=? WHERE id IN (
      SELECT id FROM music_ai_review_batch_items WHERE status IN ${pending} AND (lease_until IS NULL OR lease_until<=?)
      AND (dispatch_until IS NULL OR dispatch_until<=?) ${batchId ? `AND id IN (${batchScope("?4")})` : ""} ORDER BY updated_at,id LIMIT 20) RETURNING id,generation`)
      .bind(now + 600000, now, now, ...(batchId ? [batchId] : []))]);
    return rows[0].results as {id:string;generation:number}[];
  }
  async hasRecoveryWork(now: number) {
    return Boolean(await this.db.prepare(`SELECT id FROM music_ai_review_batch_items WHERE status IN ${pending}
      AND (lease_until IS NULL OR lease_until<=?) AND (dispatch_until IS NULL OR dispatch_until<=?) LIMIT 1`).bind(now, now).first());
  }
  async retry(id: string, now: number, candidateIds?: readonly string[], command?: AiBatchRetryCommand) {
    await this.summary(id);
    const receiptId=command ? `ai-batch-retry:${command.actorUserId}:${command.idempotencyKey}` : null;
    const receiptGuard=receiptId ? "AND NOT EXISTS(SELECT 1 FROM music_catalog_events WHERE id=?)" : "";
    const statements=[this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET status='changed',error_message='후보가 변경되었습니다. 최신 내용을 확인하세요.',updated_at=?
      WHERE batch_id=? AND status='failed' AND NOT EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current}) ${receiptGuard}`).bind(now, id,...(receiptId ? [receiptId] : [])),
    this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET status=CASE WHEN result_json IS NULL THEN 'queued' ELSE 'saving' END,
      review_id=CASE WHEN result_json IS NULL THEN NULL ELSE review_id END,generation=generation+1,error_message=NULL,dispatch_until=NULL,updated_at=?
      WHERE i.id IN (${batchScope("?2")}) AND status='failed' AND EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current})
      AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items other WHERE other.candidate_id=i.candidate_id AND other.status IN ${pending})
      ${candidateIds ? "AND i.candidate_id IN (SELECT value FROM json_each(?))" : ""} ${receiptGuard}`).bind(now, id, ...(candidateIds ? [JSON.stringify(candidateIds)] : []),...(receiptId ? [receiptId] : []))];
    if(command)statements.push(this.db.prepare(`INSERT OR IGNORE INTO music_catalog_events(id,aggregate_type,aggregate_id,event_type,actor_kind,actor_user_id,detail_json,created_at)
      VALUES(?,'ai_review_batch',?,'ai_batch.retry','admin',?,'{}',?)`).bind(receiptId,id,command.actorUserId,now));
    await this.db.batch(statements);
  }
  async dead(id: string, generation: number, now: number) {
    await this.db.batch([this.db.prepare(`UPDATE music_ai_review_batch_items SET status='failed',error_message='큐 처리를 완료하지 못했습니다. 다시 시도하세요.',updated_at=?
      WHERE id=? AND generation=? AND status IN ${pending} AND (lease_until IS NULL OR lease_until<=?)`).bind(now, id, generation, now)]);
  }
}
