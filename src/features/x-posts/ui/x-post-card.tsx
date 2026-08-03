import {
  type KeyboardEvent,
  type MouseEvent,
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
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  ExternalLink,
  Heart,
  ImageOff,
  MessageCircle,
  Repeat2,
  Share2,
} from "lucide-react";

interface XPostCardProps {
  post: XPostViewModel;
  member?: MemberDto;
  compactTime?: string;
  openPostOnCardClick?: boolean;
  showExternalLinkButton?: boolean;
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

const XMediaGrid = ({ post }: { post: XPostViewModel }) => {
  const media = post.media
    .map((item) => ({
      ...item,
      src: item.url ?? item.previewImageUrl,
    }))
    .filter((item) => item.src);

  if (media.length === 0) return null;

  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-lg border border-border/70 bg-muted/30",
        media.length === 1 ? "grid-cols-1" : "grid-cols-2",
      )}
    >
      {media.slice(0, 4).map((item, index) => (
        <div
          key={`${item.mediaKey}-${index}`}
          className={cn(
            "relative min-h-0 bg-muted",
            media.length === 1 ? "aspect-video" : "aspect-[4/3]",
          )}
        >
          {item.src ? (
            <img
              src={item.src}
              alt={item.altText || "X post media"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground/60" />
            </div>
          )}
          {index === 3 && media.length > 4 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold text-white">
              +{media.length - 4}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const shouldClampText = (text: string) =>
  text.length > 220 || text.split("\n").length > 7;

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

const getPreviewLinks = (post: XPostViewModel) => {
  const seen = new Set<string>();
  const links: XPostLinkDto[] = [];

  for (const link of post.links ?? []) {
    const href = getLinkHref(link);
    if (isLinkForPostId(link, post.quote?.postId)) continue;
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
      aria-label={`${post.name ?? `@${post.username}`} 게시글 열기`}
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
              {post.name ?? `@${post.username}`}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              @{post.username}
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
                <img
                  src={item.src}
                  alt={item.altText || ""}
                  className="h-full w-full object-cover"
                  loading="lazy"
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

const XReplyContextCard = ({
  reply,
}: {
  reply: NonNullable<XPostViewModel["reply"]>;
}) => {
  const post = reply.post;
  const href = post?.url ?? `https://x.com/i/web/status/${reply.postId}`;

  if (!post) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="답글 원문 열기"
        className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/15 p-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          원문을 볼 수 없습니다.
        </span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }

  const previewMedia = post.media
    .map((item) => ({ ...item, src: item.url ?? item.previewImageUrl }))
    .find((item) => Boolean(item.src));

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${post.name ?? `@${post.username}`} 답글 원문 열기`}
      className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {post.name ?? `@${post.username}`}
          </span>
          <span className="truncate text-muted-foreground">
            @{post.username}
          </span>
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
          <img
            src={link.imageUrl}
            alt=""
            className="h-full min-h-16 w-full object-cover"
            loading="lazy"
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
    (post.links ?? []).map((link) => [link.url, link]),
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
      if (!link || !isLinkForPostId(link, post.quote?.postId)) {
        nodes.push(
          link && shouldShowLinkPreview(link) ? (
            <span key={`${url}-${startIndex}`} className="text-muted-foreground">
              {url}
            </span>
          ) : (
            <a
              key={`${url}-${startIndex}`}
              href={getLinkHref(link)}
              title={link?.displayUrl ?? getLinkHref(link)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              {url}
            </a>
          ),
        );
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

  return nodes.length > 0 ? nodes : text;
};

const shouldIgnoreCardNavigation = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("a, button, input, select, textarea, [role='button']"));

const openExternalUrl = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
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

export const XPostCard = ({
  post,
  member,
  compactTime,
  openPostOnCardClick = false,
  showExternalLinkButton = true,
}: XPostCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const profileSrc = member ? `/profile/${member.code}.webp` : null;
  const accentColor = member?.main_color ?? undefined;
  const displayText = useMemo(() => stripReplyMentionPrefix(post), [post]);
  const canExpand = useMemo(() => shouldClampText(displayText), [displayText]);
  const repostCount = post.metrics.repostCount + post.metrics.quoteCount;
  const handleCopy = async () => {
    try {
      await copyText(post.url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };
  const handleShare = async () => {
    if (!navigator.share) {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: `${member?.name ?? post.username}의 X 게시글`,
        text: post.text,
        url: post.url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await handleCopy();
    }
  };
  const shareLabel =
    copyStatus === "copied"
      ? "링크 복사됨"
      : copyStatus === "error"
        ? "링크 복사 실패"
        : "공유";
  const navigableProps = openPostOnCardClick
    ? {
        "aria-label": `${member?.name ?? post.username} X 원문 게시글 열기`,
        onClick: (event: MouseEvent<HTMLElement>) => {
          if (shouldIgnoreCardNavigation(event.target)) return;
          openExternalUrl(post.url);
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (shouldIgnoreCardNavigation(event.target)) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openExternalUrl(post.url);
        },
        role: "link",
        tabIndex: 0,
      }
    : {};

  return (
    <article
      {...navigableProps}
      className={cn(
        "group relative flex flex-col gap-2.5 overflow-hidden rounded-lg border border-border/70 bg-card p-3 shadow-sm transition-colors duration-200 hover:border-foreground/25 sm:p-4",
        openPostOnCardClick &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {accentColor ? (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />
      ) : null}

      {post.reply ? <XReplyContextCard reply={post.reply} /> : null}

      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3">
        {profileSrc ? (
          <img
            src={profileSrc}
            alt={member?.name ?? post.username}
            className="h-10 w-10 shrink-0 rounded-full border-2 border-border object-cover"
            style={accentColor ? { borderColor: accentColor } : undefined}
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted text-sm font-semibold"
            style={accentColor ? { borderColor: accentColor } : undefined}
          >
            X
          </div>
        )}

        <div className="min-w-0 space-y-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <h2 className="truncate font-semibold text-foreground">
              {member?.name ?? post.username}
            </h2>
            <span className="truncate text-xs text-muted-foreground sm:text-sm">
              @{post.username}
            </span>
            <span className="shrink-0 text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <time
              dateTime={post.createdAt}
              title={formatAbsoluteDate(post.createdAt)}
              className="shrink-0 text-xs text-muted-foreground sm:text-sm"
            >
              {compactTime ?? formatRelativeDate(post.createdAt)}
            </time>
            {showExternalLinkButton ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="ml-auto h-8 w-8 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
              >
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="X에서 원문 보기"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>

          {displayText ? (
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm leading-5 text-foreground",
                canExpand && !expanded && "line-clamp-5",
              )}
            >
              {renderPostText(post, displayText)}
            </p>
          ) : null}

          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-fit rounded-full px-2.5 text-xs text-muted-foreground"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "접기" : "더보기"}
            </Button>
          ) : null}

          <XQuotePostCard post={post} />
          <XLinkPreviewList post={post} />
          <XMediaGrid post={post} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pl-1 pt-2 text-xs text-muted-foreground">
        <XMetricItem
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="답글"
          value={post.metrics.replyCount}
        />
        <XMetricItem
          icon={<Repeat2 className="h-3.5 w-3.5" />}
          label="재게시"
          value={repostCount}
        />
        <XMetricItem
          icon={<Heart className="h-3.5 w-3.5" />}
          label="좋아요"
          value={post.metrics.likeCount}
        />
        <button
          type="button"
          aria-label={shareLabel}
          title={shareLabel}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void handleShare()}
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="sr-only">{shareLabel}</span>
        </button>
      </div>
    </article>
  );
};
