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

export function adjustBrightness(hex: string, percent: number): string {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return hex;

  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
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
