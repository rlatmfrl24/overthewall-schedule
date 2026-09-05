import type { OperationRunDto, XCollectionOperationItemDto } from "@contracts/scheduled-operations";

export const formatXTime = (value: number | null | undefined) =>
  value == null ? "기록 없음" : new Date(value).toLocaleString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const formatXEligibility = (value: number | null | undefined) =>
  value == null ? "확인 불가" : value <= Date.now()
    ? `${formatXTime(value)} 이후 가능` : `${formatXTime(value)}부터 가능`;

export const xReasonLabel = (code: string | null | undefined) => {
  if (!code) return "정규 실행 대기 · 사유 기록 없음";
  const labels: Record<string, string> = {
    budget_exceeded: "전체 X 예산 대기",
    preview_budget_exceeded: "원문 보강 예산 대기",
    preview_disabled: "미리보기 설정에 따른 보류",
    rate_limited: "공급자 호출 제한",
    x_api_429: "공급자 호출 제한",
    not_found_or_unavailable: "접근 불가",
    upstream_unavailable: "공급자 응답 오류",
    budget_unavailable: "예산 정보 확인 오류",
    all_handles_cooldown: "계정 수집 주기 대기",
    missing_bearer_token: "X 인증 설정 확인 필요",
  };
  return labels[code] ?? `조회 오류 (${code})`;
};

export function xCollectionItemLabel(result: NonNullable<XCollectionOperationItemDto["collection"]>) {
  if (result.status === "success") return "성공";
  const progressed = result.postsStored > 0 || result.refreshedHandles > 0;
  if (result.status === "skipped") return progressed ? "일부 수집 후 대기" : "건너뜀";
  return progressed ? "일부 저장 후 실패" : "실패";
}

export function xCollectionStatusText(run: OperationRunDto | null | undefined) {
  const items = run?.xCollection?.items ?? [];
  const results = items.flatMap((item) => item.collection ? [item.collection] : []);
  if (!results.length) return run?.status === "queued" ? "수집 대기" : run?.status === "running" ? "수집 실행 중" : "수집 결과 기록 없음";
  const incomplete = items.some((item) => item.status === "queued" || item.status === "running") || results.length !== items.length;
  if (incomplete) return "진행 중 또는 일부 결과 미확인";
  if (results.some((result) => result.status === "failed")) return "실패 포함";
  if (results.every((result) => result.status === "skipped")) {
    return results.some((result) => result.postsStored > 0 || result.refreshedHandles > 0) ? "일부 수집 후 대기" : "건너뜀";
  }
  return results.some((result) => result.status === "skipped") ? "일부 수집·일부 대기" : "성공";
}

export function xCollectionResultText(run: OperationRunDto | null | undefined) {
  const results = run?.xCollection?.items.flatMap((item) => item.collection ? [item.collection] : []) ?? [];
  const label = xCollectionStatusText(run);
  return results.length ? `${label} · 저장 ${results.reduce((sum, result) => sum + result.postsStored, 0)}건` : label;
}

export function xHydrationResultText(run: OperationRunDto) {
  const items = run.xCollection?.items ?? [];
  const results = items.flatMap((item) => item.referenceHydration ? [item.referenceHydration] : []);
  if (!results.length) return "보강 결과 기록 없음";
  const label = results.some((result) => result.status === "failed" || result.failed > 0) ? "오류·재시도 대기"
    : results.some((result) => result.status === "deferred") ? "이월 대기" : "이번 처리 완료";
  const prefix = items.some((item) => item.status === "queued" || item.status === "running") ? "진행 중 · 저장된 결과: " : "";
  return `${prefix}${label} · 원문 연결 ${results.reduce((sum, result) => sum + result.hydrated, 0)}건${results.length < items.length ? " · 일부 기록 없음" : ""}`;
}
