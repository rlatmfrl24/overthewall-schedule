export type SnapshotDesign = "poster" | "legacy";
export type SnapshotMode = "grid" | "timeline";

export function normalizeSnapshotDesign(value: unknown): SnapshotDesign {
  return value === "legacy" ? "legacy" : "poster";
}

export function getSnapshotGeometry(mode: SnapshotMode, design: SnapshotDesign = "poster") {
  const [contentWidth, padding] = mode === "grid" ? [1280, 20]
    : design === "legacy" ? [520, 12] : [720, 0];
  return { contentWidth, padding, outputWidth: contentWidth + padding * 2 };
}

export function getSnapshotUrl(date: string, mode: SnapshotMode, theme: "light" | "dark", design: SnapshotDesign = "poster") {
  const params = new URLSearchParams({ date, mode, theme, design: mode === "grid" ? "poster" : design });
  return `/snapshot?${params.toString()}`;
}

export function getSnapshotFilename(date: string, mode: SnapshotMode, design: SnapshotDesign, site: SiteDefinition) {
  const label = mode === "grid" ? "일정표" : design === "legacy" ? "기존편성표" : "편성표";
  return `${site.id === "otw" ? `${site.siteName} 스케쥴` : site.serviceName}-${label}-${date}.png`;
}
import type { SiteDefinition } from "@contracts/site-definition";
