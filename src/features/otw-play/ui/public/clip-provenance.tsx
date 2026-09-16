import type { OtwPlayPublicPerformanceSummaryDto } from "@contracts/otw-play";

export function ClipperName({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  return <>{performance.selectedSource?.channel.displayName.trim() || "클리퍼 미확인"}</>;
}

export function ClipperChip({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  if (performance.releaseType !== "broadcast") return null;
  const name = performance.selectedSource?.channel.displayName.trim() || "클리퍼 미확인";
  return <span title={name} className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-full border border-white/25 bg-black/75 px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm">
    <span className="sr-only">클리퍼 </span>{name}
  </span>;
}

export function ClipBroadcastDate({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  const performedOn = performance.broadcast?.performedOn;
  return performedOn ? <time dateTime={performedOn}>{performedOn}</time> : <>방송일 미확인</>;
}

export function ClipProvenance({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  if (performance.releaseType !== "broadcast") return null;
  return <dl aria-label="클립 방송일" className="grid min-w-0 gap-1 text-xs text-muted-foreground">
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0">방송일</dt>
      <dd><ClipBroadcastDate performance={performance} /></dd>
    </div>
  </dl>;
}
