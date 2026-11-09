import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PiSpinnerGapBold as Loader } from "react-icons/pi";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { xActivityErrorMessage as message } from "../../model/x-activity-monitoring";
import { startXActivity, stopXActivity, xActivityQueryKey } from "../../api/x-activity-api";
import { useXActivityStatus } from "../../queries/use-x-activity-status";
import { XActivityStatusCard } from "./x-activity-status-card";
import { queryKeys } from "@/shared/query/query-keys";
import { xReferenceHealthQueryKey } from "../../queries/use-x-reference-health";
import { xCollectionQueryKey } from "../../api/x-collection-api";

const labels:Record<string,string>={
  active:"구독 중",starting:"등록 확인 중",pending:"대기",stopped:"중지됨",error:"확인 필요",
  complete:"저장 완료",failed:"처리 실패",skipped:"처리 제외",
};
const time=(timestamp:number)=>new Date(timestamp).toLocaleString("ko-KR");
const webhookBudgetNotice = "양 사이트 합산 UTC 하루 $1 목표입니다. 전달 중인 이벤트로 초과할 수 있으며 강제 상한을 보장하지 않습니다. 기존 자동충전·주기 $30 한도는 유지합니다.";

export function XActivityManager(){
  const client=useQueryClient();
  const [open,setOpen]=useState(false);
  const [confirmStart,setConfirmStart]=useState(false);
  const query=useXActivityStatus();
  const mutation=useMutation({mutationFn:(action:"start"|"resume"|"stop")=>action==="stop"?stopXActivity():startXActivity(action),
    onSuccess:data=>{client.setQueryData(xActivityQueryKey,data);void client.invalidateQueries({queryKey:queryKeys.settings.detail()});void client.invalidateQueries({queryKey:queryKeys.operations.all});void client.invalidateQueries({queryKey:xReferenceHealthQueryKey});},
    onError:()=>{void client.invalidateQueries({queryKey:xActivityQueryKey});},
    onSettled:()=>{void client.invalidateQueries({queryKey:xCollectionQueryKey});}});
  const data=query.data;
  const current=data?.sites?.find(site=>site.site===data.site);
  const unresolvedStop=mutation.variables==="stop"&&(mutation.isPending||mutation.isError);
  const transition=data?.pauseReason==="hybrid_transition"||current?.pauseReason==="hybrid_transition";
  const controlDisabled=query.isError||query.isFetching||mutation.isPending;
  const starting = mutation.isPending && mutation.variables === "start";
  const showManagement = !starting && Boolean(current?.enabled || current?.activeCount || unresolvedStop);
  const canStart = Boolean(data?.configured) && !controlDisabled && !transition && !showManagement;

  return <Card id="x-webhook-monitoring" role="region" aria-labelledby="x-webhook-heading" className="gap-0 py-0 shadow-none">
    <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
      <h2 id="x-webhook-heading" className="text-base font-semibold">웹훅</h2>
      <Label htmlFor="x-webhook-enabled" className="min-h-11">
        웹훅 활성화
        <Switch
          id="x-webhook-enabled"
          className="min-h-0!"
          checked={starting || current?.enabled === true}
          disabled={current?.enabled ? controlDisabled : !canStart}
          onCheckedChange={checked => {
            if (checked) setConfirmStart(true);
            else mutation.mutate("stop");
          }}
        />
      </Label>
    </CardHeader>
    <ConfirmActionDialog
      open={confirmStart}
      onOpenChange={setConfirmStart}
      title="웹훅 활성화"
      description={`이 사이트에서 수집이 허용된 활성 멤버를 구독합니다. ${webhookBudgetNotice}`}
      confirmLabel="활성화"
      confirmDisabled={!canStart}
      onConfirm={() => mutation.mutate("start")}
    />
    {starting && <CardContent className="border-t px-4 py-4">
      <div role="status" className="flex items-start gap-3 text-sm">
        <Loader aria-hidden="true" className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin" />
        <div className="space-y-1">
          <p className="font-medium">웹훅 활성화 중</p>
          <p className="text-muted-foreground">구독 등록과 활성화 상태를 확인하고 있습니다.</p>
        </div>
      </div>
    </CardContent>}
    {mutation.isError && <CardContent className="border-t px-4 py-3">
      <p role="alert" className="text-sm text-destructive">{message(mutation.error)}</p>
    </CardContent>}
    {showManagement && <CardContent role="region" aria-label="X 웹훅 관리" className="space-y-3 border-t px-4 py-4">
    <XActivityStatusCard query={query} onRefresh={()=>void query.refetch()} />
    <details className="rounded-xl border bg-card" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer px-5 py-4 text-sm font-medium">X 신규 피드 구독</summary>
    {open&&<div className="space-y-4 border-t p-4 text-sm">
      <p>{transition?"수집원 전환이 끝난 뒤 웹훅 구독을 재개할 수 있습니다.":"이 사이트에서 수집이 허용된 활성 멤버의 신규 글을 웹훅으로 받고, 누락은 정기 수집으로 보완합니다."}</p>
      <p className="text-muted-foreground">FxEmbed로 처음 전환할 때는 웹훅 구독을 중지합니다. 공식 X로 복귀하면 현재 구독 상태를 유지합니다.</p>
      <p className="rounded-md border p-3">{webhookBudgetNotice}</p>
      {query.isPending&&<p>구독 상태를 불러오는 중...</p>}
      {query.isError&&<p role="alert">{message(query.error)}</p>}
      {data&&<>
        {data.resumeAt&&<p>자동 재개 예정 {time(data.resumeAt)} · 예산 중지만 자동 재개합니다.</p>}
        <div className="flex flex-wrap gap-2">
          {current?.enabled&&<Button type="button" size="sm" disabled={!data.configured||controlDisabled||transition} onClick={()=>mutation.mutate("resume")}>전체 구독 재개</Button>}
          {!current?.enabled&&<Button type="button" size="sm" variant="outline" disabled={controlDisabled} onClick={()=>mutation.mutate("stop")}>이 사이트 웹훅 중지</Button>}
        </div>
        <p className="text-muted-foreground">사용자 중지·사이트 수집 중지는 자동으로 해제하지 않습니다. 사진·영상 표시 정보가 충분한 원본은 추가 조회 없이 처리합니다.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.sites?.map(site=><div className="rounded-md border p-3" key={site.site}>
            <p className="font-medium">{site.site==="otw"?"OTW":"LuvDia"} · 구독 {site.activeCount} / 대상 {site.targetCount}</p>
            <p>등록 실패 {site.failedCount} · {site.pauseReason==="budget"?"예산 중지":site.pauseReason==="site"?"사이트 중지":!site.enabled?(site.pauseReason?.startsWith("hybrid")?"웹훅 Disabled":"사용자 중지"):"수집 허용"}</p>
            {site.lastError&&<p role="alert">{message(site.lastError)}</p>}
          </div>)}
        </div>
        {data.recovery&&<p>누락 보완 {data.recovery.intervalHours}시간 · 미완료 커서 {data.recovery.pendingSources}개 · 가장 오래된 완료 {data.recovery.lastSuccessAt?time(data.recovery.lastSuccessAt):"아직 없음"}</p>}
        {!!data.cachePurgePending&&<p role="status">공통 임시 캐시 정리 대기 {data.cachePurgePending}건 · 피드 원문은 이미 제거됐습니다.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="mb-2 text-left font-medium">이 사이트 허용 멤버별 구독 상태</caption>
            <thead><tr><th className="p-2">사이트 / 계정</th><th className="p-2">상태</th><th className="p-2">만료 / 실패 사유</th></tr></thead>
            <tbody>{data.subscriptions?.map(item=><tr className="border-t" key={item.site+":"+item.handle}>
              <td className="p-2">{item.site} / @{item.handle}</td><td className="p-2">{labels[item.state]??"대기"}</td>
              <td className="p-2">{item.error?message(item.error):item.expiresAt?time(item.expiresAt):"—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-2" aria-label="최근 XAA 수신 결과">
          <p className="font-medium">최근 수신 결과</p>
          {data.events.length===0&&<p className="text-muted-foreground">아직 수신된 신규 게시물이 없습니다.</p>}
          {data.events.map(event=><div key={event.postId+":"+event.receivedAt} className="rounded-md border p-3">
            <a href={`https://x.com/i/web/status/${event.postId}`} target="_blank" rel="noreferrer" className="underline">{event.postId}</a>
            <p>{event.status==="pending"?"보강 대기":labels[event.status]??"확인 필요"}</p>
            <p className="text-muted-foreground">수신 {time(event.receivedAt)} · {event.mediaSource==="raw"?"웹훅 원본":event.mediaSource==="lookup"?"보강 조회":"미디어 확인 대기"} · 미디어 {event.mediaCount}개 {event.mediaTypes}</p>
            {event.error&&<p>{message(event.error)}</p>}
          </div>)}
        </div>
      </>}
    </div>}
    </details>
    </CardContent>}
  </Card>;
}
