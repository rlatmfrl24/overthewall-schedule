import type { XPostLinkItem } from "../types";

type CachedPreview = {
  fetchedAt: number;
  preview: Pick<
    XPostLinkItem,
    | "resolvedUrl"
    | "domain"
    | "title"
    | "description"
    | "imageUrl"
    | "siteName"
    | "previewStatus"
  >;
};

type LinkPreviewFields = CachedPreview["preview"];

const LINK_PREVIEW_TTL_MS = 24 * 60 * 60_000;
const LINK_PREVIEW_STALE_TTL_MS = 7 * 24 * 60 * 60_000;
const LINK_PREVIEW_TIMEOUT_MS = 3_500;
const LINK_PREVIEW_MAX_BYTES = 256 * 1024;
const LINK_PREVIEW_MAX_REDIRECTS = 3;
const LINK_PREVIEW_MAX_LINKS = 8;
const LINK_PREVIEW_CONCURRENCY = 3;

const LINK_PREVIEW_CACHE = new Map<string, CachedPreview>();

const now = () => Date.now();

const isFresh = (entry: CachedPreview) =>
  now() - entry.fetchedAt < LINK_PREVIEW_TTL_MS;

const isStaleUsable = (entry: CachedPreview) =>
  now() - entry.fetchedAt < LINK_PREVIEW_STALE_TTL_MS;

