import {
  AiReviewService,
  D1AiReviewRepository,
  D1AiReviewContext,
  GeminiReviewAnalyzer,
  YouTubeOtwPlayMetadataReader,
  AiReviewBroadcastMetadataReader,
} from "../features/otw-play";
import type { Env } from "../platform/types";

export const createOtwPlayAiReviewService = (env: Env) => {
  const model = env.OTW_PLAY_AI_REVIEW_MODEL || "gemini-3.8-flash";
  const metadata = new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
    db: env.otw_db, priority: "core", origin: "otw_play_ai_review",
  });
  return new AiReviewService(
    new D1AiReviewRepository(env.otw_db),
    metadata,
    new GeminiReviewAnalyzer(env.GEMINI_API_KEY ?? "", model),
    new D1AiReviewContext(env.otw_db),
    {
      send: async (id) => {
        if (!env.OTW_PLAY_AI_REVIEW_QUEUE)
          throw new Error("AI queue unconfigured");
        await env.OTW_PLAY_AI_REVIEW_QUEUE.send({
          kind: "otw_play_ai_review",
          schemaVersion: 1,
          reviewId: id,
        });
      },
    },
    {
      enabled:
        env.OTW_PLAY_AI_REVIEW_ENABLED === "true" &&
        Boolean(env.GEMINI_API_KEY && env.OTW_PLAY_AI_REVIEW_QUEUE),
      model,
      dailyLimit: Math.max(
        1,
        Math.min(
          10000,
          Math.floor(Number(env.OTW_PLAY_AI_REVIEW_DAILY_LIMIT) || 100),
        ),
      ),
    },
    async (value) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(value),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
    () => crypto.randomUUID(),
    Date.now,
    new AiReviewBroadcastMetadataReader(metadata),
  );
};
export const isAiReviewMessage = (
  body: unknown,
): body is { kind: "otw_play_ai_review"; schemaVersion: 1; reviewId: string } =>
  Boolean(
    body &&
      typeof body === "object" &&
      (body as { kind?: unknown }).kind === "otw_play_ai_review" &&
      (body as { schemaVersion?: unknown }).schemaVersion === 1 &&
      typeof (body as { reviewId?: unknown }).reviewId === "string",
  );
export async function handleAiReviewQueue(
  batch: MessageBatch<unknown>,
  env: Env,
) {
  const service = createOtwPlayAiReviewService(env);
  for (const message of batch.messages) {
    if (!isAiReviewMessage(message.body)) {
      message.ack();
      continue;
    }
    if (
      env.OTW_PLAY_AI_REVIEW_ENABLED !== "true" ||
      !env.GEMINI_API_KEY ||
      !env.OTW_PLAY_AI_REVIEW_QUEUE
    ) {
      // Durable pending jobs are recovered by maintenance after re-enabling.
      message.ack();
      continue;
    }
    try {
      if (batch.queue === "otw-dead-letter")
        await service.markDead(message.body.reviewId);
      else await service.process(message.body.reviewId);
      const state = await service.get(message.body.reviewId);
      if (
        batch.queue !== "otw-dead-letter" &&
        ["queued", "retry_wait", "running"].includes(state.status)
      )
        message.retry({
          delaySeconds: Math.min(
            43200,
            Math.max(
              30,
              Math.ceil(
                ((state.nextRetryAt ?? Date.now() + 30000) - Date.now()) / 1000,
              ),
            ),
          ),
        });
      else message.ack();
    } catch {
      message.retry({ delaySeconds: 60 });
    }
  }
}
