import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { XCollectionProvider } from "@contracts/x-collection";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { queryKeys } from "@/shared/query/query-keys";
import { changeXCollectionSource, xCollectionQueryKey } from "../../api/x-collection-api";
import { xActivityQueryKey } from "../../api/x-activity-api";
import { useXCollectionStatus } from "../../queries/use-x-collection-status";
import { formatXEligibility, formatXTime, xReasonLabel } from "../../model/x-collection-monitoring";
import { xActivityErrorMessage } from "../../model/x-activity-monitoring";

function SourceStats({ rows }: { rows: [string, string][] }) {
  return <dl className="space-y-1 text-xs">
    {rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

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
  const officialHealth = data?.accounts.some(account => account.officialHealth === "overdue") ? "공식 정기 완료 24시간 지연"
    : data?.accounts.some(account => account.officialHealth === "attention") ? "공식 정기 완료 18시간 경과"
    : data?.accounts.some(account => account.officialHealth === "due") ? "공식 정기 12시간 점검 자격 도달" : null;
  return <section aria-label="X 혼합 수집 관리" className="@container space-y-3 rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="font-semibold">X 수집원</h2>
        {data && <Badge variant="secondary">현재 기본 수집원 · {data.primarySource === "fxembed" ? "FxEmbed" : "공식 X API"}</Badge>}
      </div>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>수집원 상태 새로고침</Button>
        {data && <>
          {data.primarySource === "x_api"
            ? <Button type="button" size="sm" disabled={blocked || !enabled} onClick={() => mutation.mutate("fxembed")}>FxEmbed 기본 수집 사용</Button>
            : <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={() => mutation.mutate("x_api")}>공식 X 기본 수집으로 복귀</Button>}
          {data.primarySource === "fxembed" && data.hybridPolicy !== "rss_v1" && <Button type="button" size="sm" disabled={blocked || !enabled} onClick={() => mutation.mutate("fxembed")}>혼합 구성 적용</Button>}
        </>}
      </div>
    </div>
    {query.isPending && <p>수집원 상태를 불러오는 중...</p>}
    {query.isError && <p role="alert">최신 수집원 상태 확인 불가{data ? " · 아래는 이전 조회 정보입니다." : ""}</p>}
    {data && <>
      <div className="grid gap-2 @min-[34rem]:grid-cols-3">
        <article aria-labelledby="x-source-fxembed" className="space-y-2 rounded-md border p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h3 id="x-source-fxembed" className="font-semibold">FxEmbed 기본 수집</h3>
            <span className="text-xs text-muted-foreground">{data.fxembed.intervalMinutes}분 간격</span>
          </div>
          <SourceStats rows={[
            ["최근 성공", formatXTime(data.fxembed.lastSuccessAt)],
            [data.fxembed.lookbackHours ? "확인 완료" : "전체 탐색 완료", formatXTime(data.fxembed.lastCompletedAt)],
            ["미완료 · 오류", `${data.fxembed.pendingSources} · ${data.fxembed.failedSources}계정`],
          ]} />
          {data.fxembed.lookbackHours && <p className="text-xs text-muted-foreground">최근 {data.fxembed.lookbackHours}시간 · 최대 {data.fxembed.maxPages}페이지 확인</p>}
          {!!data.fxembed.limitedSources && <p className="text-xs font-medium">상한 도달 {data.fxembed.limitedSources}계정</p>}
          {!!data.fxembed.retiredSources && <p className="text-xs text-muted-foreground">이전 탐색 기록 보존 {data.fxembed.retiredSources}계정</p>}
        </article>
        <article aria-labelledby="x-source-rss" className="space-y-2 rounded-md border p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h3 id="x-source-rss" className="font-semibold">FxEmbed RSS 보완</h3>
            <span className="text-xs text-muted-foreground">{data.rss?.enabled ? `${data.rss.intervalHours}시간 간격` : "비활성"}</span>
          </div>
          <SourceStats rows={[
            ["HTTP 성공", formatXTime(data.rss?.lastHttpSuccessAt)],
            ["후보 확인 완료", formatXTime(data.rss?.lastCheckCompletedAt)],
            ["미완료 · 후보", `${data.rss?.pendingSources ?? 0}계정 · ${data.rss?.pendingCandidates ?? 0}건`],
          ]} />
          {data.rss?.windowReduced && <p role="alert" className="text-xs font-medium">RSS 발견창 축소</p>}
          {data.rss?.error && <p role="alert" className="text-xs font-medium">{xReasonLabel(data.rss.error)}</p>}
        </article>
        <article aria-labelledby="x-source-official" className="space-y-2 rounded-md border p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h3 id="x-source-official" className="font-semibold">공식 X 정기 보강</h3>
            <span className="text-xs text-muted-foreground">{data.xApi.intervalHours}시간 간격</span>
          </div>
          <SourceStats rows={[
            ["정기 완료", formatXTime(data.xApi.lastRegularCompletedAt)],
            ["다음 점검", formatXEligibility(data.xApi.nextRegularEligibleAt)],
            ["미완료 · 오류", `${data.xApi.pendingSources} · ${data.xApi.failedSources}계정`],
          ]} />
          {officialHealth && <p role="alert" className="text-xs font-medium">{officialHealth}</p>}
          {data.xApi.budgetReady !== true && <p role="alert" className="text-xs font-medium">공통 예산 확인 불가 · 유료 조회 차단</p>}
        </article>
      </div>
      {!enabled && <p className="text-xs text-muted-foreground">게시물 수집 비활성 · FxEmbed 전환 불가</p>}
      {data.accounts.length > 0 && <details>
        <summary className="cursor-pointer font-medium">계정별 수집·임시 전환 상태</summary>
        <div className="overflow-x-auto pt-2"><table className="w-full text-left text-xs">
          <caption className="sr-only">허용된 계정별 FxEmbed와 공식 X 상태</caption>
          <thead><tr><th className="p-2">계정</th><th className="p-2">FxEmbed JSON</th><th className="p-2">RSS</th><th className="p-2">공식 X</th></tr></thead>
          <tbody>{data.accounts.map(account => <tr className="border-t" key={account.handle}>
            <th scope="row" className="p-2">@{account.handle}</th>
            <td className="p-2">{formatXTime(account.fxLastSuccessAt)} · {account.fxPending ? "확인 재시도 대기" : "진행 중인 확인 없음"}<br />연속 실패 {account.consecutiveFailures}회 / 성공 {account.consecutiveSuccesses}회{data.fxembed.lookbackHours && <p>확인 범위 종료 {formatXTime(account.fxLastWindowUntilAt ?? null)}{account.fxWindowLimited && " · 4페이지 상한"}</p>}{account.fxError && <p>{xReasonLabel(account.fxError)}</p>}</td>
            <td className="p-2">HTTP {formatXTime(account.rssLastHttpSuccessAt)}<br />후보 확인 {formatXTime(account.rssLastCheckCompletedAt)} · 대기 {account.rssPendingCandidates}건{account.rssWindowReduced && <p>발견창 축소</p>}{account.rssError && <p>{xReasonLabel(account.rssError)}</p>}</td>
            <td className="p-2">{account.fallbackActive ? "공식 2시간 임시 수집" : "정기 보강"} · {account.officialPending ? "공식 수집 미완료" : "진행 중인 수집 없음"}<br />정기 완료 {formatXTime(account.officialRegularCompletedAt)}<br />전체 페이지 완료 {formatXTime(account.officialLastCompletedAt)}<br />명목 자격 {formatXTime(account.officialNominalDueAt)}<br />재시도 반영 {formatXEligibility(account.officialNextEligibleAt)}{account.officialBlockedReason && <p>{xReasonLabel(account.officialBlockedReason)}</p>}{account.officialError && <p>{xReasonLabel(account.officialError)}</p>}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
    </>}
    {mutation.isError && <p role="alert">수집원 전환을 완료하지 못했습니다. {xActivityErrorMessage(mutation.error)}</p>}
  </section>;
}
