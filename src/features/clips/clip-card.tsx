import type { ChzzkClip, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock, Eye, PlayCircle, Scissors } from "lucide-react";

interface ClipCardProps {
  clip: ChzzkClip;
  member?: Member;
}

/**
 * 재생 시간(초)을 분:초 형식으로 변환
 */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
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
 * 클립 createdDate 형식: "2026-01-28 06:50:55"
 */
function formatRelativeDate(dateString: string): string {
  // 공백을 T로 변환하여 ISO 형식으로 파싱
  const date = new Date(dateString.replace(" ", "T"));
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
 * 날짜를 MM.DD 형식으로 변환
 * 클립 createdDate 형식: "2026-01-28 06:50:55"
 */
function formatAbsoluteDate(dateString: string): string {
  const date = new Date(dateString.replace(" ", "T"));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

/**
 * 상대 시간 + 절대 날짜 조합
 * 예: "3일 전 · 01.25"
 */
function formatDateCombined(dateString: string): string {
  const relative = formatRelativeDate(dateString);
  const absolute = formatAbsoluteDate(dateString);
  return `${relative} · ${absolute}`;
}

export const ClipCard = ({ clip, member }: ClipCardProps) => {
  const clipUrl = `https://chzzk.naver.com/clips/${clip.clipUID}`;
  const accentColor = member?.main_color;

  return (
    <a
      href={clipUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card border border-border/50 transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-1 hover:border-border",
        "w-[260px] shrink-0"
      )}
    >
      {/* 썸네일 */}
      <div className="relative overflow-hidden bg-muted aspect-video">
        {clip.thumbnailImageUrl ? (
          <img
            src={clip.thumbnailImageUrl}
            alt={clip.clipTitle}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Scissors className="w-10 h-10 text-muted-foreground/50" />
          </div>
        )}

        {/* 재생 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-300">
          <PlayCircle
            className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
          />
        </div>

        {/* 재생 시간 */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
          {formatDuration(clip.duration)}
        </div>

        {/* 멤버 뱃지 */}
        {member && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm"
            style={{
              backgroundColor: accentColor ? `${accentColor}cc` : "rgba(0,0,0,0.7)",
              color: "white",
            }}
          >
            {member.name}
          </div>
        )}

        {/* 클립 아이콘 */}
        <div className="absolute top-2 right-2 p-1 rounded-full bg-green-500/90 backdrop-blur-sm">
          <Scissors className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* 정보 */}
      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {clip.clipTitle}
        </h3>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatViewCount(clip.readCount)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDateCombined(clip.createdDate)}
          </span>
        </div>
      </div>
    </a>
  );
};
