import type { Member } from "@/features/members";
import type { ScheduleImageContext } from "@contracts/schedule-image-import";
import { isScheduleMemberActive } from "@contracts/schedule-member-policy";
import { site } from "@/shared/config/site";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Checkbox } from "@/shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";
import type { EditableImageRow } from "../model/schedule-image-draft";

const selectClass = "w-full min-w-0 text-foreground data-[size=default]:h-11 sm:data-[size=default]:h-9";
export function ScheduleImageEditorRow({row,index,members,context,duplicate,unresolved,locked,isAdmin,onChange,onMember}:{
  row:EditableImageRow;index:number;members:Member[];context?:ScheduleImageContext;duplicate:boolean;unresolved:boolean;locked:boolean;isAdmin:boolean;
  onChange:(change:Partial<EditableImageRow>)=>void;onMember:(uid:number|null)=>void;
}) {
  const n=index+1;
  const choice=row.choice ?? (context?.schedules.length?"keep":"add");
  const missing=[row.memberUid===null?"멤버 선택":null,!row.date||row.needsWeekConfirmation?"날짜 확인":null,!row.status?"방송 상태 선택":null,row.status==="방송"&&row.timeState!=="undecided"&&!row.startTime?"시간 입력":null].filter(Boolean);
  const date=row.date?new Date(`${row.date}T00:00:00Z`):null;
  const weekday=date&&!Number.isNaN(date.getTime())?["일","월","화","수","목","금","토"][date.getUTCDay()]:null;
  return <fieldset disabled={locked} className={cn("min-w-0 space-y-3 rounded-xl border bg-card p-3 transition-colors duration-150 motion-reduce:transition-none",row.selected&&!duplicate?"border-foreground/25":"border-border",duplicate&&"bg-muted/30")}>
    <legend className="sr-only">일정 {n} {duplicate?"· 중복으로 제외":unresolved?"· 확인 필요":""}</legend>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-9">
        <input className="size-4 shrink-0 accent-primary" type="checkbox" aria-label={`적용 선택 ${n}`} checked={row.selected && !duplicate} disabled={duplicate} onChange={e=>onChange({selected:e.target.checked})}/>
        <span className="text-xl font-semibold tabular-nums tracking-tight">{row.date?row.date.slice(5).replace("-","."):"날짜 미정"}</span>
        {weekday&&<span className="text-sm text-muted-foreground">{weekday}요일</span>}
        <span className="sr-only">{row.selected&&!duplicate?"적용 선택됨":"적용 제외"}</span>
      </label>
      <div className="w-full max-w-full sm:w-44"><Select disabled={locked} value={row.status||"unassigned"} onValueChange={value=>{
        onChange(value==="방송"?{status:"방송",timeState:row.startTime?"specified":row.timeState==="undecided"?"undecided":"unreadable"}:{status:value==="unassigned"?null:value as EditableImageRow["status"],startTime:null,timeState:"unreadable"});
      }}>
        <SelectTrigger aria-label={`상태 ${n}`} className={selectClass}><SelectValue placeholder="상태 선택"/></SelectTrigger>
        <SelectContent><SelectItem value="unassigned">상태 선택</SelectItem><SelectItem value="방송">방송</SelectItem><SelectItem value="휴방">휴방</SelectItem><SelectItem value="게릴라">게릴라</SelectItem></SelectContent>
      </Select></div>
    </div>
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">방송 제목<Textarea aria-label={`제목 ${n}`} className="min-h-16 resize-y text-base font-medium leading-relaxed text-foreground md:text-base" rows={2} value={row.title??""} maxLength={500} placeholder="방송 내용을 입력하세요" onChange={e=>onChange({title:e.target.value||null})}/></label>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
      <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><label htmlFor={`image-member-${row.clientId}`}>멤버</label><Select disabled={locked} value={row.memberUid?.toString()??"unassigned"} onValueChange={value=>onMember(value==="unassigned"?null:Number(value))}>
        <SelectTrigger id={`image-member-${row.clientId}`} aria-label={`멤버 ${n}`} className={selectClass}><SelectValue placeholder="멤버 확인"/></SelectTrigger>
        <SelectContent><SelectItem value="unassigned">멤버 확인</SelectItem>{members.map(m=><SelectItem key={m.uid} value={m.uid.toString()} disabled={!isAdmin && Boolean(row.date) && !isScheduleMemberActive(site.id,m.code,row.date!)}>{m.name}</SelectItem>)}</SelectContent>
      </Select></div>
      <label className="min-w-0 space-y-1 text-xs text-muted-foreground">날짜<Input className="h-11 text-foreground sm:h-9" type="date" aria-label={`날짜 ${n}`} value={row.date??""} onChange={e=>onChange({date:e.target.value||null,needsWeekConfirmation:false})}/></label>
      <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><div className="flex min-h-6 items-center justify-between gap-2"><label htmlFor={`image-time-${row.clientId}`}>방송 시간</label>{row.status==="방송"&&<label className="flex min-h-6 cursor-pointer items-center gap-1.5"><Checkbox aria-label={`시간 미정 ${n}`} disabled={locked} checked={row.timeState==="undecided"} onCheckedChange={checked=>onChange({timeState:checked===true?"undecided":row.startTime?"specified":"unreadable",...(checked===true?{startTime:null}:{})})}/>시간 미정</label>}</div><Input id={`image-time-${row.clientId}`} className="h-11 text-foreground sm:h-9" type="time" aria-label={`시간 ${n}`} value={row.startTime??""} disabled={row.status!=="방송" || row.timeState==="undecided"} onChange={e=>onChange({startTime:e.target.value||null,timeState:e.target.value?"specified":"unreadable"})}/></div>
    </div>
    {context && context.schedules.length>0 && <div className="space-y-2 border-t border-border pt-2 text-xs">
      <p>기존 일정: {context.schedules.map(s=>`#${s.id} ${s.status} ${s.start_time??"시간 미정"} ${s.title??""}`).join(" / ")}</p>
      <Select disabled={locked} value={choice} onValueChange={value=>onChange({choice:value as EditableImageRow["choice"]})}>
        <SelectTrigger aria-label={`기존 일정 처리 ${n}`} className={selectClass}><SelectValue/></SelectTrigger>
        <SelectContent className="max-w-[var(--radix-select-content-available-width)]"><SelectItem value="keep">기존 유지 · 이 행 적용 제외</SelectItem><SelectItem value="add">새 일정으로 추가</SelectItem>
        {context.schedules.map(s=><SelectItem key={s.id} value={`edit:${s.id}`} className="whitespace-normal [overflow-wrap:anywhere] [&>span:last-child]:min-w-0">#{s.id} 기존 일정 수정 · {s.start_time??s.status} {s.title??""}</SelectItem>)}</SelectContent>
      </Select>
    </div>}
    {duplicate&&<p className="text-sm text-muted-foreground">이미 있는 일정으로 적용에서 제외됩니다.</p>}
    {unresolved && row.selected && missing.length>0 && <p className="text-sm text-destructive">{missing.join(" · ")}</p>}
  </fieldset>;
}
