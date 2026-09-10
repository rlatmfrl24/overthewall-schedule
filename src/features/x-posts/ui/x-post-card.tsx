import type { CSSProperties } from "react";
import SourceIcon from "@/assets/icon_x.svg";
import {
  type ReactNode,
  useMemo,
  useState,
} from "react";
import type { MemberDto } from "@contracts/members";
import type {
  XLinkedPostPreviewDto,
  XPostLinkDto,
} from "@contracts/x-posts";
import type { XPostViewModel } from "../model/types";
import IconX from "@/assets/icon_x.svg";
import { PostActions, PostHeader, PostImage, PostMedia, PostText } from "@/shared/ui/post-content";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  ExternalLink,
  Heart,
  ImageOff,
  MessageCircle,
  Repeat2,
  CornerDownRight,
} from "lucide-react";

interface XPostCardProps {
  post: XPostViewModel;
  member?: MemberDto;
  compactTime?: string;
  appearance?: "card" | "feed";
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

const formatAbsoluteDate = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "작성 시각 확인 불가";

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const XMediaGrid = ({ post }: { post: XPostViewModel }) => <PostMedia
  title={`${post.username}의 게시글`} url={post.url}
  items={post.media.map(item => {
    const src = item.type === "photo" ? item.url ?? item.previewImageUrl : item.previewImageUrl ?? item.url;
    return { src: src ?? "", alt: item.altText || `${post.username}의 첨부 이미지`, kind: item.type === "photo" ? "photo" as const : "video" as const };
  })}
/>;

const CONTENT_TOKEN_PATTERN =
  /https?:\/\/[^\s<>"']+|@[A-Za-z0-9_]{1,15}|#[\p{L}\p{N}_]+/gu;
const REPLY_MENTION_PREFIX_PATTERN =
  /^(?:@[A-Za-z0-9_]{1,15}(?:[ \t]+|(?=\r?\n|$)))+/;
const TRAILING_PUNCTUATION_PATTERN = /[),.?!;:]+$/;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

const trimUrlMatch = (value: string) => {
  const trailing = value.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
  return {
    url: trailing ? value.slice(0, -trailing.length) : value,
    trailing,
  };
};

const getLinkHref = (link?: XPostLinkDto | null) =>
  link?.resolvedUrl ?? link?.expandedUrl ?? link?.url ?? "#";

const toUrl = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    try {
      return new URL(`https://${normalized}`);
    } catch {
      return null;
    }
  }
};

const getLinkDomain = (link: XPostLinkDto) => {
  if (link.domain) return link.domain;

  try {
    return new URL(getLinkHref(link)).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return link.displayUrl ?? link.url;
  }
};

const isXStatusUrl = (value?: string | null) => {
  const url = toUrl(value);
  if (!url) return false;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") return false;

  const segments = url.pathname.split("/").filter(Boolean);
  return segments.some((segment, index) => {
    const normalized = segment.toLowerCase();
    return (
      (normalized === "status" || normalized === "statuses") &&
      Boolean(segments[index + 1]?.match(/^\d{5,25}/))
    );
  });
};

