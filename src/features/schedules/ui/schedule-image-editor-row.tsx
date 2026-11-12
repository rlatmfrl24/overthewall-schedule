import type { Member } from "@/features/members";
import type { ScheduleImageContext } from "@contracts/schedule-image-import";
import { isScheduleMemberActive } from "@contracts/schedule-member-policy";
import { site } from "@/shared/config/site";
import { Input } from "@/shared/ui/input";
import type { EditableImageRow } from "../model/schedule-image-draft";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50";
export function ScheduleImageEditorRow({row,index,members,context,duplicate,unresolved,locked,isAdmin,onChange,onMember}:{
  row:EditableImageRow;index:number;members:Member[];context?:ScheduleImageContext;duplicate:boolean;unresolved:boolean;locked:boolean;isAdmin:boolean;
  onChange:(change:Partial<EditableImageRow>)=>void;onMember:(uid:number|null)=>void;
}) {
  const n=index+1;
  const choice=row.choice ?? (context?.schedules.length?"keep":"add");
  return <fieldset disabled={locked} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-3">
    <legend className="px-1 text-sm font-medium">일정 {n} {duplicate?"· 중복으로 제외":unresolved?"· 확인 필요":""}</legend>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>원본: {[row.sourceMemberName,row.sourceDate,row.sourceTime].filter(Boolean).join(" · ") || "확인 필요"}{row.dateShiftDays>0?" · 자정 이후 다음 날짜로 보정":""}</span>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label={`적용 선택 ${n}`} checked={row.selected && !duplicate} disabled={duplicate} onChange={e=>onChange({selected:e.target.checked})}/>적용</label>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="space-y-1 text-xs">멤버<select aria-label={`멤버 ${n}`} className={selectClass} value={row.memberUid??""} onChange={e=>onMember(e.target.value?Number(e.target.value):null)}>
        <option value="">멤버 확인</option>{members.map(m=><option key={m.uid} value={m.uid} disabled={!isAdmin && Boolean(row.date) && !isScheduleMemberActive(site.id,m.code,row.date!)}>{m.name}</option>)}
      </select></label>
      <label className="space-y-1 text-xs">날짜<Input type="date" aria-label={`날짜 ${n}`} value={row.date??""} onChange={e=>onChange({date:e.target.value||null,needsWeekConfirmation:false})}/></label>
      <label className="space-y-1 text-xs">상태<select aria-label={`상태 ${n}`} className={selectClass} value={row.status??""} onChange={e=>onChange({status:e.target.value as EditableImageRow["status"]||null,...(e.target.value!=="방송"?{startTime:null}:{})})}>
        <option value="">상태 확인</option><option>방송</option><option>휴방</option><option>게릴라</option>
      </select></label>
      <label className="space-y-1 text-xs">시간<Input type="time" aria-label={`시간 ${n}`} value={row.startTime??""} disabled={row.status!=="방송" || row.timeState==="undecided"} onChange={e=>onChange({startTime:e.target.value||null,timeState:e.target.value?"specified":"unreadable"})}/></label>
    </div>
    {row.status==="방송" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`시간 미정 ${n}`} checked={row.timeState==="undecided"} onChange={e=>onChange({timeState:e.target.checked?"undecided":"unreadable",startTime:null})}/>방송 시간 미정</label>}
    <label className="block space-y-1 text-xs">제목<Input aria-label={`제목 ${n}`} value={row.title??""} maxLength={500} onChange={e=>onChange({title:e.target.value||null})}/></label>
    {row.needsWeekConfirmation && <p className="text-xs text-muted-foreground">연도·기준 주를 확인하거나 날짜를 직접 입력해주세요.</p>}
    {context && context.schedules.length>0 && <div className="space-y-2 rounded-lg bg-muted/50 p-2 text-xs">
      <p>기존 일정: {context.schedules.map(s=>`#${s.id} ${s.status} ${s.start_time??"시간 미정"} ${s.title??""}`).join(" / ")}</p>
      <select aria-label={`기존 일정 처리 ${n}`} className={selectClass} value={choice} onChange={e=>onChange({choice:e.target.value as EditableImageRow["choice"]})}>
        <option value="keep">기존 유지 · 이 행 적용 제외</option><option value="add">새 일정으로 추가</option>
        {context.schedules.map(s=><option key={s.id} value={`edit:${s.id}`}>#{s.id} 기존 일정 수정 · {s.start_time??s.status} {s.title??""}</option>)}
      </select>
    </div>}
    {unresolved && row.selected && <p className="text-xs text-destructive">미확인 항목은 적용에서 제외됩니다. 멤버·날짜·상태·시간을 확인해주세요.</p>}
  </fieldset>;
}
