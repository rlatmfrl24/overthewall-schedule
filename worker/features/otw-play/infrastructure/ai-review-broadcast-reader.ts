import type { AiReviewBroadcastReader } from "../application/ports/ai-review";
import type { OtwPlayYouTubeMetadataReader } from "../application/ports/youtube-metadata";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";

export class AiReviewBroadcastMetadataReader implements AiReviewBroadcastReader {
  private readonly youtube: OtwPlayYouTubeMetadataReader;
  private readonly fetcher: typeof fetch;
  constructor(youtube: OtwPlayYouTubeMetadataReader, fetcher: typeof fetch = fetch) {
    this.youtube = youtube;
    this.fetcher = fetcher;
  }

  async read(url: string) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      const video = await this.youtube.readVideo(videoId);
      if (!video || video.privacyStatus !== "public") return null;
      return { platform: "youtube" as const, channelId: video.channelId, isBroadcast: Boolean(video.actualStartTime) };
    }
    const id = /^https:\/\/chzzk\.naver\.com\/video\/(\d+)(?:[?#].*)?$/u.exec(url)?.[1];
    if (!id) return null;
    const fetcher = this.fetcher;
    // The provider endpoint is constructed from a numeric ID, never a model URL.
    const response = await fetcher(`https://api.chzzk.naver.com/service/v3/videos/${id}`, {
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    if (!response.ok) return null;
    const body = await response.json() as { content?: { videoNo?: number; videoType?: string; channel?: { channelId?: string } } };
    const video = body.content;
    if (String(video?.videoNo) !== id || !video?.channel?.channelId) return null;
    return { platform: "chzzk" as const, channelId: video.channel.channelId, isBroadcast: video.videoType === "REPLAY" };
  }
}
