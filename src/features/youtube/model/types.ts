import type {
  YouTubeVideoDto,
  YouTubeVideosResponseDto,
} from "@contracts/youtube";

export type YouTubeVideo = YouTubeVideoDto & {
  memberUid?: number;
};

export type YouTubeVideosResponse = Omit<
  YouTubeVideosResponseDto,
  "videos" | "shorts"
> & {
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
};