const extractXStatusId = (value?: string | null) => {
  const url = toUrl(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const statusIndex = segments.findIndex((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === "status" || normalized === "statuses";
  });
  return statusIndex >= 0
    ? segments[statusIndex + 1]?.match(/^\d{5,25}/)?.[0] ?? null
    : null;
};

const isXStatusLink = (link: XPostLinkDto) =>
  [
    link.resolvedUrl,
    link.expandedUrl,
    link.displayUrl,
    link.url,
  ].some((value) => isXStatusUrl(value));

const isLinkForPostId = (link: XPostLinkDto, postId?: string | null) =>
  Boolean(
    postId &&
      [link.resolvedUrl, link.expandedUrl, link.url].some(
        (value) => extractXStatusId(value) === postId,
      ),
  );

const isTcoOnlyLink = (link: XPostLinkDto) => {
  const domain = getLinkDomain(link);
  return (
    domain === "t.co" &&
    !link.title &&
    !link.description &&
    !link.imageUrl &&
    !link.displayUrl &&
    !link.expandedUrl &&
    !link.resolvedUrl
  );
};

const isPreviewRenderable = (link: XPostLinkDto) => {
  const href = getLinkHref(link);
  return (
    Boolean(href && href !== "#") &&
    link.previewStatus !== "skipped" &&
    !isTcoOnlyLink(link)
  );
};

const shouldShowLinkPreview = (link: XPostLinkDto) =>
  isPreviewRenderable(link) || isXStatusLink(link);

const isOwnDisplayedMedia = (post: XPostViewModel, link: XPostLinkDto) =>
  post.media.some(item => item.url || item.previewImageUrl) &&
  [link.resolvedUrl, link.expandedUrl, link.url].some(value => {
    const url = toUrl(value);
    return url && extractXStatusId(value) === post.id && /\/(photo|video)\/\d+\/?$/.test(url.pathname);
  });

const getPreviewLinks = (post: XPostViewModel) => {
  const seen = new Set<string>();
  const links: XPostLinkDto[] = [];

  for (const link of post.links ?? []) {
    const href = getLinkHref(link);
    if (isLinkForPostId(link, post.quote?.postId) || isOwnDisplayedMedia(post, link)) continue;
    if (!shouldShowLinkPreview(link)) continue;

    const key = href.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    links.push(link);
  }

  return links;
};

const XEmbeddedPostCard = ({
  post,
}: {
  post: XLinkedPostPreviewDto;
}) => {
  const linkedMedia = post.media
    .map((item) => ({ ...item, src: item.url ?? item.previewImageUrl }))
    .filter((item) => item.src);

  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${post.username === "i" ? "작성자 정보 확인 중" : post.name ?? `@${post.username}`} 게시글 열기`}
      className="block overflow-hidden rounded-xl border border-border/70 bg-muted/20 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-start gap-2.5 p-2.5">
        {post.profileImageUrl ? (
          <img
            src={post.profileImageUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold">
            X
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {post.username === "i" ? "작성자 정보 확인 중" : post.name ?? `@${post.username}`}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {post.username === "i" ? "" : `@${post.username}`}
              {post.createdAt ? ` · ${formatRelativeDate(post.createdAt)}` : ""}
            </span>
            <span className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
          {post.text ? (
            <div className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
              {post.text}
            </div>
          ) : null}
        </div>
      </div>
      {linkedMedia.length > 0 ? (
        <div
          className={cn(
            "grid border-t border-border/70 bg-background/40",
            linkedMedia.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {linkedMedia.slice(0, 4).map((item, index) => (
            <div
              key={`${item.mediaKey}-${index}`}
              className={cn(
                "relative min-h-0 bg-muted",
                linkedMedia.length === 1 ? "aspect-video" : "aspect-[4/3]",
              )}
            >
              {item.src ? (
                <PostImage
                  item={{ src: item.src, alt: item.altText || "인용 이미지", kind: "photo" }}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-6 w-6 text-muted-foreground/60" />
                </div>
              )}
              {index === 3 && linkedMedia.length > 4 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-base font-semibold text-white">
                  +{linkedMedia.length - 4}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </a>
  );
};

const XReplyPreviewCard = ({
  post,
  embedded = false,
}: {
  post: NonNullable<NonNullable<XPostViewModel["reply"]>["post"]>;
  embedded?: boolean;
}) => {
  const href = post.url;
  const handle = post.username === "i" ? null : `@${post.username}`;
  const author = handle ? post.name || handle : "작성자 정보 없음";
  const previewMedia = post.media
    .map((item) => ({ ...item, src: item.url ?? item.previewImageUrl }))
    .find((item) => Boolean(item.src));

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${author} 답글 원문 열기`}
      className={cn("flex min-h-11 min-w-0 items-start gap-2.5 p-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", embedded ? "pt-0" : "rounded-xl border border-border/70 bg-muted/15")}
    >
      {post.profileImageUrl ? (
        <img
          src={post.profileImageUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold">
          X
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate font-semibold text-foreground">
            {author}
          </span>
          {handle && author !== handle && <span className="truncate text-muted-foreground">{handle}</span>}
          {post.createdAt ? (
            <>
              <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                ·
              </span>
              <time
                dateTime={post.createdAt}
                title={formatAbsoluteDate(post.createdAt)}
                className="shrink-0 text-muted-foreground"
              >
                {formatRelativeDate(post.createdAt)}
              </time>
            </>
          ) : null}
        </div>
        {post.text ? (
          <div className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
            {post.text}
          </div>
        ) : null}
      </div>
      {previewMedia?.src ? (
        <img
          src={previewMedia.src}
          alt={previewMedia.altText || ""}
          className="h-14 w-14 shrink-0 rounded-lg border border-border/70 object-cover"
          loading="lazy"
        />
      ) : (
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </a>
  );
};

const XReplyContextCard = ({ memberName, reply, appearance }: { memberName?: string; reply: NonNullable<XPostViewModel["reply"]>; appearance?: "card" | "feed" }) => {
  const [expanded, setExpanded] = useState(false);
  const author = memberName || (reply.targetUsername && reply.targetUsername !== "i" ? `@${reply.targetUsername}` : reply.post?.username !== "i" ? reply.post?.name || reply.post?.username : null);
  if (appearance === "feed") return <div className="ml-1 flex min-w-0 gap-2.5">
    <CornerDownRight aria-hidden="true" className="mt-3 size-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <div className="flex min-h-9 items-center justify-between gap-2 px-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{author ? `${author}에게 답글` : "다른 게시글에 답글"}</span>
        {!reply.post && <a href={`https://x.com/i/web/status/${reply.postId}`} target="_blank" rel="noopener noreferrer" aria-label="답글 원문 열기" className="inline-flex min-h-11 shrink-0 items-center gap-1">대화 보기 <ExternalLink className="size-3" /></a>}
      </div>
      {reply.post && <XReplyPreviewCard embedded post={reply.post} />}
    </div>
  </div>;
  return <div className="text-xs text-muted-foreground">
    <div className="flex min-w-0 items-center gap-1">
      <MessageCircle className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{author ? `${author}에게 답글` : "다른 게시글에 답글"}</span>
      {reply.post ? <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "대화 접기" : "대화 보기"}</Button> :
        <a href={`https://x.com/i/web/status/${reply.postId}`} target="_blank" rel="noopener noreferrer" aria-label="답글 원문 열기" className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2">대화 보기 <ExternalLink className="size-3.5" /></a>}
    </div>
    {expanded && reply.post && <XReplyPreviewCard post={reply.post} />}
  </div>;
};

const XLinkPreviewCard = ({ link }: { link: XPostLinkDto }) => {
  const href = getLinkHref(link);
  const domain = getLinkDomain(link);
  const linkedPost = link.linkedPost ?? null;
  if (linkedPost) {
    return <XEmbeddedPostCard post={linkedPost} />;
  }

  if (isXStatusLink(link)) {
    const displayUrl = link.displayUrl ?? link.resolvedUrl ?? link.expandedUrl ?? href;

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${displayUrl} 열기`}
        className="block overflow-hidden rounded-lg border border-border/70 bg-muted/20 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-center gap-2 p-2.5">
          <span
            aria-label="X 게시글 링크"
            title="X 게시글 링크"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background"
          >
            <img src={IconX} alt="" className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">
              X 게시글 링크
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {displayUrl}
            </div>
          </div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </a>
    );
  }

  const title = link.title ?? link.displayUrl ?? domain;
  const description = link.description;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${title} 열기`}
      className="flex min-h-16 overflow-hidden rounded-lg border border-border/70 bg-muted/20 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {link.imageUrl ? (
        <div className="h-auto w-20 shrink-0 bg-muted sm:w-28">
          <PostImage
            item={{ src: link.imageUrl, alt: "링크 미리보기", kind: "photo" }}
            className="h-full min-h-16 w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="truncate">{link.siteName ?? domain}</span>
          <span className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
          </span>
        </div>
        <div className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground">
          {title}
        </div>
        {description ? (
          <div className="line-clamp-1 break-words text-xs leading-5 text-muted-foreground">
            {description}
          </div>
        ) : (
          <div className="truncate text-xs text-muted-foreground">
            {link.displayUrl ?? href}
          </div>
        )}
      </div>
    </a>
  );
};

const XQuotePostCard = ({ post }: { post: XPostViewModel }) => {
  if (!post.quote) return null;
  if (post.quote.post) {
    return <XEmbeddedPostCard post={post.quote.post} />;
  }

  const href = `https://x.com/i/web/status/${post.quote.postId}`;
  return (
    <XLinkPreviewCard
      link={{
        url: href,
        expandedUrl: href,
        displayUrl: `x.com/i/web/status/${post.quote.postId}`,
        previewStatus: "unavailable",
      }}
    />
  );
};

const XLinkPreviewList = ({ post }: { post: XPostViewModel }) => {
  const links = getPreviewLinks(post);
  if (links.length === 0) return null;

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <XLinkPreviewCard key={getLinkHref(link)} link={link} />
      ))}
    </div>
  );
};

