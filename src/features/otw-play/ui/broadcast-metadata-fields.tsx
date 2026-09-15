import type { OtwPlayBroadcastMetadata } from "@contracts/otw-play";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export function BroadcastMetadataFields({ value, onChange, idPrefix }: {
  value: OtwPlayBroadcastMetadata;
  onChange: (value: OtwPlayBroadcastMetadata) => void;
  idPrefix: string;
}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-date`}>방송일 (선택)</Label>
      <Input id={`${idPrefix}-date`} type="date" value={value.performedOn ?? ""} onChange={event => onChange({ ...value, performedOn: event.target.value || null })} />
      <p className="text-xs text-muted-foreground">클립 업로드 날짜가 아닌 실제 노래를 부른 방송 날짜입니다.</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-evidence`}>날짜 근거 (선택)</Label>
      <Input id={`${idPrefix}-evidence`} maxLength={1000} placeholder="예: 영상 설명에 적힌 방송 날짜" value={value.dateEvidence ?? ""} onChange={event => onChange({ ...value, dateEvidence: event.target.value || null })} />
    </div>
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={`${idPrefix}-url`}>원본 방송 링크 (선택)</Label>
      <Input id={`${idPrefix}-url`} type="url" maxLength={2000} placeholder="https://..." value={value.originalUrl ?? ""} onChange={event => onChange({ ...value, originalUrl: event.target.value || null })} />
      <p className="text-xs text-muted-foreground">원곡 영상이 아닌, 가창 멤버의 다시보기 방송 주소를 입력해 주세요.</p>
    </div>
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="text-sm font-medium">완곡 여부</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {([ ["", "모름"], ["full", "완곡"], ["partial", "일부 가창"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2">
          <input type="radio" name={`${idPrefix}-extent`} checked={(value.extent ?? "") === key} onChange={() => onChange({ ...value, extent: key || null })} />{label}
        </label>)}
      </div>
    </fieldset>
  </div>;
}
