import type { OtwPlayBroadcastMetadata } from "@contracts/otw-play";
import { useId } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

// eslint-disable-next-line react-refresh/only-export-components
export const EMPTY_BROADCAST: OtwPlayBroadcastMetadata = {
  performedOn: null, dateEvidence: null, originalUrl: null, extent: null,
};

export function BroadcastFields({ value, onChange, flat = false }: {
  flat?: boolean;
  value: OtwPlayBroadcastMetadata;
  onChange: (value: OtwPlayBroadcastMetadata) => void;
}) {
  const id = useId();
  return <fieldset className={flat ? "space-y-3" : "space-y-3 rounded-lg border p-3"}>
    <legend className={flat ? "sr-only" : "px-1 text-sm font-semibold"}>방송 가창 정보</legend>
    <p className="text-sm text-muted-foreground">방송일과 원본 링크를 모르면 비워 두세요. 미확인으로 표시하며, 클립 업로드일로 대신 입력하지 않습니다.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`${id}-date`}>방송일 (선택)</Label><Input id={`${id}-date`} type="date" value={value.performedOn ?? ""} onChange={event => onChange({ ...value, performedOn: event.target.value || null })} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-extent`}>가창 범위</Label><Select value={value.extent ?? "unknown"} onValueChange={extent => onChange({ ...value, extent: extent === "unknown" ? null : extent as "full" | "partial" })}><SelectTrigger id={`${id}-extent`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">확인 필요 — 게시 전 선택</SelectItem><SelectItem value="full">완곡</SelectItem><SelectItem value="partial">일부 가창</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor={`${id}-evidence`}>방송일 확인 근거 (선택)</Label><Input id={`${id}-evidence`} maxLength={1000} value={value.dateEvidence ?? ""} placeholder="예: 영상 설명의 방송 날짜" onChange={event => onChange({ ...value, dateEvidence: event.target.value || null })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`${id}-original`}>원본 방송 링크 (선택)</Label><Input id={`${id}-original`} type="url" maxLength={2000} value={value.originalUrl ?? ""} placeholder="https://…" onChange={event => onChange({ ...value, originalUrl: event.target.value || null })} /></div>
    </div>
  </fieldset>;
}
