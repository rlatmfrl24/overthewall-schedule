import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hexToRgba(hex: string | undefined, alpha: number) {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastColor(hexColor: string | undefined): string {
  if (!hexColor || !/^#[0-9A-F]{6}$/i.test(hexColor)) {
    return "#000000";
  }
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

export function extractChzzkChannelId(urlChzzk?: string | null): string | null {
  if (!urlChzzk) return null;
  try {
    const parsed = new URL(urlChzzk);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) return lastSegment.split("?")[0];
  } catch {
    // Fallback for malformed URLs
    const cleaned = urlChzzk.trim().replace(/^https?:\/\//i, "");
    const segments = cleaned.split(/[/?#]/).filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) return lastSegment;
  }
  return null;
}

export function extractChzzkChannelIdFromText(
  text?: string | null
): string | null {
  if (!text) return null;
  const match = text.match(/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * CHZZK 채널 URL을 라이브 링크로 변환합니다.
 * 예: https://chzzk.naver.com/29a1ed5c0829fa620fab900dba7e011b
 *  -> https://chzzk.naver.com/live/29a1ed5c0829fa620fab900dba7e011b
 */
export function convertChzzkToLiveUrl(urlChzzk?: string | null): string | null {
  if (!urlChzzk) return null;

  try {
    const url = new URL(urlChzzk);
    // 이미 /live/ 경로가 포함되어 있으면 그대로 반환
    if (url.pathname.includes("/live/")) {
      return urlChzzk;
    }

    // https://chzzk.naver.com/채널ID 형식을 /live/채널ID로 변환
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0 && !pathSegments.includes("live")) {
      const channelId = pathSegments[pathSegments.length - 1];
      url.pathname = `/live/${channelId}`;
      return url.toString();
    }

    return urlChzzk;
  } catch {
    // URL 파싱 실패 시 원본 반환
    return urlChzzk;
  }
}

export function buildChzzkLiveUrl(channelId?: string | null): string | null {
  if (!channelId) return null;
  return `https://chzzk.naver.com/live/${channelId}`;
}
