import type {
  AiReviewDto,
  AiReviewResult,
} from "@contracts/otw-play-ai-review";
import {
  AiReviewError,
  type AiReviewRecord,
  type AiReviewRepository,
} from "../application/ports/ai-review";

type Row = Record<string, string | number | null>;
const decode = (r: Row): AiReviewRecord => ({
  id: String(r.id),
  candidateId: r.candidate_id as string | null,
  videoId: String(r.video_id),
  candidateKind: r.candidate_kind as AiReviewRecord["candidateKind"],
  range: JSON.parse(String(r.range_json)),
  targetKey: String(r.target_key),
  inputHash: String(r.input_hash),
  input: r.input_json ? JSON.parse(String(r.input_json)) : null,
  model: String(r.model),
  status: r.status as AiReviewRecord["status"],
  result: r.result_json ? JSON.parse(String(r.result_json)) : null,
  usage: r.usage_json ? JSON.parse(String(r.usage_json)) : null,
  attempts: Number(r.attempts),
  leaseToken: r.lease_token as string | null,
  errorCode: r.error_code as string | null,
  errorMessage: r.error_message as string | null,
  retryable: r.status === "retry_wait",
  nextRetryAt: r.next_retry_at === null ? null : Number(r.next_retry_at),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  expiresAt: Number(r.expires_at),
});
export class D1AiReviewRepository implements AiReviewRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async get(id: string) {
    const r = await this.db
      .prepare("SELECT * FROM music_ai_reviews WHERE id = ?")
      .bind(id)
      .first<Row>();
    return r ? decode(r) : null;
  }
  async latest(key: string, now: number) {
    const r = await this.db
      .prepare(
        "SELECT * FROM music_ai_reviews WHERE target_key = ? AND expires_at > ? ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .bind(key, now)
      .first<Row>();
    return r ? decode(r) : null;
  }
  async request(key: string) {
    const r = await this.db
      .prepare(
        "SELECT request_hash AS hash, review_id AS id FROM music_ai_review_requests WHERE request_key = ?",
      )
      .bind(key)
      .first<{ hash: string; id: string }>();
    return r;
  }
  async create(
    r: AiReviewRecord,
    key: string,
    hash: string,
    force: boolean,
    now: number,
  ) {
    const reusable =
      "input_hash = ? AND expires_at > ? AND (status IN ('queued','running','retry_wait') OR (? = 0 AND status IN ('succeeded','partial') AND updated_at > ?))";
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE music_ai_reviews SET status='failed',error_code='expired' WHERE input_hash=? AND expires_at<=? AND status IN ('queued','running','retry_wait')",
        )
        .bind(r.inputHash, now),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO music_ai_reviews (id,candidate_id,video_id,candidate_kind,range_json,target_key,input_hash,input_json,model,prompt_version,status,created_at,updated_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'queued',?,?,? WHERE NOT EXISTS (SELECT 1 FROM music_ai_review_requests WHERE request_key=?) AND NOT EXISTS (SELECT 1 FROM music_ai_reviews WHERE ${reusable})`,
        )
        .bind(
          r.id,
          r.candidateId,
          r.videoId,
          r.candidateKind,
          JSON.stringify(r.range),
          r.targetKey,
          r.inputHash,
          JSON.stringify(r.input),
          r.model,
          r.input?.promptVersion ?? "1",
          now,
          now,
          r.expiresAt,
          key,
          r.inputHash,
          now,
          force ? 1 : 0,
          now - 86400000,
        ),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO music_ai_review_requests (request_key,request_hash,review_id,created_at)
        SELECT ?,?,id,? FROM music_ai_reviews WHERE ${reusable} ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .bind(key, hash, now, r.inputHash, now, force ? 1 : 0, now - 86400000),
    ]);
    const request = await this.request(key);
    if (!request || request.hash !== hash)
      throw new AiReviewError(
        "idempotency_conflict",
        "같은 요청 키가 다른 분석에 사용되었습니다.",
        409,
      );
    return (await this.get(request.id))!;
  }
  async claim(id: string, token: string, now: number, limit: number) {
    const day = Math.floor(now / 86400000) * 86400000;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?,error_code=NULL,error_message=NULL
        WHERE id=? AND status IN ('queued','retry_wait') AND attempts<3 AND expires_at>? AND (next_retry_at IS NULL OR next_retry_at<=?)
        AND NOT EXISTS (SELECT 1 FROM music_ai_reviews WHERE status='running' AND lease_until>?)
        AND (SELECT count(*) FROM music_ai_review_attempts WHERE started_at>=?)<?`,
        )
        .bind(token, now + 240000, now, id, now, now, now, day, limit),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO music_ai_review_attempts (token,review_id,started_at,outcome) SELECT ?,id,?,'running' FROM music_ai_reviews WHERE id=? AND lease_token=? AND status='running'",
        )
        .bind(token, now, id, token),
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status='retry_wait',next_retry_at=?,error_code='daily_limit',error_message='일일 AI 호출 한도에 도달했습니다.',updated_at=?
        WHERE id=? AND status IN ('queued','retry_wait') AND (SELECT count(*) FROM music_ai_review_attempts WHERE started_at>=?)>=?`,
        )
        .bind(day + 86400000, now, id, day, limit),
    ]);
    const r = await this.get(id);
    return r?.leaseToken === token && r.status === "running" ? r : null;
  }
  async finish(
    id: string,
    token: string,
    result: AiReviewResult | null,
    usage: AiReviewDto["usage"],
    error: AiReviewError | null,
    now: number,
  ) {
    const r = await this.get(id);
    if (!r || r.leaseToken !== token || r.status !== "running") return;
    const retry = Boolean(error?.retryable && r.attempts < 3);
    const status = error
      ? retry
        ? "retry_wait"
        : "failed"
      : result?.videoAnalyzed
        ? "succeeded"
        : "partial";
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE music_ai_review_attempts SET finished_at=?,outcome=?,usage_json=? WHERE token=? AND EXISTS (SELECT 1 FROM music_ai_reviews WHERE id=? AND lease_token=? AND status='running')`,
        )
        .bind(
          now,
          error?.code ?? status,
          usage ? JSON.stringify(usage) : null,
          token,
          id,
          token,
        ),
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status=?,result_json=?,usage_json=?,error_code=?,error_message=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running'`,
        )
        .bind(
          status,
          result ? JSON.stringify(result) : null,
          usage ? JSON.stringify(usage) : null,
          error?.code ?? null,
          error?.message ?? null,
          retry ? now + 30000 * 2 ** (r.attempts - 1) : null,
          now,
          id,
          token,
        ),
    ]);
  }
  async recover(now: number) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE music_ai_review_attempts SET outcome='interrupted',finished_at=? WHERE outcome='running' AND started_at<=?",
        )
        .bind(now, now - 240000),
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status=CASE WHEN attempts<3 THEN 'retry_wait' ELSE 'failed' END,lease_token=NULL,lease_until=NULL,next_retry_at=?,updated_at=?,error_code='interrupted',error_message='분석 작업이 중단되었습니다.' WHERE status='running' AND lease_until<=?`,
        )
        .bind(now, now, now),
    ]);
    const rows = await this.db
      .prepare(
        "SELECT id FROM music_ai_reviews WHERE status IN ('queued','retry_wait') AND expires_at>? AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY created_at LIMIT 20",
      )
      .bind(now, now)
      .all<{ id: string }>();
    return rows.results.map((r) => r.id);
  }
  async clearExpired(now: number) {
    const r = await this.db
      .prepare(
        "DELETE FROM music_ai_reviews WHERE id IN (SELECT id FROM music_ai_reviews WHERE expires_at<=? LIMIT 20) RETURNING id",
      )
      .bind(now)
      .all();
    return r.results.length;
  }
  async markDead(id: string, now: number) {
    await this.db
      .prepare(
        "UPDATE music_ai_reviews SET status='failed',error_code='queue_exhausted',error_message='분석 큐 전달에 실패했습니다.',updated_at=? WHERE id=? AND status IN ('queued','retry_wait')",
      )
      .bind(now, id)
      .run();
  }
}
