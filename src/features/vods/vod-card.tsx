import type { ChzzkVideo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock, Eye, PlayCircle } from "lucide-react";

interface VodCardProps {
  video: ChzzkVideo;
  accentColor?: string;
  size?: "sm" | "md" | "lg";
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

/**
 * 썸네일 URL의 {type} 플레이스홀더를 실제 크기로 변환
 */
function getThumbnailUrl(url: string | null | undefined, size: "480" | "720" | "1080" = "480"): string {
  if (!url) return "";
  return url.replace("{type}", size);
}

export const VodCard = ({ video, accentColor, size = "md" }: VodCardProps) => {
  const videoUrl = `https://chzzk.naver.com/video/${video.videoNo}`;

  const sizeClasses = {
    sm: "w-full",
    md: "w-full",
    lg: "w-full",
  };

  const thumbnailAspect = {
    sm: "aspect-video",
    md: "aspect-video",
    lg: "aspect-video",
  };

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card border border-border/50 transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-1 hover:border-border",
        sizeClasses[size]
      )}
    >
      {/* 썸네일 */}
      <div className={cn("relative overflow-hidden bg-muted", thumbnailAspect[size])}>
        {video.thumbnailImageUrl ? (
          <img
            src={getThumbnailUrl(video.thumbnailImageUrl)}
            alt={video.videoTitle}
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
            className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
          />
        </div>

        {/* 재생 시간 */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
          {formatDuration(video.duration)}
        </div>

        {/* 카테고리 뱃지 */}
        {video.videoCategoryValue && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm"
            style={{
              backgroundColor: accentColor ? `${accentColor}cc` : "rgba(0,0,0,0.7)",
              color: "white",
            }}
          >
            {video.videoCategoryValue}
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {video.videoTitle}
        </h3>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatViewCount(video.readCount)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeDate(video.publishDate)}
          </span>
        </div>
      </div>
    </a>
  );
};
