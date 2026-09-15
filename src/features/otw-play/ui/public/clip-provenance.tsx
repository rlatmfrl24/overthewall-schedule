import type { OtwPlayPublicPerformanceSummaryDto } from "@contracts/otw-play";

export function ClipperName({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  return <>{performance.selectedSource?.channel.displayName.trim() || "클리퍼 미확인"}</>;
}

export function ClipBroadcastDate({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  const performedOn = performance.broadcast?.performedOn;
  return performedOn ? <time dateTime={performedOn}>{performedOn}</time> : <>방송일 미확인</>;
}

export function ClipProvenance({ performance }: { performance: OtwPlayPublicPerformanceSummaryDto }) {
  if (performance.releaseType !== "broadcast") return null;
  return <dl aria-label="클립 출처 및 방송일" className="grid min-w-0 gap-1 text-xs text-muted-foreground">
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0">클리퍼</dt>
      <dd className="min-w-0 break-words [overflow-wrap:anywhere]"><ClipperName performance={performance} /></dd>
    </div>
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0">방송일</dt>
      <dd><ClipBroadcastDate performance={performance} /></dd>
    </div>
  </dl>;
}
