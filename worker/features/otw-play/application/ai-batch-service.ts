import type { AiBatchSelection } from "@contracts/otw-play-ai-batch";
import { isAiReviewPending } from "@contracts/otw-play-ai-review";
import { AiReviewError } from "./ports/ai-review";
import type { AiBatchRepository } from "./ports/ai-batch";
import type { AiReviewService } from "./ai-review-service";
import type { AiReviewContext } from "./ports/ai-review";
import { resolveAiReviewCatalog } from "../domain/ai-review-result";

export class AiBatchService {
  private readonly repository: AiBatchRepository;
  private readonly analysis: AiReviewService;
  private readonly send: (id: string) => Promise<void>;
  private readonly enabled: boolean;
  private readonly id: () => string;
  private readonly clock: () => number;
  private readonly context: AiReviewContext;
  constructor(repository: AiBatchRepository, analysis: AiReviewService,
    send: (id: string) => Promise<void>, enabled: boolean,
    id: () => string, clock: () => number, context: AiReviewContext) {
    this.repository = repository; this.analysis = analysis; this.send = send; this.enabled = enabled;
    this.id = id; this.clock = clock; this.context = context;
  }

  preview(selection: AiBatchSelection) { return this.repository.preview(selection); }
  list() { return this.repository.list(); }
  get(id: string, cursor?: string) { return this.repository.get(id, cursor); }
  async draft(id: string) {
    const draft = await this.repository.draft(id);
    return draft ? { ...draft, result: resolveAiReviewCatalog(draft.result, await this.context.catalog()) } : null;
  }
  dead(id: string) { return this.repository.dead(id, this.clock()); }
  async start(selection: AiBatchSelection, key: string, actor: string) {
    if (!this.enabled) throw new AiReviewError("ai_unconfigured", "AI 자동 채우기가 설정되지 않았습니다.", 503);
    const batch = await this.repository.create(this.id(), actor, key, selection, this.clock());
    await this.recover(batch.id);
    return batch;
  }
  async retry(id: string) {
    await this.repository.retry(id, this.clock());
    await this.recover(id);
    return this.get(id);
  }
  async recover(batchId?: string) {
    let queued = 0, failed = 0;
    if (!this.enabled) return { queued, failed };
    for (const id of await this.repository.pending(this.clock(), batchId)) {
      try { await this.send(id); queued++; } catch { failed++; }
    }
    return { queued, failed };
  }
  async process(id: string) {
    if (!this.enabled) return;
    const token = this.id();
    const item = await this.repository.claim(id, token, this.clock());
    if (!item) return;
    try {
      if (!await this.repository.current(item)) {
        await this.repository.finish(id, token, "changed", "요청 후 후보가 변경되었습니다. 최신 내용을 확인하세요.", this.clock());
        return;
      }
      let result = item.result;
      if (!result) {
        let reviewId = item.reviewId;
        if (!reviewId) {
          const review = await this.analysis.start({ target: { candidateId: item.candidateId }, range: null,
            idempotencyKey: `batch-${id}-${item.generation}` }, item.actor);
          reviewId = review.id;
          await this.repository.attach(id, token, reviewId, this.clock());
        }
        await this.analysis.process(reviewId);
        const review = await this.analysis.get(reviewId);
        if (isAiReviewPending(review.status)) {
          await this.repository.attach(id, token, reviewId, this.clock(), { message: review.errorMessage, retryAt: review.nextRetryAt });
          return Math.max(30, Math.ceil(((review.nextRetryAt ?? this.clock() + 30000) - this.clock()) / 1000));
        }
        if (!review.result) {
          await this.repository.finish(id, token, "failed", review.errorMessage ?? "AI 분석 결과를 준비하지 못했습니다.", this.clock());
          return;
        }
        result = review.result;
        // Persist the expensive result before finalizing the draft. A retry only saves.
        await this.repository.capture(id, token, result, this.clock());
      }
      const song = result.songs[0]?.values.song, participants = result.songs[0]?.values.participants;
      const needsChoice = result.songs.length !== 1 || !song || (!song.existingSongId &&
        (song.candidates.length > 0 || !song.originalArtists.length || song.originalArtists.some(p => !p.subject))) ||
        !participants?.length || participants.some(p => !p.subject);
      await this.repository.finish(id, token, needsChoice ? "needs_selection" : "saved", null, this.clock());
    } catch (error) {
      if (error instanceof AiReviewError && !error.retryable && error.status < 500) {
        await this.repository.finish(id, token, "failed", error.message, this.clock());
      } else throw error;
    } finally {
      await this.repository.release(id, token, this.clock());
    }
  }
}
