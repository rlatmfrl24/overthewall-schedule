import type { Env } from "./types";

export const isOtwPlayAiExecutionAvailable = (env: Env) =>
  env.OTW_PLAY_AI_REVIEW_PAUSED === "false" &&
  env.OTW_PLAY_AI_REVIEW_ENABLED === "true" &&
  Boolean(env.GEMINI_API_KEY && env.OTW_PLAY_AI_REVIEW_QUEUE);
