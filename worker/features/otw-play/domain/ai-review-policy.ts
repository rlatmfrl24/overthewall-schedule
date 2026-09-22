export const AI_REVIEW_PROMPT_VERSION = "6";
// v6 explicitly requests one new genre when no preferred genre fits.
// Keep completed v4/v5 results usable; do not force a paid re-analysis on read.
export const isAiReviewPromptSupported = (version: string | undefined) => version === "4" || version === "5" || version === AI_REVIEW_PROMPT_VERSION;

export interface AiReviewMember {
  uid: number;
  name: string;
  aliases: string[];
  youtubeChannelIds: string[];
  youtubeVodChannelIds: string[];
  chzzkChannelId?: string | null;
}
