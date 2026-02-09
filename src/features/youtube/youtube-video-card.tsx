import type { YouTubeVideo, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock, Eye, PlayCircle } from "lucide-react";
import IconYoutubeShorts from "@/assets/icon_youtube_shorts.svg";

interface YouTubeVideoCardProps {
  video: YouTubeVideo;
  member?: Member;
  variant?: "default" | "short";
  size?: "sm" | "md";
}

/**
 * 재생 시간(초)을 시:분:초 형식으로 변환
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 조회수를 읽기 쉬운 형식으로 변환
 */
function formatViewCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}만회`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}천회`;
  }
  return `${count}회`;
}

/**
 * 날짜를 상대적 시간으로 변환
 */
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}

export const YouTubeVideoCard = ({
  video,
  member,
  variant = "default",
  size = "md",
}: YouTubeVideoCardProps) => {
  const videoUrl = video.isShort
    ? `https://www.youtube.com/shorts/${video.videoId}`
    : `https://www.youtube.com/watch?v=${video.videoId}`;

  const isShort = variant === "short" || video.isShort;
  const accentColor = member?.main_color;

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card border border-border/50 transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-1 hover:border-border",
        isShort ? "w-[140px] shrink-0" : "w-[280px] shrink-0",
        size === "sm" && !isShort && "w-[220px]",
      )}
    >
      {/* 썸네일 */}
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          isShort ? "aspect-9/16" : "aspect-video",
        )}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <PlayCircle className="w-12 h-12 text-muted-foreground/50" />
          </div>
        )}

        {/* 재생 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-300">
          <PlayCircle
            className={cn(
              "text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300",
              isShort ? "w-8 h-8" : "w-12 h-12",
            )}
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
          />
        </div>

        {/* 재생 시간 */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
          {formatDuration(video.duration)}
        </div>

        {/* 멤버 뱃지 */}
        {member && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm"
            style={{
              backgroundColor: accentColor
                ? `${accentColor}cc`
                : "rgba(0,0,0,0.7)",
              color: "white",
            }}
          >
            {member.name}
          </div>
        )}

        {/* Shorts 아이콘 배지 */}
        {isShort && (
          <div className="absolute top-2 right-1.5 p-1">
            <img
              src={IconYoutubeShorts}
              alt="YouTube Shorts"
              className="w-3 h-3"
            />
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className={cn("flex flex-col gap-1.5 p-3", isShort && "p-2")}>
        <h3
          className={cn(
            "font-semibold text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors",
            isShort ? "text-xs" : "text-sm",
          )}
        >
          {video.title}
        </h3>

        <div
          className={cn(
            "flex items-center gap-2 text-muted-foreground",
            isShort ? "text-[10px]" : "text-xs",
          )}
        >
          <span className="flex items-center gap-1">
            <Eye className={cn(isShort ? "w-2.5 h-2.5" : "w-3 h-3")} />
            {formatViewCount(video.viewCount)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className={cn(isShort ? "w-2.5 h-2.5" : "w-3 h-3")} />
            {formatRelativeDate(video.publishedAt)}
          </span>
        </div>
      </div>
    </a>
  );
};
