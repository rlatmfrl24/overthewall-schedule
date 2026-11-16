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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/ui/alert-dialog";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import Stepper, { Step } from "@/shared/ui/stepper/Stepper";
import { applyImageGroup, fetchImageContext, fetchImageResult, readScheduleImage } from "../api/schedule-image-import";
import type { ScheduleImageFocus } from "../api/schedule-image-details";
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
  const [step,setStep]=useState(1),[reviewGroups,setReviewGroups]=useState<ApplyScheduleImageGroup[]>([]);
  const [source,setSource]=useState<{file:File;url:string}|null>(null),[rows,setRows]=useState<EditableImageRow[]>([]);
  const [focus,setFocus]=useState<ScheduleImageFocus>("all");
  const [warnings,setWarnings]=useState<string[]>([]),[error,setError]=useState(""),[reading,setReading]=useState(false),[busy,setBusy]=useState(false);
  const [week,setWeek]=useState(format(startOfWeek(initialDate,{weekStartsOn:1}),"yyyy-MM-dd"));
  const [version,setVersion]=useState(()=>crypto.randomUUID()),[records,setRecords]=useState<ImageApplyState[]>([]);
  const [pending,setPending]=useState<ApplyScheduleImageGroup[]|null>(null),[refresh,setRefresh]=useState<"ready"|"failed"|"pending">("ready");
  const controller=useRef<AbortController|null>(null),saving=useRef(false);
  const draftRevision=useRef(0),submittedRevision=useRef<number|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const stepHeading=useRef<HTMLHeadingElement>(null);
  const doneIds=new Set(records.filter(s=>s.state==="applied").flatMap(s=>s.request.changes.map(c=>c.clientId)));
  const canDiscard=useUnsavedChanges(rows.some(r=>r.selected && !doneIds.has(r.clientId)));
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  useEffect(()=>()=>{if(source)URL.revokeObjectURL(source.url);},[source]);
  useEffect(()=>{stepHeading.current?.focus();stepHeading.current?.scrollIntoView({block:"nearest"});},[step]);
  const requested=[...new Map(rows.filter(r=>r.memberUid!==null && r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !r.needsWeekConfirmation).map(r=>[keyOf(r),{memberUid:r.memberUid!,date:r.date!}])).values()];
  const queries=useQueries({queries:requested.map(r=>({queryKey:["schedule-image-context",site.id,userId,version,r.memberUid,r.date],queryFn:()=>fetchImageContext(r.memberUid,r.date),enabled:Boolean(isSignedIn),staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false}))});
  const contexts=new Map<string,ScheduleImageContext>();requested.forEach((r,i)=>{if(queries[i].data && !queries[i].isError)contexts.set(keyOf(r),queries[i].data!);});
  const inspection=inspectImageRows(rows,contexts);
  const close=async()=>{if(!saving.current && await canDiscard()){controller.current?.abort();controller.current=null;onOpenChange(false);}};
  const pick=async(files:File[])=>{
    if(files.length!==1 || !["image/png","image/jpeg","image/webp"].includes(files[0]?.type) || files[0].size===0 || files[0].size>SCHEDULE_IMAGE_LIMITS.bytes){setError("PNG·JPG·WEBP 이미지 1장, 10MB 이하를 선택해주세요.");return;}
    if(rows.length && !await canDiscard())return;
    controller.current?.abort();controller.current=null;setReading(false);setRows([]);setRecords([]);setReviewGroups([]);setRefresh("ready");setWarnings([]);setError("");setFocus("all");setSource({file:files[0],url:URL.createObjectURL(files[0])});
  };
  const read=async()=>{
    if(!source || controller.current || saving.current || !isSignedIn)return;
    if(rows.length && !await canDiscard())return;
    const current=new AbortController();controller.current=current;setReading(true);setError("");
    try{
      const draft=await readScheduleImage(source.file,current.signal,focus);
      if(controller.current!==current || current.signal.aborted)return;
      if(!draft.rows.length){setError("이미지에서 일정을 찾지 못했습니다. 일정 영역을 확인하고 다시 읽어주세요.");return;}
      setRows(confirmImageWeek(draft.rows.map(r=>({...r,selected:true,choice:null})),week));setWarnings(draft.warnings);setRecords([]);setReviewGroups([]);setRefresh("ready");setVersion(crypto.randomUUID());setStep(2);
    }catch(e){if(controller.current===current && !current.signal.aborted)setError(errorText(e));}
    finally{if(controller.current===current){controller.current=null;setReading(false);}}
  };
  const refreshSchedules=async()=>{setRefresh("pending");try{await queryClient.invalidateQueries({queryKey:queryKeys.schedules.all},{throwOnError:true});setRefresh("ready");}catch(e){setRefresh("failed");throw e;}};
  const returnToSchedule=(states:ImageApplyState[])=>{
    if(!states.length||states.some(s=>s.state!=="applied")||draftRevision.current!==submittedRevision.current)return false;
    onOpenChange(false);return true;
  };
  const retryRefresh=async()=>{
    if(saving.current)return;saving.current=true;setBusy(true);
    try{await refreshSchedules();returnToSchedule(records);}
    catch{/* The failed refresh keeps its read-only recovery action. */}
    finally{saving.current=false;setBusy(false);}
  };
  const refreshContexts=async(saved:ImageApplyState[])=>{
    const applied=mergeStates(records,saved).filter(s=>s.state==="applied");
    const ids=new Set(applied.flatMap(s=>s.request.changes.map(c=>c.clientId)));
    const keys=new Set(saved.filter(s=>s.state==="applied").map(s=>keyOf(s.request)));
    setRows(old=>old.map(r=>keys.has(keyOf(r)) && !ids.has(r.clientId)?{...r,choice:null}:r));
    await Promise.all(requested.map((r,i)=>keys.has(keyOf(r))?queries[i].refetch():Promise.resolve()));
  };
  const run=async(states:ImageApplyState[])=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError("");
    if(states.some(s=>s.state==="ready"))submittedRevision.current=draftRevision.current;
    try{
      const result=await applyScheduleImageDraft(states,{apply:applyImageGroup,refresh:refreshSchedules},next=>setRecords(old=>mergeStates(old,next)));
      setRecords(old=>mergeStates(old,result.groups));
      if(result.refresh==="ready"&&returnToSchedule(mergeStates(records,result.groups)))return;
      await refreshContexts(result.groups);if(result.refresh==="failed")setRefresh("failed");
    }finally{saving.current=false;setBusy(false);}
  };
  const hasRecovery=refresh==="failed"||records.some(s=>s.state==="unknown"||s.state==="review");
  const review=()=>{
    let groups:ApplyScheduleImageGroup[]=[];
    try{
      const lockedIds=new Set(records.flatMap(s=>s.request.changes.map(c=>c.clientId)));
      const unknownKeys=new Set(records.filter(s=>s.state==="unknown").map(s=>keyOf(s.request)));
      groups=buildImageGroups(rows.map(r=>lockedIds.has(r.clientId)||unknownKeys.has(keyOf(r))?{...r,selected:false}:r),contexts);
      if(!groups.length&&!hasRecovery)throw new Error("적용할 확정 일정을 선택해주세요. 중복·미확인·기존 유지 항목은 제외됩니다.");
      setError("");
    }catch(e){setError(errorText(e));if(!hasRecovery)return;}
    setReviewGroups(groups);setStep(3);
  };
  const changeStep=(next:number)=>{
    if(reading||busy||saving.current)return;
    if(next<step){setError("");setStep(next);}
    else if(step===1){if(rows.length){setError("");setStep(2);}else void read();}
    else if(step===2)review();
  };
  const pendingReviewGroups=reviewGroups.filter(g=>!records.some(s=>s.request.operationId===g.operationId));
  const prepare=()=>{
    try{
      const groups=pendingReviewGroups;
      if(!groups.length)return;
      if(groups.some(g=>g.confirmedDeletedIds.length))setPending(groups);
      else void run(groups.map(request=>({request,state:"ready"})));
    }catch(e){setError(errorText(e));}
  };
  const confirmResult=async(state:ImageApplyState)=>{
    if(saving.current)return;saving.current=true;setBusy(true);
    try{const result=await confirmScheduleImageResult(state,fetchImageResult);setRecords(old=>mergeStates(old,[result]));if(result.state==="applied"){await refreshSchedules();if(!returnToSchedule(mergeStates(records,[result])))await refreshContexts([result]);}}
    catch(e){setError(errorText(e));}finally{saving.current=false;setBusy(false);}
  };
  const compareAgain=async(groupKey:string)=>{
    const index=requested.findIndex(r=>keyOf(r)===groupKey);if(index<0)return;
    draftRevision.current++;
    setRows(old=>old.map(r=>keyOf(r)===groupKey && !doneIds.has(r.clientId)?{...r,choice:null}:r));
    const result=await queries[index].refetch();
    if(!result.isError){setRecords(old=>old.filter(s=>keyOf(s.request)!==groupKey || s.state!=="review"));setStep(2);}
  };
  const releaseMovedReview=(ids:Set<string>)=>setRecords(old=>old.filter(s=>s.state!=="review" || !s.request.changes.some(c=>ids.has(c.clientId))));
  const update=(id:string,change:Partial<EditableImageRow>)=>{
    draftRevision.current++;
    const identityChanged=change.date!==undefined && rows.find(r=>r.clientId===id)?.date!==change.date;
    if(identityChanged)releaseMovedReview(new Set([id]));
    const editedDate=change.date?new Date(`${change.date}T00:00:00Z`):null;
    const editedWeekday=editedDate && !Number.isNaN(editedDate.getTime())?(editedDate.getUTCDay()+6)%7+1:null;
    setRows(old=>old.map(r=>r.clientId===id?{...r,...change,...(identityChanged?{choice:null,weekday:editedWeekday,dateShiftDays:0}:{})}:r));
  };
  const changeMember=(id:string,uid:number|null)=>{
    const locked=new Set(records.filter(s=>s.state==="applied"||s.state==="unknown").flatMap(s=>s.request.changes.map(c=>c.clientId)));
    const unknownGroups=new Set(records.filter(s=>s.state==="unknown").map(s=>keyOf(s.request)));
    const editable=rows.filter(r=>!locked.has(r.clientId)&&!unknownGroups.has(keyOf(r)));
    const mapped=mapImageMember(editable,id,uid);
    const moved=new Set(mapped.filter(r=>rows.find(old=>old.clientId===r.clientId)?.memberUid!==r.memberUid).map(r=>r.clientId));
    if(moved.size)draftRevision.current++;
    releaseMovedReview(moved);
    const byId=new Map(mapped.map(r=>[r.clientId,moved.has(r.clientId)?{...r,choice:null}:r]));
    setRows(old=>old.map(r=>byId.get(r.clientId)??r));
  };
  const addRow=()=>{draftRevision.current++;setRows(old=>old.length>=100?old:[...old,{clientId:crypto.randomUUID(),sourceMemberName:null,memberUid:null,date:null,sourceDate:null,weekday:null,startTime:null,sourceTime:null,dateShiftDays:0,needsWeekConfirmation:false,timeState:"unreadable",status:"방송",title:null,needsReview:[],selected:true,choice:null}]);};
  const changeWeek=(value:string)=>{
    setWeek(value);
    const locked=new Set(records.filter(s=>s.state==="applied"||s.state==="unknown").flatMap(s=>s.request.changes.map(c=>c.clientId)));
    const unknownGroups=new Set(records.filter(s=>s.state==="unknown").map(s=>keyOf(s.request)));
    const editable=rows.filter(r=>!locked.has(r.clientId)&&!unknownGroups.has(keyOf(r)));
    const moved=confirmImageWeek(editable.map(r=>({...r,needsWeekConfirmation:r.weekday!==null})),value);
    const changed=new Set(moved.filter(r=>rows.find(old=>old.clientId===r.clientId)?.date!==r.date).map(r=>r.clientId));
    if(changed.size)draftRevision.current++;
    releaseMovedReview(changed);
    const byId=new Map(moved.map(r=>[r.clientId,changed.has(r.clientId)?{...r,choice:null}:r]));
    setRows(old=>old.map(r=>byId.get(r.clientId)??r));
  };
  const deletionRows=pending?.flatMap(g=>contexts.get(keyOf(g))?.schedules.filter(s=>g.confirmedDeletedIds.includes(s.id)).map(s=>`${members.find(m=>m.uid===g.memberUid)?.name??"멤버"} ${g.date} · ${s.status} ${s.start_time??""} ${s.title??""}`)??[])??[];
  if(!isSignedIn)return <AlertDialog open onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>로그인이 필요합니다</AlertDialogTitle>
        <AlertDialogDescription>이미지로 스케쥴을 추가하려면 로그인해주세요.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <SignInButton mode="modal"><AlertDialogAction>로그인</AlertDialogAction></SignInButton>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return <Dialog open onOpenChange={open=>{if(!open)void close();}}><DialogContent closeLabel="닫기" className={`w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] gap-3 overflow-y-auto p-3 sm:p-4 ${step===2?"sm:max-w-6xl":"sm:max-w-2xl"}`}>
    <DialogHeader className="pr-6 text-left"><DialogTitle>이미지로 스케쥴 추가하기</DialogTitle><DialogDescription className="sr-only">일정표 이미지를 읽고 일정을 확인·편집합니다.</DialogDescription></DialogHeader>
    <Stepper currentStep={step} onStepChange={changeStep} onFinalStepCompleted={prepare}
      stepNavigationLabel="스케쥴 추가 단계" stepLabels={["이미지 준비","일정 편집","적용 확인"]}
      allowStepClick={next=>next<=step} disableStepIndicators={busy||reading}
      backButtonText="이전" nextButtonText={step===1?(reading?"인식 중…":rows.length?"일정 편집 계속":"일정표 읽기"):"적용 내용 확인"}
      completeButtonText={busy?"적용 중…":"선택 일정 적용"}
      backButtonProps={{disabled:busy||reading}}
      nextButtonProps={{disabled:busy||reading||(step===1&&!source)||(step===2&&!hasRecovery&&queries.some(q=>q.isFetching))||(step===3&&!pendingReviewGroups.length)}}
      footerClassName="sticky -bottom-3 z-10 -mx-3 -mb-3 border-t border-border bg-background px-3 pb-3 sm:-bottom-4 sm:-mx-4 sm:-mb-4 sm:px-4 sm:pb-4"
      footerContent={<>{error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}{step>1&&<p className="mb-3 text-xs text-muted-foreground">선택 {rows.filter(r=>r.selected&&!inspection.duplicates.has(r.clientId)&&!doneIds.has(r.clientId)).length}건 · 중복 {inspection.duplicates.size}건 · 확인 필요 {inspection.unresolved.size}건 제외</p>}</>}
    >
      <Step>
        <h3 ref={stepHeading} tabIndex={-1} className="mb-3 text-base font-semibold outline-none">이미지 준비</h3>
        <section role="group" aria-label="일정표 이미지 첨부" className="min-w-0 space-y-2 lg:sticky lg:top-0" onDragOver={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} onPaste={e=>{const files=[...e.clipboardData.files];if(files.length && !busy){e.preventDefault();void pick(files);}}}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">일정표 이미지</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>fileInput.current?.click()}>{source?"이미지 바꾸기":"이미지 선택"}</Button></div>
          <Input ref={fileInput} className="hidden" type="file" aria-label="일정표 이미지" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const files=[...(e.target.files??[])];if(files.length)void pick(files);e.target.value="";}}/>
          <div role="group" aria-label="이미지 드롭 영역" className="min-w-0 space-y-2 rounded-xl border-3 border-dashed border-foreground/40 bg-muted/15 p-3" onDrop={e=>{e.preventDefault();e.stopPropagation();if(!busy)void pick([...e.dataTransfer.files]);}}>
            {source?<><a href={source.url} target="_blank" rel="noreferrer" aria-label="첨부 이미지 크게 보기" className="block overflow-hidden rounded-lg"><img src={source.url} alt="첨부한 일정표" className="max-h-[55dvh] w-full object-contain"/></a><p className="truncate text-xs text-muted-foreground" title={source.file.name}>{source.file.name}</p></>:<p className="py-4 text-center text-sm text-muted-foreground">이미지를 선택하거나 끌어 놓으세요</p>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1 text-xs">적용 주<Input className="h-11 sm:h-9" type="date" aria-label="적용 주" value={week} disabled={busy||reading} onChange={e=>changeWeek(e.target.value)}/></label>
            {source && <div className="min-w-0 space-y-1 text-xs"><label htmlFor="image-schedule-focus">확대 영역</label><Select value={focus} disabled={reading||busy} onValueChange={value=>setFocus(value as ScheduleImageFocus)}>
              <SelectTrigger id="image-schedule-focus" aria-label="확대할 일정 영역" className="w-full min-w-0 data-[size=default]:h-11 sm:data-[size=default]:h-9"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 이미지</SelectItem><SelectItem value="left">왼쪽 영역</SelectItem><SelectItem value="right">오른쪽 영역</SelectItem><SelectItem value="top">위쪽 영역</SelectItem><SelectItem value="bottom">아래쪽 영역</SelectItem></SelectContent>
            </Select></div>}
          </div>
          {rows.length>0&&<Button variant="outline" onClick={()=>void read()} disabled={reading||busy}>다시 읽기</Button>}
          {reading&&<Button variant="outline" onClick={()=>{controller.current?.abort();controller.current=null;setReading(false);}}>인식 취소</Button>}
        </section>
      </Step>
      <Step>
        <h3 ref={stepHeading} tabIndex={-1} className="mb-3 text-base font-semibold outline-none">일정 편집</h3>
        <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {source&&<section role="group" aria-label="원본 일정표" className="min-w-0 space-y-2 lg:sticky lg:top-0"><a href={source.url} target="_blank" rel="noreferrer" aria-label="첨부 이미지 크게 보기" className="block overflow-hidden rounded-lg"><img src={source.url} alt="첨부한 일정표" className="max-h-[55dvh] w-full object-contain"/></a><p className="truncate text-xs text-muted-foreground" title={source.file.name}>{source.file.name}</p></section>}
        <div className="min-w-0 space-y-2">
          {warnings.length>0 && <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer">인식 확인 사항 {warnings.length}건</summary>{warnings.map((w,i)=><p key={i} className="mt-2">{w}</p>)}</details>}
          {rows.map((row,index)=>{const record=records.find(s=>s.request.changes.some(c=>c.clientId===row.clientId) || s.state==="unknown" && keyOf(s.request)===keyOf(row));return <ScheduleImageEditorRow key={row.clientId} row={row} index={index} members={members} isAdmin={isAdmin} context={contexts.get(keyOf(row))} duplicate={inspection.duplicates.has(row.clientId)} unresolved={inspection.unresolved.has(row.clientId)} locked={busy||reading||record?.state==="applied"||record?.state==="unknown"} onChange={change=>update(row.clientId,change)} onMember={uid=>changeMember(row.clientId,uid)}/>;})}
          {rows.length>0 && <Button variant="outline" disabled={busy||reading||rows.length>=100} onClick={addRow}>빠진 일정 추가</Button>}
          {requested.map((r,i)=>queries[i].isError?<div key={keyOf(r)} className="text-sm text-destructive">기존 일정 비교 실패: {errorText(queries[i].error)} <Button variant="outline" disabled={busy||reading} onClick={()=>void compareAgain(keyOf(r))}>다시 비교</Button></div>:null)}
        </div>
        </div>
      </Step>
      <Step>
        <h3 ref={stepHeading} tabIndex={-1} className="mb-3 text-base font-semibold outline-none">적용 확인</h3>
        <div className="space-y-3">
          {reviewGroups.map(group=>{
            const saved=records.find(record=>record.request.operationId===group.operationId);
            return <section key={group.operationId} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{members.find(m=>m.uid===group.memberUid)?.name} · {group.date}</h4>{saved&&<span className="text-xs text-muted-foreground">{saved.state==="ready"?"적용 중":saved.state==="applied"?"저장됨":saved.state==="unknown"?"결과 확인 필요":"다시 확인 필요"}</span>}</div>
              <ul className="space-y-2">{group.changes.map(change=><li key={change.clientId} className="text-sm"><p className="text-xs text-muted-foreground">{change.id===null?"새 일정":"기존 일정 수정"} · {change.status}{change.status==="방송"?` · ${change.startTime??"시간 미정"}`:""}</p><p className="whitespace-pre-wrap break-words">{change.title||change.status}</p></li>)}</ul>
              {group.confirmedDeletedIds.length>0&&<p className="text-xs text-destructive">기존 일정 {group.confirmedDeletedIds.length}건이 삭제됩니다.</p>}
            </section>;
          })}
          {!reviewGroups.length&&<p className="text-sm text-muted-foreground">이전 단계에서 적용할 일정을 선택해주세요.</p>}
      <div aria-live="polite" className={records.some(s=>s.state==="unknown"||s.state==="review")?"space-y-2":"sr-only"}>{records.filter(s=>s.state==="unknown"||s.state==="review").map(state=><div key={state.request.operationId} className="rounded-lg border border-border p-3 text-sm">
        <p>{members.find(m=>m.uid===state.request.memberUid)?.name} · {state.request.date} · {state.state==="unknown"?"결과 확인 중":"적용 실패 · 재확인 필요"}</p>
        {state.message&&<p className="text-muted-foreground">{state.message}</p>}
        {state.state==="unknown"&&<div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={busy||reading} onClick={()=>void confirmResult(state)}>결과 확인</Button><Button variant="outline" disabled={busy||reading} onClick={()=>void run([state])}>같은 요청 재시도</Button></div>}
        {state.state==="review"&&<Button variant="outline" disabled={busy||reading} onClick={()=>void compareAgain(keyOf(state.request))}>기존 일정 다시 비교</Button>}
      </div>)}</div>
      {refresh==="failed"&&<div className="text-sm">저장은 완료했지만 일정표를 새로 불러오지 못했습니다. <Button variant="outline" disabled={busy||reading} onClick={()=>void retryRefresh()}>일정표 조회만 재시도</Button></div>}
        </div>
      </Step>
    </Stepper>
    <ConfirmActionDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}} title="기존 일정 삭제 영향 확인" description={<span className="space-y-2"><span className="block">선택한 변경으로 다음 기존 일정이 삭제됩니다. 내용을 확인한 뒤 적용해주세요.</span><span className="block">{deletionRows.map((text,i)=><span className="block" key={i}>{text}</span>)}</span></span>} confirmLabel="삭제 영향을 확인하고 적용" destructive onConfirm={()=>{const groups=pending;setPending(null);if(groups)void run(groups.map(request=>({request,state:"ready"})));}}/>
  </DialogContent></Dialog>;
}
