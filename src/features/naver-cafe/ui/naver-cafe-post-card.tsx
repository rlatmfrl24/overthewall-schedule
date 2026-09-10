import type { CSSProperties } from "react";
import SourceIcon from "@/assets/icon_naver_cafe.svg";
import { cn } from "@/shared/lib/utils";
import type { MemberDto } from "@contracts/members";
import type { NaverCafePostDto } from "@contracts/naver-cafe";
import { Eye, Heart, MessageCircle } from "lucide-react";
import { PostActions, PostHeader, PostMedia, PostText } from "@/shared/ui/post-content";

interface NaverCafePostCardProps { post: NaverCafePostDto; member?: MemberDto; compactTime?: string; appearance?: "card" | "feed" }
const formatMetric = (value: number) => new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const NaverCafePostCard = ({ post, member, compactTime, appearance = "card" }: NaverCafePostCardProps) => {
  const name = member?.name ?? post.sourceName;
  const title = `${name}의 카페 게시글`;
  const accent = member?.main_color || "#03c75a";
  return <article aria-label={title} className={cn("relative min-w-0 overflow-hidden", appearance === "feed" ? "space-y-1.5 border-b border-border/60 bg-background px-3.5 py-2.5 sm:px-[18px]" : "space-y-2.5 rounded-lg border border-border/70 bg-card p-3 shadow-sm sm:p-4", appearance === "feed" ? "after:pointer-events-none after:absolute after:inset-y-0 after:left-1 after:w-[3px] after:rounded-full after:bg-[var(--post-accent)]" : "border-l-4")} style={{ "--post-accent": accent, borderLeftColor: appearance === "card" ? accent : undefined } as CSSProperties}>
    <PostHeader appearance={appearance} name={name} profileSrc={member ? `/profile/${member.code}.webp` : undefined} accent={accent} source="카페" sourceIcon={<img src={SourceIcon} alt="네이버 카페" className="size-4 object-contain" />} time={compactTime ?? new Date(post.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} dateTime={post.createdAt} newPost={post.isNew} />
    <h4 className="break-words text-[15px] font-semibold leading-6">{post.title}</h4>
    {post.summary && <PostText lines={3}>{post.summary}</PostText>}
    {post.thumbnailUrl && <PostMedia title={post.title} url={post.url} items={[{ src: post.thumbnailUrl, alt: `${post.title} 첨부 이미지`, kind: "photo" }]} />}
    <PostActions appearance={appearance} title={title} url={post.url} text={post.title}>
      <span className="inline-flex items-center gap-1.5" aria-label={`댓글 ${post.metrics.commentCount}개`}><MessageCircle className="size-3.5" />{formatMetric(post.metrics.commentCount)}</span>
      <span className="inline-flex items-center gap-1.5" aria-label={`조회 ${post.metrics.readCount}회`}><Eye className="size-3.5" />{formatMetric(post.metrics.readCount)}</span>
      <span className="inline-flex items-center gap-1.5" aria-label={`좋아요 ${post.metrics.likeCount}개`}><Heart className="size-3.5" />{formatMetric(post.metrics.likeCount)}</span>
    </PostActions>
  </article>;
};
