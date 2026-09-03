import type {
  YouTubeVideoDto,
  YouTubeShortsResponseDto,
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

export type YouTubeShortsResponse = Omit<
  YouTubeShortsResponseDto,
  "items"
> & {
  items: YouTubeVideo[];
};
