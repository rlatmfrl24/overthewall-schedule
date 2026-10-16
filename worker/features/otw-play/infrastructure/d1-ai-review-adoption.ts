import type { AiReviewAdoption } from '../../content-transition';

/** Preserve selected original pending rows at the stop boundary. The owning
 * classifier keeps known unissued continuation separate from POST uncertainty. */
export class D1AiReviewAdoption implements AiReviewAdoption {
  private readonly db:D1Database;
  constructor(db:D1Database){this.db=db;}
  async adoptPending(id:string,adopt:(reviewId:string)=>Promise<void>) {
    let cursor='';
    for(;;) {
      const rows=(await this.db.prepare(`SELECT r.id FROM music_ai_reviews r JOIN content_transitions t ON t.id=?
        WHERE r.id>? AND r.status IN ('queued','retry_wait','running') AND r.result_json IS NULL
          AND NOT EXISTS(SELECT 1 FROM music_ai_review_batch_items i WHERE i.review_id=r.id)
          AND (t.phase='prepared' AND t.maintenance_state='draining' AND EXISTS(SELECT 1 FROM content_transition_prepared_validation_membership m WHERE m.transition_id=t.id AND m.row_table='music_ai_reviews' AND m.row_key=json_array(r.id))
            OR t.phase<>'prepared' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_ai_reviews' AND m.row_key=json_array(r.id)))
          AND (r.status<>'running' OR EXISTS(SELECT 1 FROM music_ai_review_attempts a WHERE a.review_id=r.id AND a.token=r.lease_token AND a.outcome='running'))
          AND NOT EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.ai.unknown','otw-play.ai.resume') AND json_extract(o.envelope_json,'$.sourceCommand.payload.reviewId')=r.id)
        ORDER BY r.id LIMIT 20`).bind(id,cursor).all<{id:string}>()).results;
      for(const row of rows) await adopt(row.id);
      if(rows.length<20) return;
      cursor=rows.at(-1)!.id;
    }
  }
}
