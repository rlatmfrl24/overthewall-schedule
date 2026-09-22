import { OTW_PLAY_RECOMMENDED_SONG_TAGS } from "@contracts/otw-play-tags";
import type { AiReviewInput } from "./ports/ai-review";

// The prompt and reuse key share exactly the evidence sent for analysis.
// Thumbnail, playback availability and internal IDs do not affect the analysis.
export function buildAiReviewData({ video, range, candidateKind, members }: AiReviewInput) {
  const asTimecode = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const parts = seconds >= 3600 ? [Math.floor(seconds / 3600), minutes % 60, seconds % 60] : [minutes, seconds % 60];
    return parts.map(part => part.toString().padStart(2, "0")).join(":");
  };
  return {
    kind: candidateKind,
    interval: { startTime: asTimecode(range?.startSeconds ?? 0), endTime: asTimecode(range?.endSeconds ?? video.durationSeconds ?? 0) },
    title: video.title,
    description: video.description ?? "",
    tags: [...new Set(video.tags ?? [])].sort(),
    channelTitle: video.channelTitle,
    uploadedAt: video.publishedAt,
    broadcastStartedAt: video.actualStartTime ?? null,
    memberNamesAndAliases: members.map(({ name, aliases }) => [name, ...new Set(aliases.filter(alias => alias !== name).sort())])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
    preferredSongTags: OTW_PLAY_RECOMMENDED_SONG_TAGS,
  };
}
