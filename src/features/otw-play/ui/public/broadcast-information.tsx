import type { OtwPlayBroadcastMetadata } from "@contracts/otw-play";

export function BroadcastInformation({ broadcast, showDate = true }: { broadcast?: OtwPlayBroadcastMetadata | null; showDate?: boolean }) {
  return <dl className="grid gap-1 text-sm text-muted-foreground">
    <div><dt className="inline">가창 </dt><dd className="inline">{broadcast?.extent === "full" ? "완곡" : broadcast?.extent === "partial" ? "일부 가창" : "미확인"}</dd></div>
    {showDate && <div><dt className="inline">방송일 </dt><dd className="inline">{broadcast?.performedOn ?? "미확인"}</dd></div>}
    <div><dt className="inline">원본 방송 </dt><dd className="inline">{broadcast?.originalUrl ? <a className="underline underline-offset-4" href={broadcast.originalUrl} target="_blank" rel="noopener noreferrer">원본 보기</a> : "미확인"}</dd></div>
    {broadcast?.dateEvidence && <div><dt className="inline">확인 근거 </dt><dd className="inline break-words">{broadcast.dateEvidence}</dd></div>}
  </dl>;
}
