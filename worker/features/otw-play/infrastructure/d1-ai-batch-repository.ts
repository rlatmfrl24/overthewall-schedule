import type { AiBatchDraft, AiBatchItem, AiBatchSelection, AiBatchSummary } from "@contracts/otw-play-ai-batch";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";
import type { AiBatchRepository, AiBatchWork } from "../application/ports/ai-batch";
import { AiReviewError } from "../application/ports/ai-review";

type Row = Record<string, string | number | null>;
const pending = "('queued','analyzing','saving')";
const eligible = `c.status IN ('discovered','needs_input','blocked') AND c.availability_status='playable'
  AND c.linked_performance_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM music_cover_proposals p WHERE p.youtube_video_id=c.external_video_id AND p.status='pending_review' AND p.segment_start_seconds=0)`;
const current = `${eligible} AND c.version=i.candidate_version AND c.candidate_kind=i.candidate_kind`;
const decode = (r: Row): AiBatchItem => ({ id: String(r.id), batchId: String(r.batch_id), candidateId: String(r.candidate_id),
  candidateVersion: Number(r.candidate_version), candidateKind: r.candidate_kind as AiBatchItem["candidateKind"],
  title: r.title as string | null, status: r.status as AiBatchItem["status"], errorMessage: r.error_message as string | null,
  jobId: r.job_id as string | null ?? null, candidateStatus: r.candidate_status as string | null ?? null });
