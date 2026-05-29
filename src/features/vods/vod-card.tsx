import type { ChzzkVideo, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock, Eye, PlayCircle } from "lucide-react";

interface VodCardProps {
  video: ChzzkVideo;
  accentColor?: string;
  size?: "sm" | "md" | "lg";
  member?: Member;
  showMemberBadge?: boolean;
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
function getThumbnailUrl(
  url: string | null | undefined,
  size: "480" | "720" | "1080" = "480",
): string {
  if (!url) return "";
  return url.replace("{type}", size);
}

export const VodCard = ({
  video,
  accentColor: accentColorProp,
  size = "md",
  member,
  showMemberBadge = false,
}: VodCardProps) => {
  const videoUrl = `https://chzzk.naver.com/video/${video.videoNo}`;
  const accentColor = member?.main_color || accentColorProp;
  const channelName = member?.name || video.channel.channelName;
  const showMemberChip = showMemberBadge && Boolean(member);

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
      aria-label={`${video.videoTitle} 다시보기 보기`}
      title={video.videoTitle}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-300",
        "hover:-translate-y-1 hover:border-border hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        sizeClasses[size],
      )}
    >
      {/* 썸네일 */}
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          thumbnailAspect[size],
        )}
      >
        {video.thumbnailImageUrl ? (
          <img
            src={getThumbnailUrl(video.thumbnailImageUrl)}
            alt={video.videoTitle}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <PlayCircle className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}

        {/* 재생 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/30">
          <PlayCircle
            className="h-12 w-12 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
          />
        </div>

        {/* 재생 시간 */}
        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.duration)}
        </div>

        {/* 멤버 뱃지 */}
        {showMemberChip && member && (
          <div
            className="absolute left-2 top-2 flex max-w-[calc(100%-5.25rem)] items-center gap-1.5 rounded-full px-1.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-md"
            style={{
              backgroundColor: accentColor
                ? `${accentColor}dd`
                : "rgba(0,0,0,0.7)",
            }}
          >
            <img
              src={`/profile/${member.code}.webp`}
              alt=""
              className="h-5 w-5 rounded-full border border-white/50 object-cover"
            />
            <span className="truncate pr-1">{member.name}</span>
          </div>
        )}

        {/* 카테고리 뱃지 */}
        {video.videoCategoryValue && (
          <div
            className={cn(
              "absolute top-2 max-w-[45%] truncate rounded-full px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm",
              showMemberChip ? "right-2" : "left-2",
            )}
            style={{
              backgroundColor: accentColor
                ? `${accentColor}cc`
                : "rgba(0,0,0,0.7)",
            }}
          >
            {video.videoCategoryValue}
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
          {video.videoTitle}
        </h3>

        {channelName && (
          <p className="truncate text-xs text-muted-foreground">
            {channelName}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {formatViewCount(video.readCount)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeDate(video.publishDate)}
          </span>
        </div>
      </div>
    </a>
  );
};
