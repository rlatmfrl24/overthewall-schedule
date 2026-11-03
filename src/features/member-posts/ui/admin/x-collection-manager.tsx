import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { XCollectionProvider } from "@contracts/x-collection";
import { Button } from "@/shared/ui/button";
import { queryKeys } from "@/shared/query/query-keys";
import { changeXCollectionSource, xCollectionQueryKey } from "../../api/x-collection-api";
import { xActivityQueryKey } from "../../api/x-activity-api";
import { useXCollectionStatus } from "../../queries/use-x-collection-status";
import { formatXEligibility, formatXTime, xReasonLabel } from "../../model/x-collection-monitoring";
import { xActivityErrorMessage } from "../../model/x-activity-monitoring";

export function XCollectionManager({ enabled }: { enabled: boolean }) {
  const query = useXCollectionStatus(), client = useQueryClient();
  const mutation = useMutation({ mutationFn: (source: XCollectionProvider) => changeXCollectionSource(source),
    onSuccess: data => {
      client.setQueryData(xCollectionQueryKey, data);
      void client.invalidateQueries({ queryKey: xActivityQueryKey });
      void client.invalidateQueries({ queryKey: queryKeys.operations.all });
      void client.invalidateQueries({ queryKey: queryKeys.settings.detail() });
    },
    onError: () => { void client.invalidateQueries({ queryKey: xCollectionQueryKey }); void client.invalidateQueries({ queryKey: xActivityQueryKey }); },
  });
  const data = query.data, blocked = query.isError || query.isFetching || mutation.isPending;
  return <section aria-label="X 혼합 수집 관리" className="space-y-3 rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">X 수집원</h2>
      <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>수집원 상태 새로고침</Button>
    </div>
    {query.isPending && <p>수집원 상태를 불러오는 중...</p>}
    {query.isError && <p role="alert">최신 수집원 상태 확인 불가{data ? " · 아래는 이전 조회 정보입니다." : ""}</p>}
    {data && <>
      <p>현재 기본 수집원: <strong>{data.primarySource === "fxembed" ? "FxEmbed" : "공식 X API"}</strong></p>
      <div className="grid gap-3 md:grid-cols-2">
        <article className="space-y-1 rounded-md border p-3">
          <h3 className="font-medium">FxEmbed 기본 수집</h3>
          <p className="text-xs text-muted-foreground">JSON 검증·저장 상태</p>
          <p>30분 간격 · 최근 성공 {formatXTime(data.fxembed.lastSuccessAt)}</p>
          <p>미완료 {data.fxembed.pendingSources}개 · 오류 {data.fxembed.failedSources}개</p>
          <p className="text-xs text-muted-foreground">전체 탐색 완료 {formatXTime(data.fxembed.lastCompletedAt)}</p>
        </article>
        <article className="space-y-1 rounded-md border p-3">
          <h3 className="font-medium">FxEmbed RSS 보완 {data.rss?.enabled ? "활성" : "비활성"}</h3>
          <p>6시간 간격 · HTTP 성공 {formatXTime(data.rss?.lastHttpSuccessAt)}</p>
          <p>후보 확인 완료 {formatXTime(data.rss?.lastCheckCompletedAt)}</p>
          <p>미완료 계정 {data.rss?.pendingSources ?? 0}개 · 후보 {data.rss?.pendingCandidates ?? 0}건</p>
          {data.rss?.windowReduced && <p role="alert">RSS 발견창 축소 관측</p>}
          {data.rss?.error && <p role="alert">{xReasonLabel(data.rss.error)}</p>}
          <p className="text-xs text-muted-foreground">JSON과 같은 공급자의 불완전한 발견 목록입니다. HTTP 성공은 후보 확인·공식 정기 완료를 뜻하지 않습니다.</p>
        </article>
        <article className="space-y-1 rounded-md border p-3">
          <h3 className="font-medium">공식 X 정기 보강</h3>
          <p>{data.xApi.intervalHours}시간 간격 · 정기 완료 {formatXTime(data.xApi.lastRegularCompletedAt)}</p>
          <p>다음 정기 자격 {formatXEligibility(data.xApi.nextRegularEligibleAt)}</p>
          <p role={data.xApi.pendingSources || data.xApi.failedSources ? "alert" : undefined}>공식 X 미완료 {data.xApi.pendingSources}개 · 오류 {data.xApi.failedSources}개</p>
          {data.accounts.some(account => account.officialHealth === "overdue") && <p role="alert">공식 정기 완료 24시간 지연 · RSS 성공과 별도로 확인이 필요합니다.</p>}
          {data.accounts.some(account => account.officialHealth === "attention") && <p role="alert">공식 정기 완료 18시간 경과 · 주의</p>}
          {data.accounts.some(account => account.officialHealth === "due") && <p>공식 정기 12시간 점검 자격 도달</p>}
          {data.xApi.budgetReady !== true && <p role="alert">공통 예산 확인 불가 · 공식 X 유료 조회 차단</p>}
        </article>
        <article className="space-y-1 rounded-md border p-3">
          <h3 className="font-medium">{data.webhook.state === "disabled" ? "웹훅 Disabled" : data.webhook.state === "enabled" ? "웹훅 활성" : "웹훅 확인 불가"}</h3>
          <p>최근 확인된 사이트 구독 {data.webhook.siteActiveCount ?? "확인 불가"}개</p>
          <p className="text-xs text-muted-foreground">인증·설정·이력을 보존하며 자동 재활성화하지 않습니다.</p>
          {data.webhook.error && <p role="alert">{xActivityErrorMessage(new Error(data.webhook.error))}</p>}
        </article>
      </div>
      <p className="text-muted-foreground">FxEmbed로 처음 전환하면 웹훅은 Disabled입니다. 이후 관리자가 직접 활성화할 수 있습니다. 공식 X는 공통 UTC 하루 $1 목표와 사이트 보호 한도 안에서 보강합니다.</p>
      <div className="flex flex-wrap gap-2">
        {data.primarySource === "x_api"
          ? <Button type="button" size="sm" disabled={blocked || !enabled} onClick={() => mutation.mutate("fxembed")}>FxEmbed 기본 수집 사용</Button>
          : <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={() => mutation.mutate("x_api")}>공식 X 기본 수집으로 복귀</Button>}
        {data.primarySource === "fxembed" && data.hybridPolicy !== "rss_v1" && <Button type="button" size="sm" disabled={blocked || !enabled} onClick={() => mutation.mutate("fxembed")}>혼합 구성 적용</Button>}
      </div>
      {!enabled && <p className="text-muted-foreground">FxEmbed 전환은 게시물 수집을 켠 뒤 사용할 수 있습니다.</p>}
      <p className="text-xs text-muted-foreground">공식 X로 복귀해도 현재 웹훅 상태는 유지됩니다. 웹훅을 중지하려면 구독 관리에서 별도로 중지하세요.</p>
      {data.accounts.length > 0 && <details>
        <summary className="cursor-pointer font-medium">계정별 수집·임시 전환 상태</summary>
        <div className="overflow-x-auto pt-2"><table className="w-full text-left text-xs">
          <caption className="sr-only">허용된 계정별 FxEmbed와 공식 X 상태</caption>
          <thead><tr><th className="p-2">계정</th><th className="p-2">FxEmbed JSON</th><th className="p-2">RSS</th><th className="p-2">공식 X</th></tr></thead>
          <tbody>{data.accounts.map(account => <tr className="border-t" key={account.handle}>
            <th scope="row" className="p-2">@{account.handle}</th>
            <td className="p-2">{formatXTime(account.fxLastSuccessAt)} · {account.fxPending ? "탐색 미완료" : "남은 탐색 없음"}<br />연속 실패 {account.consecutiveFailures}회 / 성공 {account.consecutiveSuccesses}회{account.fxError && <p>{xReasonLabel(account.fxError)}</p>}</td>
            <td className="p-2">HTTP {formatXTime(account.rssLastHttpSuccessAt)}<br />후보 확인 {formatXTime(account.rssLastCheckCompletedAt)} · 대기 {account.rssPendingCandidates}건{account.rssWindowReduced && <p>발견창 축소</p>}{account.rssError && <p>{xReasonLabel(account.rssError)}</p>}</td>
            <td className="p-2">{account.fallbackActive ? "공식 2시간 임시 수집" : "정기 보강"} · {account.officialPending ? "공식 수집 미완료" : "진행 중인 수집 없음"}<br />정기 완료 {formatXTime(account.officialRegularCompletedAt)}<br />전체 페이지 완료 {formatXTime(account.officialLastCompletedAt)}<br />명목 자격 {formatXTime(account.officialNominalDueAt)}<br />재시도 반영 {formatXEligibility(account.officialNextEligibleAt)}{account.officialBlockedReason && <p>{xReasonLabel(account.officialBlockedReason)}</p>}{account.officialError && <p>{xReasonLabel(account.officialError)}</p>}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
    </>}
    {mutation.isError && <p role="alert">수집원 전환을 완료하지 못했습니다. {xActivityErrorMessage(mutation.error)}</p>}
  </section>;
}