function selectionSql(selection: AiBatchSelection) {
  const bindings: (string | number)[] = [];
  let where = eligible;
  if ("candidates" in selection) {
    where += " AND EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=c.id AND json_extract(j.value,'$.version')=c.version)";
    bindings.push(JSON.stringify(selection.candidates));
    where += ` AND (EXISTS (SELECT 1 FROM music_ingestion_candidate_origins o WHERE o.candidate_id=c.id)
      OR EXISTS (SELECT 1 FROM music_channel_upload_candidate_origins o WHERE o.candidate_id=c.id))`;
  } else {
    const f = selection.filters;
    where += f.source === "automatic"
      ? " AND EXISTS (SELECT 1 FROM music_channel_upload_candidate_origins o WHERE o.candidate_id=c.id)"
      : ` AND EXISTS (SELECT 1 FROM music_ingestion_candidate_origins o WHERE o.candidate_id=c.id${f.jobId ? " AND o.job_id=?" : ""})`;
    if (f.source === "playlist" && f.jobId) bindings.push(f.jobId);
    if (f.candidateKind) { where += " AND c.candidate_kind=?"; bindings.push(f.candidateKind); }
  }
  where += ` AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items i WHERE i.candidate_id=c.id AND i.status IN ${pending})`;
  return { where, bindings };
}
export class D1AiBatchRepository implements AiBatchRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async preview(selection: AiBatchSelection) {
    const { where, bindings } = selectionSql(selection);
    const r = await this.db.prepare(`SELECT count(*) AS n FROM music_ingestion_candidates c WHERE ${where}`).bind(...bindings).first<{ n: number }>();
    return r!.n;
  }
  async create(id: string, actor: string, key: string, selection: AiBatchSelection, now: number) {
    const requestKey = `${actor}:${key}`, json = JSON.stringify(selection);
    const { where, bindings } = selectionSql(selection);
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO music_ai_review_batches(id,actor,request_key,selection_json,created_at) VALUES(?,?,?,?,?)").bind(id, actor, requestKey, json, now),
      this.db.prepare(`INSERT INTO music_ai_review_batch_items(id,batch_id,candidate_id,candidate_version,candidate_kind,title,auto_apply,created_at,updated_at)
        SELECT lower(hex(randomblob(16))),?,c.id,c.version,c.candidate_kind,c.title,c.review_input_json IS NULL,?,?
        FROM music_ingestion_candidates c WHERE ${where}
        AND EXISTS (SELECT 1 FROM music_ai_review_batches WHERE id=? AND request_key=? AND selection_json=?)`).bind(id, now, now, ...bindings, id, requestKey, json),
    ]);
    const saved = await this.db.prepare("SELECT id,selection_json FROM music_ai_review_batches WHERE request_key=?").bind(requestKey).first<{ id: string; selection_json: string }>();
    if (!saved || saved.selection_json !== json) throw new AiReviewError("idempotency_conflict", "다른 요청에 사용된 요청 키입니다.", 409);
    return this.summary(saved.id);
  }
  private async summary(id: string): Promise<AiBatchSummary> {
    const row = await this.db.prepare("SELECT id,created_at FROM music_ai_review_batches WHERE id=?").bind(id).first<{ id: string; created_at: number }>();
    if (!row) throw new AiReviewError("not_found", "일괄 요청을 찾을 수 없습니다.", 404);
    const counts: AiBatchSummary["counts"] = { queued: 0, analyzing: 0, saving: 0, saved: 0, needs_selection: 0, failed: 0, changed: 0 };
    const groups = await this.db.prepare("SELECT status,count(*) AS n FROM music_ai_review_batch_items WHERE batch_id=? GROUP BY status").bind(id).all<{ status: AiBatchItem["status"]; n: number }>();
    for (const g of groups.results) counts[g.status] = g.n;
    return { id, createdAt: row.created_at, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }
  async list() {
    const rows = await this.db.prepare(`SELECT b.id,b.created_at,i.status,count(i.id) AS n FROM music_ai_review_batches b
      LEFT JOIN music_ai_review_batch_items i ON i.batch_id=b.id
      WHERE b.id IN (SELECT id FROM music_ai_review_batches ORDER BY created_at DESC,id DESC LIMIT 20)
        OR b.id IN (SELECT batch_id FROM music_ai_review_batch_items WHERE status IN ${pending})
      GROUP BY b.id,i.status ORDER BY b.created_at DESC,b.id DESC`).all<{ id: string; created_at: number; status: AiBatchItem["status"] | null; n: number }>();
    const batches = new Map<string, AiBatchSummary>();
    for (const row of rows.results) {
      const batch = batches.get(row.id) ?? { id: row.id, createdAt: row.created_at, total: 0, counts: { queued: 0, analyzing: 0, saving: 0, saved: 0, needs_selection: 0, failed: 0, changed: 0 } };
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
      FROM music_ai_review_batch_items i WHERE i.batch_id=? AND i.id>? ORDER BY i.id LIMIT 51`).bind(id, cursor ?? "").all<Row>();
    return { batch, items: rows.results.slice(0, 50).map(decode), nextCursor: rows.results.length > 50 ? String(rows.results[49].id) : null };
  }
  async draft(candidateId: string): Promise<AiBatchDraft | null> {
    const row = await this.db.prepare(`SELECT i.*, EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current} AND c.review_input_json IS NULL) AS can_apply
      FROM music_ai_review_batch_items i WHERE i.candidate_id=? AND i.result_json IS NOT NULL AND i.status NOT IN ${pending}
      ORDER BY i.created_at DESC,i.id DESC LIMIT 1`).bind(candidateId).first<Row>();
    if (!row) return null;
    return { itemId: String(row.id), candidateVersion: Number(row.candidate_version), candidateKind: row.candidate_kind as AiBatchItem["candidateKind"],
      status: row.status as AiBatchItem["status"], result: JSON.parse(String(row.result_json)),
      autoApply: ["saved", "needs_selection"].includes(String(row.status)) && Boolean(row.auto_apply) && Boolean(row.can_apply) };
  }
  async claim(id: string, token: string, now: number): Promise<AiBatchWork | null> {
    const row = await this.db.prepare(`UPDATE music_ai_review_batch_items SET lease_token=?,lease_until=?,updated_at=?
      WHERE id=? AND status IN ${pending} AND (lease_until IS NULL OR lease_until<=?) RETURNING *`).bind(token, now + 300000, now, id, now).first<Row>();
    if (!row) return null;
    const batch = await this.db.prepare("SELECT actor FROM music_ai_review_batches WHERE id=?").bind(row.batch_id).first<{ actor: string }>();
    return { ...decode(row), actor: batch!.actor, reviewId: row.review_id as string | null, generation: Number(row.generation), result: row.result_json ? JSON.parse(String(row.result_json)) : null };
  }
  async current(item: AiBatchWork) {
    return Boolean(await this.db.prepare(`SELECT i.id FROM music_ai_review_batch_items i JOIN music_ingestion_candidates c ON c.id=i.candidate_id WHERE i.id=? AND ${current}`).bind(item.id).first());
  }
  async attach(id: string, token: string, reviewId: string, now: number, waiting?: { message: string | null; retryAt: number | null }) {
    await this.db.prepare("UPDATE music_ai_review_batch_items SET review_id=?,status='analyzing',error_message=?,dispatch_until=?,updated_at=? WHERE id=? AND lease_token=?")
      .bind(reviewId, waiting?.message ?? null, Math.max(now + 600000, waiting?.retryAt ?? 0), now, id, token).run();
  }
  async capture(id: string, token: string, result: AiReviewResult, now: number) {
    await this.db.prepare("UPDATE music_ai_review_batch_items SET result_json=?,status='saving',updated_at=? WHERE id=? AND lease_token=?").bind(JSON.stringify(result), now, id, token).run();
  }
  async finish(id: string, token: string, status: AiBatchItem["status"], message: string | null, now: number) {
    await this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET
      status=CASE WHEN EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current}) THEN ? ELSE 'changed' END,
      error_message=?,updated_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`).bind(status, message, now, id, token).run();
  }
  async release(id: string, token: string, now: number) {
    await this.db.prepare("UPDATE music_ai_review_batch_items SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(now, id, token).run();
  }
  async pending(now: number, batchId?: string) {
    const rows = await this.db.prepare(`UPDATE music_ai_review_batch_items SET dispatch_until=? WHERE id IN (
      SELECT id FROM music_ai_review_batch_items WHERE status IN ${pending} AND (lease_until IS NULL OR lease_until<=?)
      AND (dispatch_until IS NULL OR dispatch_until<=?) ${batchId ? "AND batch_id=?" : ""} ORDER BY updated_at,id LIMIT 20) RETURNING id`)
      .bind(now + 600000, now, now, ...(batchId ? [batchId] : [])).all<{ id: string }>();
    return rows.results.map(r => r.id);
  }
  async hasRecoveryWork(now: number) {
    return Boolean(await this.db.prepare(`SELECT id FROM music_ai_review_batch_items WHERE status IN ${pending}
      AND (lease_until IS NULL OR lease_until<=?) AND (dispatch_until IS NULL OR dispatch_until<=?) LIMIT 1`).bind(now, now).first());
  }
  async retry(id: string, now: number) {
    await this.summary(id);
    await this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET status='changed',error_message='후보가 변경되었습니다. 최신 내용을 확인하세요.',updated_at=?
      WHERE batch_id=? AND status='failed' AND NOT EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current})`).bind(now, id).run();
    await this.db.prepare(`UPDATE music_ai_review_batch_items AS i SET status=CASE WHEN result_json IS NULL THEN 'queued' ELSE 'saving' END,
      review_id=CASE WHEN result_json IS NULL THEN NULL ELSE review_id END,generation=generation+1,error_message=NULL,dispatch_until=NULL,updated_at=?
      WHERE batch_id=? AND status='failed' AND EXISTS (SELECT 1 FROM music_ingestion_candidates c WHERE c.id=i.candidate_id AND ${current})
      AND NOT EXISTS (SELECT 1 FROM music_ai_review_batch_items other WHERE other.candidate_id=i.candidate_id AND other.status IN ${pending})`).bind(now, id).run();
  }
  async dead(id: string, now: number) {
    await this.db.prepare(`UPDATE music_ai_review_batch_items SET status='failed',error_message='큐 처리를 완료하지 못했습니다. 다시 시도하세요.',updated_at=?
      WHERE id=? AND status IN ${pending} AND (lease_until IS NULL OR lease_until<=?)`).bind(now, id, now).run();
  }
}
