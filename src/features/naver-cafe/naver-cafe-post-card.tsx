import type { Member, NaverCafePost } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Coffee,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
} from "lucide-react";

interface NaverCafePostCardProps {
  post: NaverCafePost;
  member?: Member;
  compactTime?: string;
}

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value: number) => numberFormatter.format(value);

const formatRelativeDate = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
};

export const NaverCafePostCard = ({
  post,
  member,
  compactTime,
}: NaverCafePostCardProps) => {
  const profileSrc = member ? `/profile/${member.code}.webp` : null;
  const accentColor = member?.main_color || "#03c75a";
  const authorName = member?.name ?? post.sourceName;

  return (
    <article className="group relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-lg border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md sm:p-5">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accentColor }}
        aria-hidden="true"
      />

      <div className="flex min-w-0 items-start justify-between gap-3 pl-1">
        <div className="flex min-w-0 items-center gap-3">
          {profileSrc ? (
            <img
              src={profileSrc}
              alt={authorName}
              className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-700">
              N
            </div>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
              <h2 className="truncate text-sm font-semibold text-foreground">
                {authorName}
              </h2>
              {post.isNew ? (
                <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  N
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-label="네이버 카페 게시글"
                title="네이버 카페 게시글"
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-emerald-600"
              >
                <Coffee className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">
                {post.sourceName} ·{" "}
                {compactTime ?? formatRelativeDate(post.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground sm:px-3"
        >
          <a href={post.url} target="_blank" rel="noopener noreferrer">
            <span className="hidden sm:inline">카페에서 보기</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <div className="space-y-2 pl-1">
        <h3 className="break-words text-base font-semibold leading-7 text-foreground">
          {post.title}
        </h3>
        {post.summary ? (
          <p className="line-clamp-4 whitespace-pre-wrap break-all text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {post.summary}
          </p>
        ) : null}
      </div>

      {post.thumbnailUrl ? (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 block overflow-hidden rounded-lg border border-border/70 bg-muted"
        >
          <img
            src={post.thumbnailUrl}
            alt=""
            className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/70 pl-1 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.commentCount)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.readCount)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.likeCount)}
        </span>
      </div>
    </article>
  );
};
