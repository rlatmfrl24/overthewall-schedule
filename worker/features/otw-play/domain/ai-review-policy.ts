export const AI_REVIEW_PROMPT_VERSION = "4";

export interface AiReviewMember {
  uid: number;
  name: string;
  aliases: string[];
  youtubeChannelIds: string[];
  youtubeVodChannelIds: string[];
  chzzkChannelId?: string | null;
}
