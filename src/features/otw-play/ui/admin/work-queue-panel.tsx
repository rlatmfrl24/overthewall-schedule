import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminCatalogDto, OtwPlayReviewItemDto } from "@contracts/otw-play";
import type { PlayWorkBatch, PlayWorkItem, PlayWorkQueue, PlayWorkQueueAction } from "@contracts/otw-play-work-queue";
import { isAiBatchPending } from "@contracts/otw-play-ai-batch";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useConfirmation } from "@/shared/lib/confirmation";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { SelectField } from "@/shared/ui/select-field";
import { Textarea } from "@/shared/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { addWorkQueues, commandWorkQueue, completeWorkBatch, fetchWorkBatch, fetchWorkQueues, retryWorkBatch, updateWorkItem, workQueueQueryKey } from "../../api/work-queue";
import { convertOtwPlayImportCandidate, fetchOtwPlayReviewItems, updateOtwPlayImportCandidate } from "../../api/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { useIngestionBudget } from "../../queries/use-ingestion-budget";
import { ApiError } from "@/shared/api/client";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";

const queueLabels={checking:"정보 확인 중",waiting:"작업 대기",exhausted:"목록 확인 끝 · 남은 항목 확인",failed:"정보 확인 실패",archived:"보관됨"};
const outcomeLabels={pending:"확인 필요",ready:"검수 저장됨",registered:"등록 완료",excluded:"제외",deferred:"보류"};
const batchKey=(id?:string)=>["otw-play-work-batch",id];
const aiPending=(b:PlayWorkBatch)=>b.items.some(i=>i.aiStatus && isAiBatchPending(i.aiStatus));

function QueueProgress({queue}:{queue:PlayWorkQueue}) {
  const p=queue.progress;
  const percent=p && p.total !== null && !p.uncertain ? p.total === 0 ? 100 : Math.min(100,Math.floor(p.completed/p.total*100)) : null;
  return <div className="space-y-2">
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span>처리 완료 {p?.completed ?? queue.counts.registered+queue.counts.excluded} / {p?.total?.toLocaleString("ko-KR") ?? "미확인"}</span><span className="font-semibold">{percent === null ? "진행률 확인 필요" : `${percent}%`}</span></div>
    <Progress aria-label={`${queue.title ?? queue.playlistId} 전체 처리율`} value={percent}/>
    <p className="text-xs text-muted-foreground">등록 {p?.registered ?? queue.counts.registered} · 제외 {p?.excluded ?? queue.counts.excluded} · 보류 {p?.deferred ?? queue.counts.deferred} · 남은 항목 {p?.remaining?.toLocaleString("ko-KR") ?? "미확인"}</p>
    <p className="text-xs text-muted-foreground">목록 확인 {p?.inspected ?? queue.counts.inspected}개{p?.checkedAt ? ` · ${new Date(p.checkedAt).toLocaleDateString("ko-KR")} 확인 당시 기준` : ""}{p?.uncertain ? " · 목록 변경 또는 이전 기록 확인 필요" : ""}</p>
  </div>;
}