const clampText = (value: string | null | undefined, maxLength: number) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}...`;
};

const decodeHtmlEntities = (value: string) => {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  const toCodePoint = (value: string, radix: number) => {
    const codePoint = Number.parseInt(value, radix);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? codePoint
      : null;
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = toCodePoint(normalized.slice(2), 16);
      return codePoint === null ? match : String.fromCodePoint(codePoint);
    }
    if (normalized.startsWith("#")) {
      const codePoint = toCodePoint(normalized.slice(1), 10);
      return codePoint === null ? match : String.fromCodePoint(codePoint);
    }
    return namedEntities[normalized] ?? match;
  });
};

const normalizeText = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
};

const safeUrl = (value: string | null | undefined, baseUrl?: string) => {
  if (!value) return null;

  try {
    const trimmed = value.trim();
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const getPreviewTarget = (link: XPostLinkItem) =>
  safeUrl(link.resolvedUrl) ?? safeUrl(link.expandedUrl) ?? safeUrl(link.url);

const isBlockedHostname = (hostname: string) => {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local")
  ) {
    return true;
  }

  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1" || lower.includes(":")) {
    return true;
  }

  const parts = lower.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
};

const getDomain = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

const isXStatusUrl = (url: URL) => {
  const host = getDomain(url);
  if (host !== "x.com" && host !== "twitter.com") return false;

  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length >= 3 && segments[1]?.toLowerCase() === "status";
};

const getLinkCacheKey = (url: URL) => url.toString();

const parseAttributes = (tag: string) => {
  const attributes = new Map<string, string>();
  const attributePattern =
    /\s([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key) attributes.set(key, value);
  }

  return attributes;
};

const parseMetaTags = (html: string) => {
  const meta = new Map<string, string>();

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = attributes.get("property") ?? attributes.get("name");
    const content = attributes.get("content");
    if (key && content && !meta.has(key.toLowerCase())) {
      meta.set(key.toLowerCase(), content);
    }
  }

  return meta;
};

const getFirstMeta = (meta: Map<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeText(meta.get(key));
    if (value) return value;
  }
  return null;
};

const getTitleTag = (html: string) => {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeText(match?.[1]);
};

const resolveImageUrl = (value: string | null, baseUrl: string) => {
  const url = safeUrl(value, baseUrl);
  if (!url || isBlockedHostname(url.hostname)) return null;
  return url.toString();
};

const parsePreviewHtml = (html: string, finalUrl: URL): LinkPreviewFields => {
  const meta = parseMetaTags(html);
  const imageUrl = resolveImageUrl(
    getFirstMeta(meta, [
      "og:image:secure_url",
      "og:image",
      "twitter:image",
      "twitter:image:src",
    ]),
    finalUrl.toString(),
  );
  const title = clampText(
    getFirstMeta(meta, ["og:title", "twitter:title"]) ?? getTitleTag(html),
    140,
  );
  const description = clampText(
    getFirstMeta(meta, ["og:description", "twitter:description", "description"]),
    240,
  );
  const siteName = clampText(getFirstMeta(meta, ["og:site_name"]), 80);

  return {
    resolvedUrl: finalUrl.toString(),
    domain: getDomain(finalUrl),
    title,
    description,
    imageUrl,
    siteName,
    previewStatus: title || description || imageUrl ? "ready" : "unavailable",
  };
};

const readResponseBody = async (response: Response, maxBytes: number) => {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let cancelled = false;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remainingBytes = maxBytes - totalBytes;
      const chunk =
        value.byteLength > remainingBytes ? value.slice(0, remainingBytes) : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;

      if (value.byteLength > remainingBytes) {
        await reader.cancel();
        cancelled = true;
        break;
      }
    }

    if (!cancelled && totalBytes >= maxBytes) {
      await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
};

const fetchHtml = async (
  initialUrl: URL,
  redirectCount = 0,
): Promise<{ html: string; finalUrl: URL } | null> => {
  if (redirectCount > LINK_PREVIEW_MAX_REDIRECTS) return null;
  if (isBlockedHostname(initialUrl.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(initialUrl.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "OTW-Schedule-LinkPreview/1.0",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      const nextUrl = safeUrl(location, initialUrl.toString());
      return nextUrl ? fetchHtml(nextUrl, redirectCount + 1) : null;
    }

    if (!response.ok) return null;

    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) return null;

    const html = await readResponseBody(response, LINK_PREVIEW_MAX_BYTES);
    return { html, finalUrl: initialUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const fallbackPreview = (
  targetUrl: URL | null,
  previewStatus: XPostLinkItem["previewStatus"],
): LinkPreviewFields => ({
  resolvedUrl: targetUrl?.toString() ?? null,
  domain: targetUrl ? getDomain(targetUrl) : null,
  title: null,
  description: null,
  imageUrl: null,
  siteName: null,
  previewStatus,
});

const setCachedPreview = (cacheKey: string, preview: LinkPreviewFields) => {
  LINK_PREVIEW_CACHE.set(cacheKey, { fetchedAt: now(), preview });
};

const hasEntityPreview = (link: XPostLinkItem) =>
  Boolean(link.title || link.description || link.imageUrl);

const mergePreview = (
  link: XPostLinkItem,
  preview: LinkPreviewFields,
): XPostLinkItem => ({
  ...link,
  resolvedUrl: preview.resolvedUrl ?? link.resolvedUrl ?? link.expandedUrl,
  domain: preview.domain ?? link.domain ?? null,
  title: link.title ?? preview.title ?? null,
  description: link.description ?? preview.description ?? null,
  imageUrl: link.imageUrl ?? preview.imageUrl ?? null,
  siteName: link.siteName ?? preview.siteName ?? null,
  previewStatus: preview.previewStatus ?? link.previewStatus ?? "unavailable",
});

const enrichLink = async (link: XPostLinkItem): Promise<XPostLinkItem> => {
  const targetUrl = getPreviewTarget(link);
  if (!targetUrl || isBlockedHostname(targetUrl.hostname)) {
    return mergePreview(link, fallbackPreview(targetUrl, "skipped"));
  }

  const basePreview = fallbackPreview(targetUrl, "unavailable");
  if (isXStatusUrl(targetUrl)) {
    return mergePreview(link, { ...basePreview, previewStatus: "skipped" });
  }

  if (hasEntityPreview(link)) {
    return mergePreview(link, {
      ...basePreview,
      title: clampText(link.title, 140),
      description: clampText(link.description, 240),
      imageUrl: resolveImageUrl(link.imageUrl ?? null, targetUrl.toString()),
      siteName: clampText(link.siteName, 80),
      previewStatus: "ready",
    });
  }

  const cacheKey = getLinkCacheKey(targetUrl);
  const cached = LINK_PREVIEW_CACHE.get(cacheKey);
  if (cached && isFresh(cached)) {
    return mergePreview(link, cached.preview);
  }

  const stalePreview =
    cached && isStaleUsable(cached) ? cached.preview : null;

  const fetched = await fetchHtml(targetUrl);
  if (!fetched) {
    if (stalePreview) {
      return mergePreview(link, stalePreview);
    }

    const unavailable = fallbackPreview(targetUrl, "unavailable");
    setCachedPreview(cacheKey, unavailable);
    return mergePreview(link, unavailable);
  }

  if (
    isXStatusUrl(fetched.finalUrl) ||
    isBlockedHostname(fetched.finalUrl.hostname)
  ) {
    const skipped = fallbackPreview(fetched.finalUrl, "skipped");
    setCachedPreview(cacheKey, skipped);
    return mergePreview(link, skipped);
  }

  const preview = parsePreviewHtml(fetched.html, fetched.finalUrl);
  setCachedPreview(cacheKey, preview);
  return mergePreview(link, preview);
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
};

export const enrichLinksWithPreviews = async (links: XPostLinkItem[]) => {
  if (links.length === 0) return links;

  const targetUrls = new Set<string>();
  let enrichedCount = 0;

  return mapWithConcurrency(
    links,
    async (link) => {
      const targetUrl = getPreviewTarget(link);
      const cacheKey = targetUrl ? getLinkCacheKey(targetUrl) : link.url;
      const shouldFetch =
        enrichedCount < LINK_PREVIEW_MAX_LINKS && !targetUrls.has(cacheKey);

      targetUrls.add(cacheKey);
      if (shouldFetch) {
        enrichedCount += 1;
        return enrichLink(link);
      }

      return mergePreview(
        link,
        fallbackPreview(targetUrl, targetUrl ? "unavailable" : "skipped"),
      );
    },
    LINK_PREVIEW_CONCURRENCY,
  );
};

export const clearLinkPreviewCacheForTests = () => {
  LINK_PREVIEW_CACHE.clear();
};
