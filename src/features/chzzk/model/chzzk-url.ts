export function extractChzzkChannelId(
  urlChzzk?: string | null,
): string | null {
  if (!urlChzzk) return null;
  try {
    const parsed = new URL(urlChzzk);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) return lastSegment.split("?")[0];
  } catch {
    const cleaned = urlChzzk.trim().replace(/^https?:\/\//i, "");
    const segments = cleaned.split(/[/?#]/).filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) return lastSegment;
  }
  return null;
}

export function extractChzzkChannelIdFromText(
  text?: string | null,
): string | null {
  if (!text) return null;
  const match = text.match(/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]+)/i);
  return match ? match[1] : null;
}

export function convertChzzkToLiveUrl(
  urlChzzk?: string | null,
): string | null {
  if (!urlChzzk) return null;

  try {
    const url = new URL(urlChzzk);
    if (url.pathname.includes("/live/")) {
      return urlChzzk;
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0 && !pathSegments.includes("live")) {
      const channelId = pathSegments[pathSegments.length - 1];
      url.pathname = `/live/${channelId}`;
      return url.toString();
    }

    return urlChzzk;
  } catch {
    return urlChzzk;
  }
}

export function buildChzzkLiveUrl(
  channelId?: string | null,
): string | null {
  if (!channelId) return null;
  return `https://chzzk.naver.com/live/${channelId}`;
}