const stripReplyMentionPrefix = (post: XPostViewModel) => {
  if (!post.reply) return post.text;
  return post.text
    .replace(REPLY_MENTION_PREFIX_PATTERN, "")
    .replace(/^\r?\n/, "");
};

const renderPostText = (post: XPostViewModel, text = post.text) => {
  const linksByUrl = new Map(
    (post.links ?? []).flatMap((link) => [link.url, link.expandedUrl, link.resolvedUrl].filter((url): url is string => Boolean(url)).map(url => [url, link] as const)),
  );
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CONTENT_TOKEN_PATTERN)) {
    const rawMatch = match[0];
    const startIndex = match.index ?? 0;
    const isUrl = rawMatch.startsWith("http");
    const previousCharacter = text[startIndex - 1] ?? "";
    const nextCharacter = text[startIndex + rawMatch.length] ?? "";
    if (
      !isUrl &&
      (WORD_CHARACTER_PATTERN.test(previousCharacter) ||
        WORD_CHARACTER_PATTERN.test(nextCharacter))
    ) {
      continue;
    }

    if (startIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, startIndex));
    }

    if (isUrl) {
      const { url, trailing } = trimUrlMatch(rawMatch);
      const link = linksByUrl.get(url);
      if (!link || !(isLinkForPostId(link, post.quote?.postId) || isOwnDisplayedMedia(post, link) || shouldShowLinkPreview(link))) {
        nodes.push(<a key={`${url}-${startIndex}`} href={link ? getLinkHref(link) : url} title={link?.displayUrl ?? url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{url}</a>);
      }
      if (trailing) nodes.push(trailing);
    } else {
      const value = rawMatch.slice(1);
      const href = rawMatch.startsWith("@")
        ? `https://x.com/${value}`
        : `https://x.com/hashtag/${encodeURIComponent(value)}`;
      nodes.push(
        <a
          key={`${rawMatch}-${startIndex}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary/80"
        >
          {rawMatch}
        </a>,
      );
    }

    lastIndex = startIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const XMetricItem = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) => (
  <span
    aria-label={`${label} ${value}개`}
    title={`${label} ${value}개`}
    className="inline-flex min-w-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
  >
    {icon}
    {value > 0 ? <span>{formatMetric(value)}</span> : null}
  </span>
);

export const XPostCard = ({ post, member, compactTime, appearance = "card" }: XPostCardProps) => {
  const displayText = useMemo(() => stripReplyMentionPrefix(post), [post]);
  const name = member?.name ?? post.username;
  const title = `${name}의 X 게시글`;
  return <article aria-label={title} className={cn("relative min-w-0 overflow-hidden", appearance === "feed" ? "space-y-1.5 border-b border-border/60 bg-background px-3.5 py-2.5 sm:px-[18px]" : "space-y-2.5 rounded-lg border border-border/70 bg-card p-3 shadow-sm sm:p-4", appearance === "feed" ? "after:pointer-events-none after:absolute after:inset-y-0 after:left-1 after:w-[3px] after:rounded-full after:bg-[var(--post-accent)]" : "border-l-4")} style={{ "--post-accent": member?.main_color ?? "transparent", borderLeftColor: appearance === "card" ? member?.main_color ?? "transparent" : undefined } as CSSProperties}>
    <PostHeader appearance={appearance} name={name} profileSrc={member ? `/profile/${member.code}.webp` : undefined} accent={member?.main_color ?? undefined} source="X" sourceIcon={<img src={SourceIcon} alt="X" className="size-4 object-contain dark:invert" />} secondary={`@${post.username}`} time={compactTime ?? formatRelativeDate(post.createdAt)} dateTime={post.createdAt} />
    {displayText && <PostText>{renderPostText(post, displayText)}</PostText>}
    {post.reply && <XReplyContextCard appearance={appearance} memberName={post.replyTargetMemberName} reply={post.reply} />}
    <XQuotePostCard post={post} />
    <XLinkPreviewList post={post} />
    <XMediaGrid post={post} />
    <PostActions appearance={appearance} url={post.url} title={title} text={post.text}>
      <XMetricItem icon={<MessageCircle className="size-3.5" />} label="답글" value={post.metrics.replyCount} />
      <XMetricItem icon={<Repeat2 className="size-3.5" />} label="재게시" value={post.metrics.repostCount + post.metrics.quoteCount} />
      <XMetricItem icon={<Heart className="size-3.5" />} label="좋아요" value={post.metrics.likeCount} />
    </PostActions>
  </article>;
};
