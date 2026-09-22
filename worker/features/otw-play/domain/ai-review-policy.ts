export const AI_REVIEW_PROMPT_VERSION = "5";
// v5 compacts instructions without changing the evidence/result contract.
// Keep completed v4 results usable; do not force a paid re-analysis on read.
export const isAiReviewPromptSupported = (version: string | undefined) => version === "4" || version === AI_REVIEW_PROMPT_VERSION;

export interface AiReviewMember {
  uid: number;
  name: string;
  aliases: string[];
  youtubeChannelIds: string[];
  youtubeVodChannelIds: string[];
  chzzkChannelId?: string | null;
}
