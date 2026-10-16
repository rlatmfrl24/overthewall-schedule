import type {
  AiReviewDto,
  AiReviewResult,
} from "@contracts/otw-play-ai-review";
import {
  AiReviewError,
  type AiReviewRecord,
  type AiReviewRepository,
} from "../application/ports/ai-review";
import {contentRowHeldSql,aiResumeExecutionHeldSql,aiResumeExecutionPendingSql,releasedSourceAiRetrySql,publicationHiddenSql,archivedYouTubeVideoSql,type D1AiUnknownControl,type D1AiResumeControl} from '../../content-transition';
import type {SiteId} from '@contracts/site-definition';

const unknownHeld=(id:string)=>`EXISTS(SELECT 1 FROM content_transition_operations held JOIN content_transitions t ON t.id=held.transition_id WHERE json_extract(held.envelope_json,'$.codec.id') IN ('otw-play.ai.unknown','otw-play.ai.resume') AND (t.aborted_at IS NULL OR json_extract(held.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND NOT coalesce((${releasedSourceAiRetrySql('held','t')}),0)) AND json_extract(held.envelope_json,'$.payload.reviewId')=${id})`;

type Row = Record<string, string | number | null>;
export type AiReviewBatchAction='create'|'claim'|'finish'|'recover'|'prune'|'dead'|'finish_resume';
export type AiReviewBatchWriter=(action:AiReviewBatchAction,reviewId:string|null,statements:D1PreparedStatement[])=>Promise<D1Result[]>;
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
  private readonly transition:D1AiUnknownControl|null;
  private readonly owningBatch:AiReviewBatchWriter|null;
  private readonly resume:D1AiResumeControl|null;
  private readonly siteId:SiteId;
  constructor(db: D1Database,transition:D1AiUnknownControl|null=null,owningBatch:AiReviewBatchWriter|null=null,resume:D1AiResumeControl|null=null,siteId:SiteId='otw') {
    this.db = db;
    this.transition=transition;
    this.owningBatch=owningBatch;
    this.resume=resume;
    this.siteId=siteId;
  }
  private batch(action:AiReviewBatchAction,id:string|null,statements:D1PreparedStatement[]) {
    return this.owningBatch?this.owningBatch(action,id,statements):this.db.batch(statements);
  }
  private blockedSql(candidate: string, video: string, channel: string) {
    return `(EXISTS(SELECT 1 FROM music_ingestion_candidates candidate WHERE candidate.id=${candidate} AND (candidate.content_access='admin_archive' OR ${publicationHiddenSql('music_ingestion_candidates','candidate',this.siteId)})) OR ${archivedYouTubeVideoSql(video,this.siteId,channel)})`;
  }
  private cutoffError() { return new AiReviewError('publication_cutoff','이관된 멤버의 신규 분석은 종료되었습니다.',403); }
  async assertCollectionAllowed(candidateId:string|null,videoId:string,channelId:string|null=null) {
    if(await this.db.prepare(`WITH target(candidate_id,video_id,channel_id) AS(VALUES(?,?,?)) SELECT 1 FROM target WHERE ${this.blockedSql('target.candidate_id','target.video_id','target.channel_id')}`).bind(candidateId,videoId,channelId).first()) throw this.cutoffError();
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
    await this.assertCollectionAllowed(r.candidateId,r.videoId,r.input?.video.channelId);
    const reusable =
      "input_hash = ? AND expires_at > ? AND (status IN ('queued','running','retry_wait') OR (? = 0 AND status IN ('succeeded','partial') AND updated_at > ?))";
    await this.batch('create',r.id,[
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status='failed',error_code='expired' WHERE input_hash=? AND expires_at<=? AND status IN ('queued','running','retry_wait') AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionPendingSql('music_ai_reviews.id')}`,
        )
        .bind(r.inputHash, now),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO music_ai_reviews (id,candidate_id,video_id,candidate_kind,range_json,target_key,input_hash,input_json,model,prompt_version,status,created_at,updated_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'queued',?,?,? WHERE NOT EXISTS (SELECT 1 FROM music_ai_review_requests WHERE request_key=?) AND NOT EXISTS (SELECT 1 FROM music_ai_reviews WHERE ${reusable}) AND NOT EXISTS(SELECT 1 FROM (SELECT ? AS candidate_id,? AS video_id,? AS channel_id) target WHERE ${this.blockedSql('target.candidate_id','target.video_id','target.channel_id')})`,
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
          r.candidateId,r.videoId,r.input?.video.channelId??null,
        ),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO music_ai_review_requests (request_key,request_hash,review_id,created_at)
        SELECT ?,?,id,? FROM music_ai_reviews WHERE ${reusable} ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .bind(key, hash, now, r.inputHash, now, force ? 1 : 0, now - 86400000),
    ]);
    const request = await this.request(key);
    if(!request) await this.assertCollectionAllowed(r.candidateId,r.videoId,r.input?.video.channelId);
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
    const blocked=this.blockedSql('music_ai_reviews.candidate_id','music_ai_reviews.video_id',"json_extract(music_ai_reviews.input_json,'$.video.channelId')");
    await this.batch('dead',id,[this.db.prepare(`UPDATE music_ai_reviews SET status='failed',error_code='publication_cutoff',error_message=?,next_retry_at=NULL,updated_at=? WHERE id=? AND status IN ('queued','retry_wait') AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionPendingSql('music_ai_reviews.id')} AND ${blocked}`).bind(this.cutoffError().message,now,id)]);
    await this.batch('claim',id,[
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?,error_code=NULL,error_message=NULL
        WHERE id=? AND status IN ('queued','retry_wait') AND attempts<3 AND expires_at>? AND (next_retry_at IS NULL OR next_retry_at<=?)
        AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionHeldSql('music_ai_reviews.id')} AND NOT ${blocked}
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
        WHERE id=? AND status IN ('queued','retry_wait') AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionHeldSql('music_ai_reviews.id')} AND (SELECT count(*) FROM music_ai_review_attempts WHERE started_at>=?)>=?`,
        )
        .bind(day + 86400000, now, id, day, limit),
    ]);
    const r = await this.get(id);
    return r?.leaseToken === token && r.status === "running" ? r : null;
  }
  async retainResponse(id:string,token:string,result:AiReviewResult|null,usage:AiReviewDto['usage'],error:AiReviewError|null,now:number) {
    const failure=error?{code:error.code,message:error.message,retryable:error.retryable}:null;
    if(await this.transition?.recordOriginalResponse(id,token,result,usage,failure,now))return true;
    return await this.resume?.retainResponse(id,token,{result,usage,error:failure},now)??false;
  }
  async beginRequest(id:string,token:string,now:number){
    const r=await this.get(id);
    if(!r||r.status!=='running'||r.leaseToken!==token) throw new AiReviewError('stale_write','분석 실행 권한이 변경되었습니다.',409);
    await this.resume?.beginRequest(id,token,now);
    try { await this.assertCollectionAllowed(r.candidateId,r.videoId,r.input?.video.channelId); }
    catch(error) {
      if(error instanceof AiReviewError&&error.code==='publication_cutoff') await this.finish(id,token,null,null,error,now);
      throw error;
    }
  }
  async finish(
    id: string,
    token: string,
    result: AiReviewResult | null,
    usage: AiReviewDto["usage"],
    error: AiReviewError | null,
    now: number,
  ) {
    if(await this.retainResponse(id,token,result,usage,error,now)) return;
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
    const continuation=await this.resume?.finishStatements(id,token,result,error?{code:error.code,message:error.message,retryable:error.retryable}:null,status);
    await this.batch(continuation?'finish_resume':'finish',id,[
      ...(continuation?[continuation[0]]:[]),
      this.db
        .prepare(
          `UPDATE music_ai_review_attempts SET finished_at=?,outcome=?,usage_json=? WHERE token=? AND EXISTS (SELECT 1 FROM music_ai_reviews WHERE id=? AND lease_token=? AND status='running') AND NOT ${unknownHeld('music_ai_review_attempts.review_id')}`,
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
          `UPDATE music_ai_reviews SET status=?,result_json=?,usage_json=?,error_code=?,error_message=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running' AND NOT ${unknownHeld('music_ai_reviews.id')}`,
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
      ...(continuation?[continuation[1]]:[]),
    ]);
    await this.transition?.recordOriginalResponse(id,token,result,usage,error?{code:error.code,message:error.message,retryable:error.retryable}:null,now);
  }
  async recover(now: number) {
    await this.batch('recover',null,[
      this.db
        .prepare(
          `UPDATE music_ai_review_attempts SET outcome='interrupted',finished_at=? WHERE outcome='running' AND started_at<=? AND NOT ${unknownHeld('music_ai_review_attempts.review_id')} AND NOT ${aiResumeExecutionHeldSql('music_ai_review_attempts.review_id')}`,
        )
        .bind(now, now - 240000),
      this.db
        .prepare(
          `UPDATE music_ai_reviews SET status=CASE WHEN attempts<3 THEN 'retry_wait' ELSE 'failed' END,lease_token=NULL,lease_until=NULL,next_retry_at=?,updated_at=?,error_code='interrupted',error_message='분석 작업이 중단되었습니다.' WHERE status='running' AND lease_until<=? AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionHeldSql('music_ai_reviews.id')}`,
        )
        .bind(now, now, now),
    ]);
    const rows = await this.db
      .prepare(
        `SELECT id FROM music_ai_reviews WHERE status IN ('queued','retry_wait') AND expires_at>? AND (next_retry_at IS NULL OR next_retry_at<=?) AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionHeldSql('music_ai_reviews.id')} ORDER BY created_at LIMIT 20`,
      )
      .bind(now, now)
      .all<{ id: string }>();
    return rows.results.map((r) => r.id);
  }
  async clearExpired(now: number) {
    const [r] = await this.batch('prune',null,[this.db
      .prepare(
        `DELETE FROM music_ai_reviews WHERE id IN (SELECT id FROM music_ai_reviews WHERE expires_at<=? AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionPendingSql('music_ai_reviews.id')} AND NOT ${contentRowHeldSql('music_ai_reviews')} LIMIT 20) RETURNING id`,
      )
      .bind(now)
      ]);
    return r.results.length;
  }
  async markDead(id: string, now: number) {
    await this.batch('dead',id,[this.db
      .prepare(
        `UPDATE music_ai_reviews SET status='failed',error_code='queue_exhausted',error_message='분석 큐 전달에 실패했습니다.',updated_at=? WHERE id=? AND status IN ('queued','retry_wait') AND NOT ${unknownHeld('music_ai_reviews.id')} AND NOT ${aiResumeExecutionPendingSql('music_ai_reviews.id')}`,
      )
      .bind(now, id)
      ]);
  }
}
