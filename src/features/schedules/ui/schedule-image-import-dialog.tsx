import { useEffect, useRef, useState } from "react";
import { useAuth, SignInButton } from "@clerk/clerk-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import type { Member } from "@/features/members";
import type { ApplyScheduleImageGroup, ScheduleImageContext } from "@contracts/schedule-image-import";
import { SCHEDULE_IMAGE_LIMITS } from "@contracts/schedule-image-import";
import { site } from "@/shared/config/site";
import { queryKeys } from "@/shared/query/query-keys";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { applyImageGroup, fetchImageContext, fetchImageResult, readScheduleImage } from "../api/schedule-image-import";
import { buildImageGroups, confirmImageWeek, imageGroupKey, inspectImageRows, mapImageMember, type EditableImageRow } from "../model/schedule-image-draft";
import { applyScheduleImageDraft, confirmScheduleImageResult, type ImageApplyState } from "../use-cases/apply-schedule-image-draft";
import { ScheduleImageEditorRow } from "./schedule-image-editor-row";

const errorText = (error:unknown) => error instanceof Error?error.message:"처리하지 못했습니다. 다시 확인해주세요.";
const keyOf = (r:{memberUid:number|null;date:string|null}) => imageGroupKey(r);
function mergeStates(previous:ImageApplyState[],next:ImageApplyState[]) {
  const map=new Map(previous.map(s=>[s.request.operationId,s]));for(const state of next)map.set(state.request.operationId,state);return [...map.values()];
}
export function ScheduleImageImportDialog({members,initialDate,onOpenChange,isAdmin=false}:{members:Member[];initialDate:Date;onOpenChange:(open:boolean)=>void;isAdmin?:boolean}) {
  const {isSignedIn,userId}=useAuth(),queryClient=useQueryClient();
  const [source,setSource]=useState<{file:File;url:string}|null>(null),[rows,setRows]=useState<EditableImageRow[]>([]);
  const [warnings,setWarnings]=useState<string[]>([]),[error,setError]=useState(""),[reading,setReading]=useState(false),[busy,setBusy]=useState(false);
  const [week,setWeek]=useState(format(startOfWeek(initialDate,{weekStartsOn:1}),"yyyy-MM-dd"));
  const [version,setVersion]=useState(()=>crypto.randomUUID()),[records,setRecords]=useState<ImageApplyState[]>([]);
  const [pending,setPending]=useState<ApplyScheduleImageGroup[]|null>(null),[refresh,setRefresh]=useState<"ready"|"failed"|"pending">("ready");
  const controller=useRef<AbortController|null>(null),saving=useRef(false);
  const doneIds=new Set(records.filter(s=>s.state==="applied").flatMap(s=>s.request.changes.map(c=>c.clientId)));
  const canDiscard=useUnsavedChanges(rows.some(r=>r.selected && !doneIds.has(r.clientId)));
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  useEffect(()=>()=>{if(source)URL.revokeObjectURL(source.url);},[source]);
  const requested=[...new Map(rows.filter(r=>r.memberUid!==null && r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !r.needsWeekConfirmation).map(r=>[keyOf(r),{memberUid:r.memberUid!,date:r.date!}])).values()];
  const queries=useQueries({queries:requested.map(r=>({queryKey:["schedule-image-context",site.id,userId,version,r.memberUid,r.date],queryFn:()=>fetchImageContext(r.memberUid,r.date),enabled:Boolean(isSignedIn),staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false}))});
  const contexts=new Map<string,ScheduleImageContext>();requested.forEach((r,i)=>{if(queries[i].data && !queries[i].isError)contexts.set(keyOf(r),queries[i].data!);});
  const inspection=inspectImageRows(rows,contexts);
  const close=async()=>{if(!saving.current && await canDiscard()){controller.current?.abort();controller.current=null;onOpenChange(false);}};
  const pick=async(files:File[])=>{
    if(files.length!==1 || !["image/png","image/jpeg","image/webp"].includes(files[0]?.type) || files[0].size===0 || files[0].size>SCHEDULE_IMAGE_LIMITS.bytes){setError("PNG·JPG·WEBP 이미지 1장, 10MB 이하를 선택해주세요.");return;}
    if(rows.length && !await canDiscard())return;
    controller.current?.abort();controller.current=null;setReading(false);setRows([]);setRecords([]);setWarnings([]);setError("");setSource({file:files[0],url:URL.createObjectURL(files[0])});
  };
  const read=async()=>{
    if(!source || controller.current || saving.current || !isSignedIn)return;
    if(rows.length && !await canDiscard())return;
    const current=new AbortController();controller.current=current;setReading(true);setError("");
    try{
      const draft=await readScheduleImage(source.file,current.signal);
      if(controller.current!==current || current.signal.aborted)return;
      setRows(draft.rows.map(r=>({...r,selected:true,choice:null})));setWarnings(draft.warnings);setRecords([]);setVersion(crypto.randomUUID());
    }catch(e){if(controller.current===current && !current.signal.aborted)setError(errorText(e));}
    finally{if(controller.current===current){controller.current=null;setReading(false);}}
  };
  const refreshSchedules=async()=>{setRefresh("pending");try{await queryClient.invalidateQueries({queryKey:queryKeys.schedules.all},{throwOnError:true});setRefresh("ready");}catch(e){setRefresh("failed");throw e;}};
  const refreshContexts=async(saved:ImageApplyState[])=>{
    const applied=mergeStates(records,saved).filter(s=>s.state==="applied");
    const ids=new Set(applied.flatMap(s=>s.request.changes.map(c=>c.clientId)));
    const keys=new Set(saved.filter(s=>s.state==="applied").map(s=>keyOf(s.request)));
    setRows(old=>old.map(r=>keys.has(keyOf(r)) && !ids.has(r.clientId)?{...r,choice:null}:r));
    await Promise.all(requested.map((r,i)=>keys.has(keyOf(r))?queries[i].refetch():Promise.resolve()));
  };
  const run=async(states:ImageApplyState[])=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError("");
    try{
      const result=await applyScheduleImageDraft(states,{apply:applyImageGroup,refresh:refreshSchedules},next=>setRecords(old=>mergeStates(old,next)));
      setRecords(old=>mergeStates(old,result.groups));await refreshContexts(result.groups);if(result.refresh==="failed")setRefresh("failed");
    }finally{saving.current=false;setBusy(false);}
  };
  const prepare=()=>{
    try{
      const lockedIds=new Set(records.flatMap(s=>s.request.changes.map(c=>c.clientId)));
      const unknownKeys=new Set(records.filter(s=>s.state==="unknown").map(s=>keyOf(s.request)));
      const groups=buildImageGroups(rows.map(r=>lockedIds.has(r.clientId)||unknownKeys.has(keyOf(r))?{...r,selected:false}:r),contexts);
      if(!groups.length){setError("적용할 확정 일정을 선택해주세요. 중복·미확인·기존 유지 항목은 제외됩니다.");return;}
      if(groups.some(g=>g.confirmedDeletedIds.length))setPending(groups);
      else void run(groups.map(request=>({request,state:"ready"})));
    }catch(e){setError(errorText(e));}
  };
  const confirmResult=async(state:ImageApplyState)=>{
    if(saving.current)return;saving.current=true;setBusy(true);
    try{const result=await confirmScheduleImageResult(state,fetchImageResult);setRecords(old=>mergeStates(old,[result]));if(result.state==="applied"){await refreshSchedules();await refreshContexts([result]);}}
    catch(e){setError(errorText(e));}finally{saving.current=false;setBusy(false);}
  };
  const compareAgain=async(groupKey:string)=>{
    const index=requested.findIndex(r=>keyOf(r)===groupKey);if(index<0)return;
    setRows(old=>old.map(r=>keyOf(r)===groupKey && !doneIds.has(r.clientId)?{...r,choice:null}:r));
    const result=await queries[index].refetch();
    if(!result.isError)setRecords(old=>old.filter(s=>keyOf(s.request)!==groupKey || s.state!=="review"));
  };
  const update=(id:string,change:Partial<EditableImageRow>)=>setRows(old=>old.map(r=>r.clientId===id?{...r,...change}:r));
  const addRow=()=>setRows(old=>old.length>=100?old:[...old,{clientId:crypto.randomUUID(),sourceMemberName:null,memberUid:null,date:null,sourceDate:null,weekday:null,startTime:null,sourceTime:null,dateShiftDays:0,needsWeekConfirmation:false,timeState:"unreadable",status:"방송",title:null,needsReview:[],selected:true,choice:null}]);
  const deletionRows=pending?.flatMap(g=>contexts.get(keyOf(g))?.schedules.filter(s=>g.confirmedDeletedIds.includes(s.id)).map(s=>`${members.find(m=>m.uid===g.memberUid)?.name??"멤버"} ${g.date} · ${s.status} ${s.start_time??""} ${s.title??""}`)??[])??[];
  return <Dialog open onOpenChange={open=>{if(!open)void close();}}><DialogContent closeLabel="닫기" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
    <DialogHeader><DialogTitle>이미지로 스케쥴 추가하기</DialogTitle><DialogDescription>원본과 비교해 빠르게 편집한 뒤 선택한 일정만 적용하세요.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">일정표 분석을 위해 이미지가 OpenAI로 전송됩니다. 이 앱의 원본과 미적용 편집은 창을 닫거나 새로고침하면 사라지며, <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer" className="underline">OpenAI의 보관 정책</a>은 별도로 적용됩니다.</p>
    {!isSignedIn?<div className="space-y-3"><p>AI 인식은 로그인 후 이용할 수 있습니다. 기존 직접 입력은 계속 사용할 수 있습니다.</p><SignInButton mode="modal"><Button>로그인</Button></SignInButton></div>:<>
      <div className="space-y-3 rounded-xl border border-dashed border-border p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void pick([...e.dataTransfer.files]);}} onPaste={e=>{const files=[...e.clipboardData.files];if(files.length && !busy){e.preventDefault();void pick(files);}}}>
        <label className="block space-y-2 text-sm font-medium">일정표 이미지<Input type="file" aria-label="일정표 이미지" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const files=[...(e.target.files??[])];if(files.length)void pick(files);e.target.value="";}}/></label>
        <p className="text-xs text-muted-foreground">PNG·JPG·WEBP 1장 · 10MB 이하 · 최대 100건. 파일 선택·끌어 놓기·붙여넣기를 지원합니다.</p>
        <div className="flex flex-wrap items-center gap-2"><Button onClick={()=>void read()} disabled={!source || reading || busy}>{rows.length?"다시 읽기":"일정표 읽기"}</Button>
          {reading && <Button variant="outline" onClick={()=>{controller.current?.abort();controller.current=null;setReading(false);}}>인식 취소</Button>}
          <span role="status" className="text-xs text-muted-foreground">{reading?"일정표를 읽고 있습니다… 최대 20초":"다시 읽기는 새 인식으로 계산됩니다. 편집·적용에는 추가 인식이 없습니다."}</span>
        </div>
      </div>
      {source && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 space-y-2"><a href={source.url} target="_blank" rel="noreferrer" className="text-sm underline">원본 크게 보기</a><img src={source.url} alt="업로드한 일정표 원본" className="max-h-[65dvh] w-full rounded-lg border border-border object-contain lg:sticky lg:top-0"/></div>
        <div className="min-w-0 space-y-3">
          {rows.some(r=>r.needsWeekConfirmation) && <div className="space-y-2 rounded-lg border border-border p-3"><label className="block text-sm">기준 주 후보<Input type="date" aria-label="기준 주 후보" value={week} disabled={busy||reading} onChange={e=>setWeek(e.target.value)}/></label><Button variant="outline" disabled={busy||reading} onClick={()=>setRows(old=>confirmImageWeek(old,week))}>기준 주 확인·일괄 보정</Button><p className="text-xs text-muted-foreground">화면에서 보던 주는 후보입니다. 확인하면 요일을 날짜로 바꾸며 자정 이후 표기도 반영합니다.</p></div>}
          {warnings.map((w,i)=><p key={i} className="text-sm text-muted-foreground">{w}</p>)}
          {rows.map((row,index)=>{const record=records.find(s=>s.request.changes.some(c=>c.clientId===row.clientId) || s.state==="unknown" && keyOf(s.request)===keyOf(row));return <ScheduleImageEditorRow key={row.clientId} row={row} index={index} members={members} isAdmin={isAdmin} context={contexts.get(keyOf(row))} duplicate={inspection.duplicates.has(row.clientId)} unresolved={inspection.unresolved.has(row.clientId)} locked={busy||reading||record?.state==="applied"||record?.state==="unknown"} onChange={change=>update(row.clientId,change)} onMember={uid=>setRows(old=>{const locked=new Set(records.filter(s=>s.state==="applied"||s.state==="unknown").flatMap(s=>s.request.changes.map(c=>c.clientId)));const mapped=new Map(mapImageMember(old.filter(r=>!locked.has(r.clientId)),row.clientId,uid).map(r=>[r.clientId,r]));return old.map(r=>mapped.get(r.clientId)??r);})}/>;})}
          {rows.length>0 && <Button variant="outline" disabled={busy||reading||rows.length>=100} onClick={addRow}>빠진 일정 추가</Button>}
          {requested.map((r,i)=>queries[i].isError?<div key={keyOf(r)} className="text-sm text-destructive">기존 일정 비교 실패: {errorText(queries[i].error)} <Button variant="outline" disabled={busy||reading} onClick={()=>void compareAgain(keyOf(r))}>다시 비교</Button></div>:null)}
        </div>
      </div>}
      <div aria-live="polite" className="space-y-2">{records.map(state=><div key={state.request.operationId} className="rounded-lg border border-border p-3 text-sm">
        <p>{members.find(m=>m.uid===state.request.memberUid)?.name} · {state.request.date} — {state.state==="applied"?"적용 완료":state.state==="unknown"?"결과 확인 중":state.state==="review"?"적용 실패 · 재확인 필요":"적용 대기"}</p>
        {state.message&&<p className="text-muted-foreground">{state.message}</p>}
        {state.state==="unknown"&&<div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={busy||reading} onClick={()=>void confirmResult(state)}>결과 확인</Button><Button variant="outline" disabled={busy||reading} onClick={()=>void run([state])}>같은 요청 재시도</Button></div>}
        {state.state==="review"&&<Button variant="outline" disabled={busy||reading} onClick={()=>void compareAgain(keyOf(state.request))}>기존 일정 다시 비교</Button>}
      </div>)}</div>
      {refresh==="failed"&&<div className="text-sm">저장은 완료했지만 일정표를 새로 불러오지 못했습니다. <Button variant="outline" disabled={busy||reading} onClick={()=>void refreshSchedules().catch(()=>{})}>일정표 조회만 재시도</Button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">중복 {inspection.duplicates.size}건 · 확인 필요 {inspection.unresolved.size}건은 적용에서 제외됩니다.</p><Button disabled={busy||reading||!rows.some(r=>r.selected)||queries.some(q=>q.isFetching)} onClick={prepare}>{busy?"적용 중…":"선택 일정 적용"}</Button></div>
    </>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <ConfirmActionDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}} title="기존 일정 삭제 영향 확인" description={<span className="space-y-2"><span className="block">선택한 변경으로 다음 기존 일정이 삭제됩니다. 내용을 확인한 뒤 적용해주세요.</span><span className="block">{deletionRows.map((text,i)=><span className="block" key={i}>{text}</span>)}</span></span>} confirmLabel="삭제 영향을 확인하고 적용" destructive onConfirm={()=>{const groups=pending;setPending(null);if(groups)void run(groups.map(request=>({request,state:"ready"})));}}/>
  </DialogContent></Dialog>;
}
