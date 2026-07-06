import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import type { Member, XPost, XPostLink } from "@/lib/types";
import IconX from "@/assets/icon_x.svg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Heart,
  ImageOff,
  MessageCircle,
  Quote,
  Repeat2,
} from "lucide-react";

interface XPostCardProps {
  post: XPost;
  member?: Member;
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

const XMediaGrid = ({ post }: { post: XPost }) => {
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

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION_PATTERN = /[),.?!;:]+$/;

const trimUrlMatch = (value: string) => {
  const trailing = value.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
  return {
    url: trailing ? value.slice(0, -trailing.length) : value,
    trailing,
  };
};

const getLinkHref = (link?: XPostLink | null) =>
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

const getLinkDomain = (link: XPostLink) => {
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

const isXStatusLink = (link: XPostLink) =>
  [
    link.resolvedUrl,
    link.expandedUrl,
    link.displayUrl,
    link.url,
  ].some((value) => isXStatusUrl(value));

const isTcoOnlyLink = (link: XPostLink) => {
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

const isPreviewRenderable = (link: XPostLink) => {
  const href = getLinkHref(link);
  return (
    Boolean(href && href !== "#") &&
    link.previewStatus !== "skipped" &&
    !isTcoOnlyLink(link)
  );
};

const shouldShowLinkPreview = (link: XPostLink) =>
  isPreviewRenderable(link) || isXStatusLink(link);

const getPreviewLinks = (post: XPost) => {
  const seen = new Set<string>();
  const links: XPostLink[] = [];

  for (const link of post.links ?? []) {
    const href = getLinkHref(link);
    if (!shouldShowLinkPreview(link)) continue;

    const key = href.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    links.push(link);
  }

  return links;
};

const XLinkPreviewCard = ({ link }: { link: XPostLink }) => {
  const href = getLinkHref(link);
  const domain = getLinkDomain(link);
  const linkedPost = link.linkedPost ?? null;
  if (linkedPost) {
    const profileImage = linkedPost.profileImageUrl;
    const linkedMedia = linkedPost.media
      .map((item) => ({
        ...item,
        src: item.url ?? item.previewImageUrl,
      }))
      .filter((item) => item.src);

    return (
      <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20 text-left">
        <div className="flex min-w-0 items-start gap-2.5 p-2.5">
          {profileImage ? (
            <img
              src={profileImage}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold">
              X
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {linkedPost.name ?? `@${linkedPost.username}`}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                @{linkedPost.username}
                {linkedPost.createdAt
                  ? ` · ${formatRelativeDate(linkedPost.createdAt)}`
                  : ""}
              </span>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${linkedPost.name ?? `@${linkedPost.username}`} 게시글 열기`}
                className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {linkedPost.text ? (
              <div className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
                {linkedPost.text}
              </div>
            ) : null}
            <div className="text-[11px] font-medium text-muted-foreground">
              X 게시글
            </div>
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
      </div>
    );
  }

  if (isXStatusLink(link)) {
    const displayUrl = link.displayUrl ?? link.resolvedUrl ?? link.expandedUrl ?? href;

    return (
      <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20 text-left">
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
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${displayUrl} 열기`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  const title = link.title ?? link.displayUrl ?? domain;
  const description = link.description;

  return (
    <div className="flex min-h-16 overflow-hidden rounded-lg border border-border/70 bg-muted/20 text-left">
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
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${title} 열기`}
            className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
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
    </div>
  );
};

const XLinkPreviewList = ({ post }: { post: XPost }) => {
  const links = getPreviewLinks(post);
  if (links.length === 0) return null;

  return (
    <div className="space-y-1.5 pl-1">
      {links.map((link) => (
        <XLinkPreviewCard key={getLinkHref(link)} link={link} />
      ))}
    </div>
  );
};

const renderPostText = (post: XPost) => {
  const linksByUrl = new Map(
    (post.links ?? []).map((link) => [link.url, link]),
  );
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of post.text.matchAll(URL_PATTERN)) {
    const rawMatch = match[0];
    const startIndex = match.index ?? 0;
    const { url, trailing } = trimUrlMatch(rawMatch);
    const link = linksByUrl.get(url);

    if (startIndex > lastIndex) {
      nodes.push(post.text.slice(lastIndex, startIndex));
    }

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

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = startIndex + rawMatch.length;
  }

  if (lastIndex < post.text.length) {
    nodes.push(post.text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : post.text;
};

const shouldIgnoreCardNavigation = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("a, button, input, select, textarea, [role='button']"));

const openExternalUrl = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export const XPostCard = ({
  post,
  member,
  compactTime,
  openPostOnCardClick = false,
  showExternalLinkButton = true,
}: XPostCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const profileSrc = member ? `/profile/${member.code}.webp` : null;
  const accentColor = member?.main_color || "#111111";
  const canExpand = useMemo(() => shouldClampText(post.text), [post.text]);
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
        "group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border/70 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md sm:p-4",
        openPostOnCardClick &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
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
              alt={member?.name ?? post.username}
              className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              X
            </div>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
              <h2 className="truncate text-sm font-semibold text-foreground">
                {member?.name ?? post.username}
              </h2>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-label="X 게시글"
                title="X 게시글"
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-70"
              >
                <img src={IconX} alt="" className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">
                @{post.username} ·{" "}
                {compactTime ?? formatRelativeDate(post.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {showExternalLinkButton ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground sm:px-3"
          >
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              <span className="hidden sm:inline">X에서 보기</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </div>

      <p
        className={cn(
          "whitespace-pre-wrap break-words pl-1 text-sm leading-6 text-foreground",
          canExpand && !expanded && "line-clamp-5",
        )}
      >
        {renderPostText(post)}
      </p>

      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-1 h-6 w-fit rounded-full px-2.5 text-xs text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "접기" : "더보기"}
        </Button>
      ) : null}

      <XLinkPreviewList post={post} />

      <div className="pl-1">
        <XMediaGrid post={post} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pl-1 pt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.replyCount)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.repostCount)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Quote className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.quoteCount)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" />
          {formatMetric(post.metrics.likeCount)}
        </span>
      </div>
    </article>
  );
};