export function WorkQueuePanel({active=true,catalog=null,onManageChannel,onProposal}:{active?:boolean;catalog?:OtwPlayAdminCatalogDto|null;onManageChannel?:(id:string,kind?:"official_video"|"singing_clip")=>void;onProposal?:(id:string)=>void}) {
  const client=useQueryClient(),confirm=useConfirmation();
  const [search,navigate]=useConsoleSearch();
  const location=useRef(search);location.current=search;
  const [addOpen,setAddOpen]=useState(false),[urls,setUrls]=useState("");
  const addTrigger=useRef<HTMLButtonElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [addResults,setAddResults]=useState<{input:string;queueId:string|null;errorMessage:string|null}[]>([]);
  const [decision,setDecision]=useState<{item:PlayWorkItem;disposition:"deferred"|"excluded";advance:boolean}|null>(null);
  const [reasonChoice,setReasonChoice]=useState("곡 정보 확인"),[reasonNote,setReasonNote]=useState("");
  const decisionTrigger=useRef<HTMLElement|null>(null);
  const [listOpen,setListOpen]=useState(false);
  const [extraDeferred,setExtraDeferred]=useState<PlayWorkItem[]>([]),[deferredCursor,setDeferredCursor]=useState<string|null|undefined>();
  const [visited,setVisited]=useState<Record<string,OtwPlayReviewItemDto>>({});
  const requests=useRef(new Map<string,{expectedVersion:number;idempotencyKey:string}>());
  const budgetQuery=useIngestionBudget(active);
  const budgetBlocked=!budgetQuery.isError && budgetQuery.data?.status === "blocked" && Date.now()-Date.parse(budgetQuery.data.measuredAt)<=120000 && Date.parse(budgetQuery.data.resetAt)>Date.now();
  const query=useQuery({queryKey:[...workQueueQueryKey,search.workQueue],queryFn:()=>fetchWorkQueues(undefined,search.workQueue),enabled:active,retry:false,
    refetchInterval:q=>active && !budgetBlocked && q.state.data?.data.queues.some(q=>q.status === "checking") ? 5000 : false});
  const data=query.data?.data;
  const batchId=search.workBatch ?? data?.activeBatch?.id;
  const batchQuery=useQuery({queryKey:batchKey(batchId),queryFn:()=>fetchWorkBatch(batchId!),enabled:active && Boolean(batchId),retry:false,
    refetchInterval:q=>{const b=q.state.data?.data;return active && b && !b.errorMessage && (b.status === "preparing" && !budgetBlocked || b.status === "completing" || b.status === "completed" && b.continuation?.requested && !b.continuation.nextBatchId || aiPending(b)) ? 5000 : false;}});
  const batch=batchQuery.data?.data ?? (data?.activeBatch?.id === batchId ? data?.activeBatch ?? null : null);
  const queue=data?.queues.find(q=>q.id === (search.workQueue ?? batch?.queueId));
  const workspace=Boolean(search.workBatch);
  const deferredView=search.view === "work-deferred";
  const reviewing=search.view === "review" && workspace;
  const current=search.selected ? batch?.items.find(i=>search.workItem ? i.id === search.workItem : i.candidateId === search.selected || i.id === search.selected) : undefined;
  const reviewQuery=useQuery({queryKey:["otw-play-work-review",batch?.id,search.selected,current?.candidateStatus],enabled:active && reviewing && Boolean(current?.candidateId) && !current?.pendingProposalId,retry:false,
    queryFn:async()=>{
      let cursor:string|undefined;
      do {const page=await fetchOtwPlayReviewItems({jobId:batch!.jobId,source:"playlist",status:current!.candidateStatus === "ready" ? "ready" : ["converted","ignored"].includes(current!.candidateStatus) ? "completed" : "pending",cursor});
        const entry=page.items.find(i=>i.id===current!.candidateId);if(entry)return entry;cursor=page.nextCursor ?? undefined;
      } while(cursor);
      throw new Error("현재 묶음에서 검수 항목을 찾지 못했습니다.");
    }});
  const entry=reviewQuery.data;
  useEffect(()=>{if(entry)setVisited(v=>v[entry.id] === entry ? v : {...v,[entry.id]:entry});},[entry]);
  useEffect(()=>{setExtraDeferred([]);setDeferredCursor(undefined);},[search.workQueue]);
  useEffect(()=>{
    if (!active || batch?.status !== "completed") return;
    void client.invalidateQueries({queryKey:queryKeys.otwPlay.adminCatalog(),refetchType:"none"});
    void client.invalidateQueries({queryKey:workQueueQueryKey});
  },[active,batch?.id,batch?.status,batch?.continuation?.nextBatchId,client]);
  useEffect(()=>{
    if (!active || batch?.status !== "completed" || !workspace || reviewing) return;
    const next=batch.continuation?.requested;
    if (next && data?.activeBatch && data.activeBatch.id!==batch.id) {
      navigate({view:"work-queue",workBatch:data.activeBatch.id,workQueue:data.activeBatch.queueId,selected:undefined,state:undefined},true);
    } else if (next === false || batch.continuation?.nextBatchId === "done") {
      navigate({view:"work-queue",workBatch:undefined,selected:undefined,state:undefined},true);
    }
  },[active,batch,data,workspace,reviewing,navigate]);
  const refresh=useCallback(async()=>{await Promise.all([client.invalidateQueries({queryKey:workQueueQueryKey}),client.invalidateQueries({queryKey:["otw-play-work-batch"]}),client.invalidateQueries({queryKey:["otw-play-work-review"]})]);},[client]);
  const command=(intent:string,version:number)=>{if(!requests.current.has(intent))requests.current.set(intent,{expectedVersion:version,idempotencyKey:crypto.randomUUID()});return requests.current.get(intent)!;};
  const run=async(action:()=>Promise<unknown>,intent?:string)=>{
    setBusy(true);setError(null);
    try {await action();if(intent)requests.current.delete(intent);}
    catch(e){if(intent && e instanceof ApiError && [400,401,403,404,409,413,422].includes(e.status))requests.current.delete(intent);setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.");}
    finally{await refresh();setExtraDeferred([]);setDeferredCursor(undefined);setBusy(false);}
  };
  const sourceAction=async(q:PlayWorkQueue,action:PlayWorkQueueAction)=>{
    if(action === "archive" && !await confirm({title:"플레이리스트를 보관할까요?",description:"검수·등록·보류 기록을 보존합니다.",confirmLabel:"보관"}))return;
    const intent=`${q.id}:${action}`;
    await run(async()=>{const result=await commandWorkQueue(q.id,action,command(intent,q.version));if(result.data)navigate({view:"work-queue",workBatch:result.data.id,workQueue:q.id,selected:undefined,state:undefined},false);},intent);
  };
  const openReview=useCallback(async(i:PlayWorkItem,deferred=false)=>{
    const openedFrom=location.current;
    if(i.candidateId && (i.metadataExpiresAt === null || i.metadataExpiresAt<=Date.now())) {
      setBusy(true);setError(null);
      try{await updateOtwPlayImportCandidate(i.candidateId,{expectedVersion:i.candidateVersion,action:"refresh_metadata"});await refresh();}
      catch(e){setError(e instanceof Error ? e.message : "영상 정보를 갱신하지 못했습니다.");setBusy(false);return;}setBusy(false);
    }
    if(location.current !== openedFrom)return;
    navigate({view:"review",workBatch:i.batchId,workQueue:i.queueId,workItem:i.id,source:"playlist",category:i.jobId,kind:i.candidateKind === "singing_clip" ? "broadcast" : "official",state:deferred ? "deferred" : undefined,selected:i.candidateId ?? i.id,proposal:undefined},false);
    setListOpen(false);
  },[navigate,refresh]);
  const autoOpening=useRef(false);
  useEffect(()=>{
    if(!active || !workspace || search.view!=="work-queue" || search.selected || !batch || batch.status!=="review" || aiPending(batch) || batch.errorMessage || error || busy || autoOpening.current)return;
    const next=batch.items.find(i=>i.outcome === "pending");if(!next)return;
    autoOpening.current=true;void openReview(next).finally(()=>{autoOpening.current=false;});
  },[active,workspace,search.view,search.selected,batch,busy,error,openReview]);
  const nextReview=async()=>{
    const stillReviewing=()=>location.current.view === "review" && location.current.workBatch === search.workBatch && location.current.workItem === search.workItem && location.current.selected === search.selected;
    if(!stillReviewing())return;
    await refresh();
    if(!stillReviewing())return;
    if(search.state === "deferred"){navigate({view:"work-deferred",workBatch:undefined,selected:undefined,state:undefined},false);return;}
    const latest=(await fetchWorkBatch(batch!.id)).data;
    if(!stillReviewing())return;
    const next=latest.items.find(i=>i.outcome === "pending" && (i.candidateId ?? i.id)!==search.selected);
    if(next)await openReview(next);else navigate({view:"work-summary",selected:undefined},false);
  };
  const pause=()=>navigate({view:search.state === "deferred" ? "work-deferred" : "work-queue",workBatch:undefined,selected:undefined,state:undefined},false);
  const beginDecision=(item:PlayWorkItem,disposition:"deferred"|"excluded",advance=false)=>{
    decisionTrigger.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDecision({item,disposition,advance});setReasonChoice(disposition === "deferred" ? "곡 정보 확인" : "노래 클립 아님");setReasonNote("");
  };
  const complete=async(next:boolean)=>{
    if(!batch)return;const intent=`${batch.id}:complete:${next}`;
    await run(()=>completeWorkBatch(batch.id,{...command(intent,batch.version),startNext:next}),intent);
    await client.invalidateQueries({queryKey:queryKeys.otwPlay.adminCatalog(),refetchType:"none"});
  };
  const reviewEntries=entry ? {...visited,[entry.id]:entry} : visited;
  const qOrder=[...(data?.queues ?? [])].sort((a,b)=>Number(b.id===data?.activeBatch?.queueId)-Number(a.id===data?.activeBatch?.queueId));
  const shownDeferred=[...(data?.deferred ?? []),...extraDeferred];
  const renderItem=(i:PlayWorkItem,deferred=false)=><article key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
    <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{i.playlistPosition !== null ? `${i.playlistPosition+1}. ` : ""}{i.title ?? i.videoId ?? "접근할 수 없는 영상"}</p><p className="text-xs text-muted-foreground">{outcomeLabels[i.outcome]}{i.disposition === "duplicate" ? " · 같은 영상의 검수 결과 공유" : ""}</p>{i.reason && <p className="text-xs text-muted-foreground">{i.reason}</p>}{i.errorMessage && <p role="alert" className="text-sm text-destructive">{i.errorMessage}</p>}</div>
    <div className="flex flex-wrap gap-2">{!["registered","excluded"].includes(i.outcome) && <Button variant="outline" disabled={busy} onClick={()=>void openReview(i,deferred)}>{deferred ? "보류 검수 이어가기" : "검수 열기"}</Button>}
      {i.outcome === "pending" && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" disabled={busy} aria-label={`${i.title ?? i.videoId ?? "접근할 수 없는 영상"} 항목 작업`}>더보기</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>beginDecision(i,"deferred")}>보류</DropdownMenuItem><DropdownMenuItem onSelect={()=>beginDecision(i,"excluded")}>제외</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      {deferred && i.candidateId && i.candidateStatus === "ready" && <Button disabled={busy} onClick={()=>void run(async()=>{const result=await convertOtwPlayImportCandidate(i.candidateId!,{expectedVersion:i.candidateVersion});if(!["created","duplicate"].includes(result.outcome))throw new Error(`등록 실패: ${result.errorCode ?? result.outcome}`);await client.invalidateQueries({queryKey:queryKeys.otwPlay.adminCatalog(),refetchType:"none"});})}>비공개 등록</Button>}
      {["deferred","excluded"].includes(i.outcome) && !deferred && batch?.status === "review" && <Button variant="ghost" disabled={busy} onClick={()=>void run(()=>updateWorkItem(i.id,i.version,"pending",null))}>다시 검수</Button>}
    </div></article>;

  return <section aria-label="플레이리스트 작업 큐" className="space-y-5">
    {(error || query.isError || batchQuery.isError) && <p role="alert" className="text-sm text-destructive">{error ?? "작업 상태를 불러오지 못했습니다. 최신 상태 확인으로 다시 시도하세요."}</p>}
    {budgetBlocked && (batch?.status === "preparing" || data?.queues.some(q=>q.status === "checking")) && <p role="status" className="rounded-lg border p-3 text-sm">읽기 예산 대기 · {new Date(budgetQuery.data!.resetAt).toLocaleString("ko-KR")} 초기화 후 대기 작업을 복구합니다. 저장된 초안 검수와 비공개 등록은 계속할 수 있습니다.</p>}
    <div hidden={workspace || deferredView} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">플레이리스트 작업</h2><p className="mt-1 text-sm text-muted-foreground">50개씩 초안을 준비하고 한 곡씩 확인합니다. 완료한 묶음은 비공개로 등록합니다.</p></div><Button ref={addTrigger} onClick={()=>setAddOpen(true)}>플레이리스트 추가</Button></div>
      {query.isLoading && <p role="status">플레이리스트를 불러오는 중입니다.</p>}
      {qOrder.map(q=><article key={q.id} className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{q.title ?? q.playlistId}</h3><p className="mt-1 text-xs text-muted-foreground">{data?.activeBatch?.queueId === q.id ? "진행 중인 작업" : queueLabels[q.status]}</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" aria-label={`${q.title ?? q.playlistId} 더보기`}>더보기</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem disabled={busy || data?.activeBatch?.queueId === q.id} onSelect={()=>void sourceAction(q,"rescan")}>새 항목 확인</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>navigate({view:"jobs",category:data?.activeBatch?.queueId === q.id ? data.activeBatch.jobId : undefined,workQueue:q.id,workBatch:undefined,selected:undefined},false)}>수집 이력</DropdownMenuItem>
            <DropdownMenuItem disabled={busy || q.status === "archived" || data?.activeBatch?.queueId === q.id} onSelect={()=>void sourceAction(q,"archive")}>보관</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu></div>
        <QueueProgress queue={q}/>
        {q.errorMessage && <p role="alert" className="text-sm text-destructive">{q.errorMessage}</p>}
        <div className="flex flex-wrap gap-2">{data?.activeBatch?.queueId === q.id ? <Button onClick={()=>navigate({view:"work-queue",workBatch:data.activeBatch!.id,workQueue:q.id,selected:undefined,state:undefined},false)}>이어서 검수</Button>
          : q.status === "waiting" ? <Button disabled={busy || Boolean(data?.activeBatch)} onClick={()=>void sourceAction(q,"start")}>50개 초안 준비</Button> : q.status === "failed" ? <Button disabled={busy} onClick={()=>void sourceAction(q,"retry")}>정보 조회 재시도</Button> : null}
          <Button variant="outline" onClick={()=>navigate({view:"work-deferred",workQueue:q.id,workBatch:undefined,selected:undefined},false)}>보류 {q.deferredCount ?? q.counts.deferred}개</Button></div>
      </article>)}
      {data && !data.queues.length && <p>플레이리스트를 추가해 첫 작업을 시작하세요.</p>}
      <Button variant="ghost" disabled={busy || query.isFetching || batchQuery.isFetching} onClick={()=>void Promise.all([query.refetch(),...(batch ? [batchQuery.refetch()] : [])])}>최신 상태 확인</Button>
    </div>
    {deferredView && <section aria-label="플레이리스트 보류 목록" className="space-y-3"><Button variant="ghost" onClick={pause}>플레이리스트 목록으로</Button><h2 className="text-xl font-semibold">{queue?.title ?? "플레이리스트"} · 보류</h2>{queue && <QueueProgress queue={queue}/>}{shownDeferred.map(i=>renderItem(i,true))}{data && !shownDeferred.length && <p>보류한 항목이 없습니다.</p>}
      {(deferredCursor === undefined ? data?.deferredCursor : deferredCursor) && <Button disabled={busy} variant="outline" onClick={async()=>{setBusy(true);try{const result=(await fetchWorkQueues(deferredCursor ?? data?.deferredCursor ?? undefined,search.workQueue)).data;setExtraDeferred(v=>[...v,...result.deferred]);setDeferredCursor(result.deferredCursor);}catch(e){setError(e instanceof Error ? e.message : "보류 목록을 불러오지 못했습니다.");}finally{setBusy(false);}}}>보류 항목 더 보기</Button>}
    </section>}
    {workspace && batch && <section aria-label="현재 작업 묶음" className="space-y-4">
      <header className="space-y-3 rounded-lg border bg-muted/10 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{queue?.title ?? current?.playlistTitle ?? "플레이리스트 검수"}</h2><Button variant="ghost" onClick={pause}>나중에 이어하기</Button></div>{queue && <QueueProgress queue={queue}/>}
        <div className="border-t pt-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>이번 묶음 · {batch.items.length}개{current ? ` · 현재 ${batch.items.indexOf(current)+1}/${batch.items.length}` : ""}</span><span>검수·보류 결정 {batch.progress?.handled ?? 0}/{batch.items.length}</span></div><Progress aria-label="이번 묶음 진행률" value={batch.items.length ? (batch.progress?.handled ?? 0)/batch.items.length*100 : 0}/></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>setListOpen(v=>!v)} aria-expanded={listOpen}>이번 묶음 목록</Button><Button variant="ghost" disabled={busy || batchQuery.isFetching} onClick={()=>void Promise.all([query.refetch(),batchQuery.refetch()])}>최신 상태 확인</Button></div>
        {listOpen && <div className="max-h-72 overflow-auto">{batch.items.map(i=>renderItem(i))}</div>}
      </header>
      {batch.errorMessage && <p role="alert">{batch.errorMessage}</p>}
      {(batch.errorMessage || Boolean(batch.ai?.counts.failed)) && <Button variant="outline" disabled={busy} onClick={()=>void run(()=>retryWorkBatch(batch.id,command(`${batch.id}:retry`,batch.version)),`${batch.id}:retry`)}>실패 항목 재시도</Button>}
      {(batch.status === "preparing" || aiPending(batch)) && <div role="status" className="rounded-lg border p-5"><p className="font-medium">{batch.status === "preparing" ? "영상 정보를 확인하고 초안을 준비합니다." : `AI 초안 준비 ${(batch.ai?.total ?? 0)-(batch.ai?.counts.queued ?? 0)-(batch.ai?.counts.analyzing ?? 0)-(batch.ai?.counts.saving ?? 0)}/${batch.ai?.total ?? 0}`}</p><p className="mt-2 text-sm text-muted-foreground">화면을 닫아도 현재 묶음은 계속 준비됩니다.</p></div>}
      {batch.status === "preparing" && batch.errorMessage && !batch.items.length && queue && <Button variant="outline" disabled={busy} onClick={()=>void sourceAction(queue,"rescan")}>목록 처음부터 다시 확인</Button>}
      {!reviewing && batch.status === "review" && !aiPending(batch) && !batch.canComplete && <div className="rounded-lg border p-5"><h3 className="font-semibold">검수를 시작할 수 있습니다.</h3><p className="my-3 text-sm text-muted-foreground">영상과 곡·가창 정보를 확인하고 다음 항목으로 이동하세요.</p><Button disabled={busy} onClick={()=>{const next=batch.items.find(i=>i.outcome === "pending");if(next)void openReview(next);}}>한 곡씩 검수 시작</Button></div>}
      {!reviewing && (search.view === "work-summary" || batch.canComplete || batch.status === "completing" || batch.status === "completed") && <div className="space-y-4 rounded-lg border p-5"><h3 className="font-semibold">이번 묶음 검수 결과</h3><p>등록 예정 {batch.progress?.ready ?? 0} · 등록됨 {batch.progress?.registered ?? 0} · 제외 {batch.progress?.excluded ?? 0} · 보류 {batch.progress?.deferred ?? 0}</p><p className="text-sm text-muted-foreground">보류는 전체 처리 완료에 포함되지 않습니다. 게시는 카탈로그에서 별도로 진행합니다.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !batch.canComplete} onClick={()=>void complete(true)}>비공개 등록하고 다음 50개</Button><Button variant="outline" disabled={busy || !batch.canComplete} onClick={()=>void complete(false)}>비공개 등록하고 쉬기</Button></div>{batch.status === "completing" && <p role="status">비공개 등록 결과를 확인하고 있습니다.</p>}
      </div>}
      {reviewing && current && !current.candidateId && <div className="space-y-4 rounded-lg border p-5"><h3 className="font-semibold">접근할 수 없는 영상</h3><p>목록 {current.playlistPosition === null ? "위치 미확인" : `${current.playlistPosition+1}번째`} 항목입니다. 이 항목에는 AI 분석을 실행하지 않았습니다.</p><Button disabled={busy} onClick={()=>beginDecision(current,"deferred",true)}>보류하고 다음</Button><Button variant="outline" disabled={busy} onClick={()=>beginDecision(current,"excluded",true)}>제외하고 다음</Button></div>}
      {reviewing && current?.pendingProposalId && <div className="space-y-3 rounded-lg border p-4"><p>연결된 사용자 제안을 확인해야 합니다. 제안의 승인·게시는 별도 작업입니다.</p><Button onClick={()=>onProposal?.(current.pendingProposalId!)}>연결된 제안 검수</Button><Button variant="outline" onClick={()=>beginDecision(current,"deferred",true)}>보류하고 다음</Button></div>}
      {reviewing && reviewQuery.isError && <p role="alert">{reviewQuery.error.message} <Button variant="link" onClick={()=>void reviewQuery.refetch()}>다시 불러오기</Button></p>}
      {reviewing && current?.candidateId && !entry && !reviewQuery.isError && <p role="status">검수 정보를 불러오는 중입니다.</p>}
      {reviewing && entry && !catalog && <p role="status">카탈로그 정보를 불러오는 중입니다.</p>}
    </section>}
    {catalog && Object.values(reviewEntries).map(e=><div key={e.id} hidden={!reviewing || e.id!==search.selected || !active}>
      <SingingClipReviewDialog presentation="page" fastReview active={active && reviewing && e.id===search.selected} candidate={e.candidate} candidateKind={e.candidateKind} reviewOnly catalog={catalog}
        onOpenChange={open=>{if(!open)pause();}} onConverted={async()=>{await refresh();}} onReviewStateChanged={refresh} onReviewNext={nextReview}
        onDefer={current ? ()=>beginDecision(current,"deferred",true) : undefined} onExclude={current ? ()=>beginDecision(current,"excluded",true) : undefined}
        onManageChannel={e.channelId && onManageChannel ? ()=>onManageChannel(e.channelId!,e.candidateKind) : undefined}/>
    </div>)}
    <Dialog open={addOpen} onOpenChange={open=>{if(!busy)setAddOpen(open);}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();addTrigger.current?.focus();}}><DialogHeader><DialogTitle>플레이리스트 추가</DialogTitle><DialogDescription>공개·일부 공개 노래 클립 플레이리스트를 줄마다 하나씩 입력하세요. 우선 정보만 저장합니다.</DialogDescription></DialogHeader>
      <label htmlFor="play-work-urls">플레이리스트 URL 목록</label><Textarea id="play-work-urls" value={urls} onChange={e=>setUrls(e.target.value)} disabled={busy} placeholder="https://www.youtube.com/playlist?list=…"/>
      {addResults.map((r,n)=><p key={n} role={r.errorMessage ? "alert" : "status"} className="break-all text-xs">{r.input} · {r.errorMessage ?? "저장됨"}</p>)}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setAddOpen(false)}>닫기</Button><Button disabled={busy || !urls.trim()} onClick={()=>void run(async()=>{const lines=urls.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),results=[];for(let n=0;n<lines.length;n+=100)results.push(...(await addWorkQueues(lines.slice(n,n+100))).data);setAddResults(results);if(!results.some(r=>r.errorMessage)){setUrls("");setAddOpen(false);}})}>플레이리스트 저장</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={Boolean(decision)} onOpenChange={open=>{if(!open && !busy)setDecision(null);}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();if(decisionTrigger.current?.getClientRects().length)decisionTrigger.current.focus();}}><DialogHeader><DialogTitle>{decision?.disposition === "deferred" ? "항목 보류" : "항목 제외"}</DialogTitle><DialogDescription>사유를 선택해 기록합니다. 보류한 항목은 나중에 이어서 검수할 수 있습니다.</DialogDescription></DialogHeader>
      <label>사유<SelectField aria-label="처리 사유" value={reasonChoice} onValueChange={setReasonChoice} options={(decision?.disposition === "deferred" ? ["곡 정보 확인","가창자 확인","구간 확인","영상 접근 문제","기타"] : ["노래 클립 아님","중복 영상","영상 접근 불가","기타"]).map(value=>({value,label:value}))}/></label>
      <label htmlFor="play-work-reason">추가 메모 {reasonChoice === "기타" ? "(필수)" : "(선택)"}</label><Textarea id="play-work-reason" maxLength={450} value={reasonNote} onChange={e=>setReasonNote(e.target.value)} disabled={busy}/>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDecision(null)}>취소</Button><Button disabled={busy || reasonChoice === "기타" && !reasonNote.trim()} onClick={()=>void run(async()=>{if(!decision)return;const d=decision;await updateWorkItem(d.item.id,d.item.version,d.disposition,`${reasonChoice}${reasonNote.trim() ? ` · ${reasonNote.trim()}` : ""}`);setDecision(null);if(d.advance)await nextReview();})}>{decision?.advance ? "사유 저장하고 다음" : "사유 저장"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
