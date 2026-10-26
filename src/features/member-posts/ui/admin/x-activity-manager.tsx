import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { ApiError } from "@/shared/api/client";
import { fetchXActivity, startXActivity, stopXActivity, xActivityQueryKey } from "../../api/x-activity-api";

const labels:Record<string,string>={
  normal:"정상",registering:"등록 중",partial:"일부 실패",budget_paused:"예산 중지",user_paused:"사용자 중지",site_paused:"사이트 수집 중지",unavailable:"연결·장부 확인 필요",
  active:"구독 중",starting:"등록 확인 중",pending:"대기",stopped:"중지됨",error:"확인 필요",
  complete:"저장 완료",failed:"처리 실패",skipped:"처리 제외",
  budget_exceeded:"공통 예산이 부족합니다. 다음 UTC 날짜에 자동 재개합니다.",
  shared_budget_unavailable:"공통 예산을 확인할 수 없어 유료 조회를 중지했습니다.",
  x_activity_connection_unavailable:"사이트 간 연결 또는 서버 인증 설정을 확인해주세요.",
  x_activity_credentials_missing:"서버의 X API 인증·서명 키 설정을 확인해주세요.",
  x_collection_disabled:"기존 게시물 수집이 켜져 있고 사이트가 공개된 상태에서 적용할 수 있습니다.",
  x_activity_subscription_owned_elsewhere:"같은 계정에 다른 소유자의 구독이 있습니다. 해당 구독은 변경하지 않았습니다.",
  x_activity_user_unavailable:"X 계정을 확인하거나 현재 멤버와 연결할 수 없습니다.",
  post_lookup_unavailable:"X에서 원문을 조회할 수 없습니다.",
  media_details_missing:"조회 결과에 미디어 표시 정보가 부족합니다.",
};
const message=(value:unknown)=>{
  const code=value instanceof ApiError?value.code??value.message:value instanceof Error?value.message:String(value);
  if(/^x_activity_provider_\d+$/.test(code))return "X 구독 API 응답 오류("+code.split("_").at(-1)+"). 권한·잔액·요청 한도를 확인해주세요.";
  return labels[code]??"요청을 완료하지 못했습니다. 상태를 새로고침해 실패한 대상을 확인해주세요.";
};
const dollars=(micros:number)=>`$${(micros/1_000_000).toFixed(3)}`;
const time=(timestamp:number)=>new Date(timestamp).toLocaleString("ko-KR");

export function XActivityManager(){
  const client=useQueryClient();
  const [open,setOpen]=useState(false);
  const query=useQuery({queryKey:xActivityQueryKey,queryFn:fetchXActivity,enabled:open,staleTime:30_000});
  const mutation=useMutation({mutationFn:(action:"start"|"resume"|"stop")=>action==="stop"?stopXActivity():startXActivity(action),
    onSuccess:data=>{client.setQueryData(xActivityQueryKey,data);}});
  const data=query.data;
  const current=data?.sites?.find(site=>site.site===data.site);
  return <details className="rounded-xl border bg-card" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer px-5 py-4 text-sm font-medium">X 신규 피드 구독</summary>
    {open&&<div className="space-y-4 border-t p-4 text-sm">
      <p>이 사이트에서 수집이 허용된 전체 활성 멤버를 구독합니다. 신규 글은 웹훅으로 받고, 누락은 24시간 간격으로 이어 수집합니다.</p>
      <p className="rounded-md border p-3">양 사이트 합산 UTC 하루 $1 목표입니다. 전달 중인 이벤트로 초과할 수 있으며 강제 상한을 보장하지 않습니다. 기존 자동충전·주기 $30 한도는 유지합니다.</p>
      <Button type="button" variant="outline" size="sm" disabled={query.isFetching||mutation.isPending} onClick={()=>void query.refetch()}>상태 새로고침</Button>
      {query.isPending&&<p>구독 상태를 불러오는 중...</p>}
      {query.isError&&<p role="alert">{message(query.error)}</p>}
      {data&&<>
        <p className="font-medium">{labels[data.mode??"unavailable"]}</p>
        {data.coordinatorError&&<p role="alert">{message(data.coordinatorError)}</p>}
        {data.budgetReady?<p>양 사이트 합산 추정 {dollars(data.budget.usedMicros)} / {dollars(data.budget.limitMicros)} · 예약 {dollars(data.budget.reservedMicros)} · {data.budgetDay} UTC</p>
          :<p>공통 장부 준비 전에는 유료 조회를 실행하지 않습니다. 전체 적용 시 양 사이트의 기존 당일 지출·예약액을 보존해 준비합니다.</p>}
        <p className="text-muted-foreground">공급자 고유 활성 구독 {data.providerActiveCount??0}개 · 같은 X 계정은 양 사이트에서 한 번만 구독합니다.</p>
        {data.resumeAt&&<p>자동 재개 예정 {time(data.resumeAt)} · 예산 중지만 자동 재개합니다.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={!data.configured||mutation.isPending} onClick={()=>mutation.mutate(current?.enabled?"resume":"start")}>{current?.enabled?"전체 구독 재개":"전체 대상 적용"}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!current?.enabled||mutation.isPending} onClick={()=>mutation.mutate("stop")}>이 사이트 웹훅 중지</Button>
        </div>
        <p className="text-muted-foreground">사용자 중지·사이트 수집 중지는 자동으로 해제하지 않습니다. 사진·영상 표시 정보가 충분한 원본은 추가 조회 없이 처리합니다.</p>
        {mutation.isError&&<p role="alert">{message(mutation.error)}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {data.sites?.map(site=><div className="rounded-md border p-3" key={site.site}>
            <p className="font-medium">{site.site==="otw"?"OTW":"LuvDia"} · 구독 {site.activeCount} / 대상 {site.targetCount}</p>
            <p>등록 실패 {site.failedCount} · {site.pauseReason==="budget"?"예산 중지":site.pauseReason==="site"?"사이트 중지":!site.enabled?"사용자 중지":"수집 허용"}</p>
            {site.lastError&&<p role="alert">{message(site.lastError)}</p>}
          </div>)}
        </div>
        {data.recovery&&<p>누락 보완 {data.recovery.intervalHours}시간 · 미완료 커서 {data.recovery.pendingSources}개 · 가장 오래된 완료 {data.recovery.lastSuccessAt?time(data.recovery.lastSuccessAt):"아직 없음"}</p>}
        {!!data.cachePurgePending&&<p role="status">공통 임시 캐시 정리 대기 {data.cachePurgePending}건 · 피드 원문은 이미 제거됐습니다.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="mb-2 text-left font-medium">허용 멤버별 구독 상태</caption>
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
  </details>;
}
