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
  const avatarSrc = member
    ? `/profile/${member.code}.webp`
    : video.channel.channelImageUrl;
  const showMemberAvatar = showMemberBadge && Boolean(channelName);

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
        "group relative flex min-w-0 self-start flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md",
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 via-black/15 to-transparent" />

        {/* 재생 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/30">
          <span className="rounded-full bg-black/45 p-2 opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
            <PlayCircle className="h-9 w-9 text-white" />
          </span>
        </div>

        {/* 재생 시간 */}
        <div className="absolute bottom-2 right-2 rounded bg-black/85 px-1.5 py-0.5 text-xs font-semibold text-white shadow-sm">
          {formatDuration(video.duration)}
        </div>

        {/* 카테고리 뱃지 */}
        {video.videoCategoryValue && (
          <div className="absolute right-2 top-2 max-w-[65%] truncate rounded-full bg-black/85 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
            {video.videoCategoryValue}
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex min-w-0 flex-col gap-3 p-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {video.videoTitle}
        </h3>

        <div className="flex min-w-0 items-center gap-2.5">
          {showMemberAvatar && (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground"
              style={{
                borderColor: accentColor || undefined,
              }}
              title={channelName}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{channelName.charAt(0)}</span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {channelName && (
              <p className="truncate text-[13px] font-semibold text-foreground/85">
                {channelName}
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
        </div>
      </div>
    </a>
  );
};
