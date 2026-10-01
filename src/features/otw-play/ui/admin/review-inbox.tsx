import { QueryReadback } from "@/shared/ui/query-readback";
import { refreshReviewInbox } from "../../queries/refresh-review-inbox";
import { useIngestionBudget } from "../../queries/use-ingestion-budget";
import { useConfirmation } from "@/shared/lib/confirmation";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminCatalogDto, OtwPlayReviewFilters, OtwPlayReviewItemDto } from "@contracts/otw-play";
import { fetchOtwPlayReviewItems, convertOtwPlayImportCandidate, updateOtwPlayImportCandidate, deleteOtwPlayReviewItem } from "../../api/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Badge } from "@/shared/ui/badge";
import { SelectField } from "@/shared/ui/select-field";
import { useOtwPlayImportJob, useOtwPlayImportJobs } from "../../queries/use-admin-catalog";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";
import { aiBatchStatusLabels } from "@contracts/otw-play-ai-batch";
import { listAiBatches } from "../../api/ai-batch";
import { AiBatchPanel } from "./ai-batch-panel";

const statusLabels: Record<string, string> = { withdrawn: "철회", discovered: "검수 대기", needs_input: "정보 입력 필요", ready: "등록 준비 완료", blocked: "확인 필요", converted: "등록 완료", ignored: "제외됨", pending_review: "제안 검수 대기", approved: "승인됨", rejected: "거절됨" };
const sourceLabels = { playlist: "플레이리스트", automatic: "자동 수집", user: "사용자 제안" };
type ReviewActionResult = { action: "conversion" | "kind-correction"; outcome: "success" | "error"; message: string };
export function ReviewInbox({ catalog, onProposal, onManageChannel, onOpenCatalog, active = true }: { active?: boolean; catalog: OtwPlayAdminCatalogDto | null; onProposal: (id: string) => void; onManageChannel: (id: string, kind?: "official_video" | "singing_clip") => void; onOpenCatalog: () => void }) {
  const [search, update] = useConsoleSearch();
  const jobsQuery = useOtwPlayImportJobs(active && search.source !== "user" && search.source !== "automatic");
  const source = search.source === "automatic" || search.source === "user" ? search.source : !search.source && search.tab === "automatic-review" ? "automatic" : "playlist";
  const jobId = source === "playlist" ? search.category ?? jobsQuery.data?.[0]?.id : undefined;
  const editingId = search.view === "review" ? search.selected : undefined;
  const budget = useIngestionBudget(active && source === "playlist");
  const budgetBlocked = !budget.isError && budget.data?.status === "blocked" && Date.now() - Date.parse(budget.data.measuredAt) <= 120_000 && Date.parse(budget.data.resetAt) > Date.now();
  const jobQuery = useOtwPlayImportJob(jobId ?? null, active && !editingId && !search.proposal, budgetBlocked);
  const selectedJob = jobQuery.data ?? jobsQuery.data?.find(job => job.id === jobId);
  useEffect(() => {
    if (active && source === "playlist" && jobId && !search.category) update({ category: jobId, view: search.view ?? "inbox" });
  }, [active, source, jobId, search.category, search.view, update]);
  const filters: OtwPlayReviewFilters = {
    jobId,
    candidateKind: search.kind === "broadcast" ? "singing_clip" : search.kind === "official" ? "official_video" : undefined,
    source,
    status: ["ready", "completed"].includes(search.state ?? "") ? search.state as OtwPlayReviewFilters["status"] : "pending",
  };
  const confirm = useConfirmation();
  const client = useQueryClient();
  const { toast } = useToast();
  const batchProgress = useQuery({ queryKey: ["otw-play-ai-batches"], queryFn: listAiBatches,
    enabled: active && source !== "user", retry: false,
    refetchInterval: q => active && !editingId && !search.proposal && q.state.data?.data.some(b => b.counts.queued + b.counts.analyzing + b.counts.saving > 0) ? 5000 : false });
  const batchState = batchProgress.data ? JSON.stringify(batchProgress.data.data.map(batch => [batch.id, batch.counts, batch.updatedAt])) : null;
  const previousBatchState = useRef<string | null>(null);
  useEffect(() => {
    if (!active || batchState === null) return;
    if (previousBatchState.current !== null && previousBatchState.current !== batchState) {
      void refreshReviewInbox(client);
    }
    previousBatchState.current = batchState;
  }, [active, batchState, client]);
  const query = useInfiniteQuery({ enabled: active && (source !== "playlist" || Boolean(jobId)), queryKey: ["otw-play-review-inbox", filters], queryFn: ({ pageParam }) => fetchOtwPlayReviewItems({ ...filters, cursor: pageParam ?? undefined }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity });
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const selectableRows = rows.filter(row => row.kind === "candidate" && row.status === "ready" && !row.pendingProposalId);
  const conflicts = useQuery({
    queryKey: ["otw-play-review-kind-conflicts", jobId, selectedJob?.candidateKind],
    staleTime: 60_000, refetchOnWindowFocus: false,
    enabled: active && !editingId && !search.proposal && source === "playlist" && Boolean(selectedJob),
    queryFn: async () => {
      const items: OtwPlayReviewItemDto[] = [];
      let cursor: string | undefined;
      do {
        const page = await fetchOtwPlayReviewItems({ source: "playlist", jobId,
          candidateKind: selectedJob!.candidateKind === "singing_clip" ? "official_video" : "singing_clip",
          status: "pending", cursor });
        items.push(...page.items.filter(row => row.kind === "candidate" && row.candidateKind !== selectedJob!.candidateKind && !row.candidate?.linkedPerformanceId));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return items;
    },
  });
  const scope = JSON.stringify([source, jobId ?? null, filters.candidateKind ?? null, filters.status]);
  const [aiSelection, setAiSelection] = useState<{ scope: string; all: boolean; ids: Record<string, number> }>({ scope: "", all: false, ids: {} });
  const aiSelected = aiSelection.scope === scope ? aiSelection.ids : {};
  const aiAll = aiSelection.scope === scope && aiSelection.all;
  const aiEligible = (row: OtwPlayReviewItemDto) => row.kind === "candidate" && ["discovered", "needs_input", "blocked"].includes(row.status) && !row.pendingProposalId && row.candidate?.availabilityStatus === "playable";
  const [selectionState, setSelectionState] = useState<Record<string, Record<string, number>>>({});
  const selected = selectionState[scope] ?? {};
  const setSelected = (next: Record<string, number> | ((current: Record<string, number>) => Record<string, number>)) => setSelectionState(current => ({ ...current, [scope]: typeof next === "function" ? next(current[scope] ?? {}) : next }));
  const allSelectableRowsSelected = selectableRows.length > 0
    && Object.keys(selected).length === selectableRows.length
    && selectableRows.every(row => selected[row.id] === row.version);
  const toggleAllSelectableRows = () => setSelected(allSelectableRowsSelected
    ? {}
    : Object.fromEntries(selectableRows.map(row => [row.id, row.version])));
  // Keep visited forms mounted so list navigation and failed saves retain local input.
  const [visited, setVisited] = useState<Record<string, OtwPlayReviewItemDto>>({});
  const [visitedScopes, setVisitedScopes] = useState<Record<string, boolean>>({});
  const editingScope = `${source}:${jobId ?? ""}:${editingId ?? ""}`;
  const editing = rows.find(row => row.kind === "candidate" && row.id === editingId) ?? (editingId && visitedScopes[editingScope] ? visited[editingId] : undefined);
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    if (!active || editingId || search.proposal || busy || !loadMoreTarget || !hasNextPage || isFetching || isError || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || requested) return;
      requested = true;
      observer.unobserve(loadMoreTarget);
      void fetchNextPage({ cancelRefetch: false });
    }, { rootMargin: "320px 0px" });
    observer.observe(loadMoreTarget);
    return () => { requested = true; observer.disconnect(); };
  }, [active, editingId, search.proposal, busy, loadMoreTarget, hasNextPage, isFetching, isError, fetchNextPage]);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLElement | null>(null);
  const scrollToListStart = useRef(false);
  const previousEditingId = useRef(editingId);
  useEffect(() => {
    if (editing && !visited[editing.id]) setVisited(current => ({ ...current, [editing.id]: editing }));
    if (editing && !visitedScopes[editingScope]) setVisitedScopes(current => ({ ...current, [editingScope]: true }));
  }, [editing, visited, visitedScopes, editingScope]);
  useEffect(() => {
    if (active && editingId && !editing && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [active, editingId, editing, hasNextPage, isFetching, isError, fetchNextPage]);
  useEffect(() => {
    if (!editingId && previousEditingId.current) {
      returnFocus.current?.focus({ preventScroll: true });
      if (scrollToListStart.current) {
        list.current?.scrollIntoView?.({ block: "start" });
        scrollToListStart.current = false;
      } else {
        returnFocus.current?.scrollIntoView?.({ block: "nearest" });
      }
    }
    previousEditingId.current = editingId;
  }, [editingId]);
  const closeReview = () => update({ view: "inbox", selected: undefined }, false);
  const nextReview = async () => {
    let cursor: string | undefined;
    do {
      const page = await fetchOtwPlayReviewItems({ ...filters, status: "pending", cursor });
      const next = page.items.find(row => row.id !== editingId && aiEligible(row));
      if (next) { update({ view: "review", selected: next.id, state: "pending" }, false); return; }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    closeReview();
  };
  const reviewEntries = editing && !visited[editing.id] ? { ...visited, [editing.id]: editing } : visited;
  const [resultState, setResultState] = useState<Record<string, Record<string, ReviewActionResult>>>({});
  const results = resultState[scope] ?? {};
  const setResults = (next: (current: Record<string, ReviewActionResult>) => Record<string, ReviewActionResult>) => setResultState(current => ({ ...current, [scope]: next(current[scope] ?? {}) }));
  const conversionResults = Object.values(results).filter(result => result.action === "conversion");
  const conversionSuccessCount = conversionResults.filter(result => result.outcome === "success").length;
  const conversionFailureCount = conversionResults.length - conversionSuccessCount;
  const refresh = async (allScopes = false) => { await Promise.all([refreshReviewInbox(client, allScopes ? undefined : filters), client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs(), exact: true }), client.invalidateQueries({ queryKey: allScopes ? ["otw-play-review-kind-conflicts"] : ["otw-play-review-kind-conflicts", jobId] }),
    ...(jobId ? [client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJob(jobId), exact: true })] : [])]); };
  const filterKey = JSON.stringify(filters);
  const running = selectedJob?.status === "queued" || selectedJob?.status === "collecting";
  useEffect(() => {
    if (!active || editingId || search.proposal || !running || budgetBlocked) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshReviewInbox(client, JSON.parse(filterKey));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [active, editingId, search.proposal, running, budgetBlocked, client, filterKey]);

  const convert = async () => {
    setResults(current => Object.fromEntries(Object.entries(current).filter(([, result]) => result.action !== "conversion")));
    setBusy(true);
    try {
      for (const [id, expectedVersion] of Object.entries(selected)) {
        try {
          const result = await convertOtwPlayImportCandidate(id, { expectedVersion });
          const ok = result.outcome === "created" || result.outcome === "duplicate";
          setResults(current => ({ ...current, [id]: { action: "conversion", outcome: ok ? "success" : "error", message: ok ? "임시 등록 완료" : `등록 실패: ${result.errorCode ?? result.outcome}` } }));
          if (ok) setSelected(current => { const next = { ...current }; delete next[id]; return next; });
        } catch { setResults(current => ({ ...current, [id]: { action: "conversion", outcome: "error", message: "등록 실패 · 최신 후보를 확인하고 재시도하세요." } })); }
      }
      await client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog(), refetchType: "none" });
      await refresh();
    } finally { setBusy(false); }
  };
  const changeKind = async (row: OtwPlayReviewItemDto) => {
    if (!await confirm({ title: "영상 종류를 정정할까요?", description: "등록 준비 상태를 해제하고 새 종류의 가창 정보와 채널 승인을 다시 검수합니다. 이전 검수는 감사 기록에 보존됩니다.", confirmLabel: "종류 정정" })) return;
    setBusy(true);
    try {
      await updateOtwPlayImportCandidate(row.id, { action: "change_kind", expectedVersion: row.version, candidateKind: row.candidateKind === "official_video" ? "singing_clip" : "official_video" });
      await client.invalidateQueries({ queryKey: ["otw-play-review-kind-conflicts", jobId] });
      await refresh();
      toast({ variant: "success", description: "종류를 정정했습니다. 가창 정보와 채널 승인을 다시 검수해 주세요." });
    } catch { toast({ variant: "error", description: "등록되었거나 다른 관리자가 변경한 후보는 정정할 수 없습니다." }); }
    finally { setBusy(false); }
  };
  const deleteItem = async (row: OtwPlayReviewItemDto) => {
    setBusy(true);
    try {
      if (!await confirm({ title: "검수 항목을 삭제할까요?", description: `“${row.title ?? "제목 미확인"}”을 모든 검수 목록에서 제거합니다. 등록된 곡·가창과 처리 기록은 보존됩니다. 삭제한 항목은 다시 가져와도 목록에 표시되지 않습니다.`, confirmLabel: "삭제", destructive: true })) return;
      await deleteOtwPlayReviewItem(row.id, { kind: row.kind, expectedVersion: row.version });
      setSelectionState(current => Object.fromEntries(Object.entries(current).map(([key, ids]) => [key, Object.fromEntries(Object.entries(ids).filter(([id]) => id !== row.id))])));
      setAiSelection(current => ({ ...current, ids: Object.fromEntries(Object.entries(current.ids).filter(([id]) => id !== row.id)) }));
      setVisited(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== row.id)));
      setResultState(current => Object.fromEntries(Object.entries(current).map(([key, results]) => [key, Object.fromEntries(Object.entries(results).filter(([id]) => id !== row.id))])));
      await refresh(true);
      list.current?.focus({ preventScroll: true });
      toast({ variant: "success", description: "검수 목록에서 삭제했습니다." });
    } catch (error) {
      toast({ variant: "error", description: error instanceof Error ? error.message : "삭제하지 못했습니다. 목록을 새로고침하고 다시 시도해 주세요." });
    } finally { setBusy(false); }
  };
  const correctImportKinds = async () => {
    if (!selectedJob || !conflicts.data?.length || !await confirm({
      title: "가져오기 종류에 맞춰 정정할까요?",
      description: "같은 영상은 다른 이력과 분류를 공유합니다. 서버에 저장된 곡 연결·검수 내용은 보존하고 등록 준비 상태는 다시 확인합니다. 열린 폼의 저장하지 않은 입력은 정정 전에 저장해 주세요.",
      confirmLabel: "일괄 종류 정정",
    })) return;
    const targetKind = selectedJob.candidateKind ?? "official_video";
    const targets = [...conflicts.data];
    setBusy(true);
    try {
      for (const row of targets) {
        try {
          await updateOtwPlayImportCandidate(row.id, { action: "change_kind", expectedVersion: row.version, candidateKind: targetKind });
          setVisited(current => { const next = { ...current }; delete next[row.id]; return next; });
          setSelected(current => { const next = { ...current }; delete next[row.id]; return next; });
          setResults(current => ({ ...current, [row.id]: { action: "kind-correction", outcome: "success", message: "종류 정정 완료 · 가창 정보를 검수하세요." } }));
        } catch { setResults(current => ({ ...current, [row.id]: { action: "kind-correction", outcome: "error", message: "종류 정정 실패 · 최신 상태를 확인하고 재시도하세요." } })); }
      }
      await client.invalidateQueries({ queryKey: ["otw-play-review-kind-conflicts", jobId] });
      await refresh();
    } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    {budgetBlocked && running && <p role="status" className="text-sm text-muted-foreground">읽기 예산 대기 중입니다. 새 수집은 예산 초기화 후 재개하며, 검수·저장은 계속할 수 있습니다.</p>}
    <section ref={list} tabIndex={-1} aria-label="통합 검수 목록" hidden={Boolean(editingId || search.proposal)} className="space-y-5">
    <section aria-label="검수 목록 필터" className="space-y-4 border-b pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">목록 필터</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError && Boolean(query.data)} />
          <Button size="sm" variant="outline" onClick={() => void refresh()}>새로고침</Button>
        </div>
      </div>
      <div className={source === "playlist" ? "grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-[9rem_minmax(0,1fr)_9rem_11rem]" : "grid items-start gap-4 sm:grid-cols-3"}>
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">출처 <SelectField className="h-11 w-full min-w-0 sm:h-9" aria-label="검수 출처" value={source} disabled={busy} onValueChange={value => { setSelected({}); update({ source: value, selected: undefined, proposal: undefined, view: "inbox", category: undefined }); }} options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} /></label>
    {source === "playlist" && <div className="min-w-0 space-y-2">
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">가져오기 이력
        <SelectField
          aria-label="검수 가져오기 이력"
          disabled={busy || jobsQuery.isLoading}
          className="h-11 w-full min-w-0 max-w-full sm:h-9"
          value={jobId ?? ""}
          onValueChange={value => update({ category: value || undefined, kind: "all", selected: undefined }, false)}
          options={[
            ...(!jobId ? [{ value: "", label: "이력을 선택하세요" }] : []),
            ...(jobId && !jobsQuery.data?.some(job => job.id === jobId) ? [{ value: jobId, label: selectedJob?.playlistTitle ?? `선택한 이력 · ${jobId}` }] : []),
            ...(jobsQuery.data ?? []).map(job => ({ value: job.id, label: `${job.playlistTitle ?? job.playlistId} · ${new Date(job.createdAt).toLocaleString("ko-KR")} · ${job.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}` })),
          ]}
        />
      </label>
      {jobsQuery.isError && <p role="alert">가져오기 이력을 불러오지 못했습니다. <Button size="sm" variant="link" onClick={() => void jobsQuery.refetch()}>이력 다시 불러오기</Button></p>}
      {!jobsQuery.isLoading && !jobsQuery.isError && !jobId && <p className="text-sm text-muted-foreground">가져오기 이력이 없습니다. 새 가져오기를 시작하거나 다른 출처를 선택하세요.</p>}
    </div>}
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">영상 종류 <SelectField className="h-11 w-full min-w-0 sm:h-9" aria-label="검수 영상 종류" value={search.kind ?? "all"} onValueChange={value => { setSelected({}); update({ kind: value as "all" | "official" | "broadcast", selected: undefined }); }} options={[{ value: "all", label: "전체" }, { value: "official", label: "공식 곡" }, { value: "broadcast", label: "노래 클립" }]} /></label>
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">처리 상태 <SelectField className="h-11 w-full min-w-0 sm:h-9" aria-label="검수 처리 상태" value={filters.status ?? "pending"} onValueChange={value => { setSelected({}); update({ state: value }); }} options={[{ value: "pending", label: "검수 대기" }, { value: "ready", label: "등록 준비 완료" }, { value: "completed", label: "처리 완료" }]} /></label>
      </div>
      {source === "playlist" && jobId && <p className="text-xs leading-5 text-muted-foreground">선택한 이력에서 수집한 후보만 표시합니다. 여러 이력에서 발견된 같은 영상은 검수 정보를 공유합니다.</p>}
    </section>
    {source === "playlist" && Boolean(conflicts.data?.length) && <div role="status" className="space-y-2 border-l-2 border-primary pl-3">
      <p className="text-sm">이 이력은 {selectedJob?.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}으로 가져왔지만, 기존 후보 {conflicts.data!.length}개의 이전 분류가 유지되어 있습니다.</p>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void correctImportKinds()}>가져오기 종류로 일괄 정정</Button>
    </div>}
    {source === "playlist" && conflicts.isError && <p role="alert">기존 후보의 종류 충돌을 확인하지 못했습니다. 새로고침해 주세요.</p>}
    {source !== "user" && filters.status === "pending" && (source !== "playlist" || jobId) && <AiBatchPanel
      active={active && !editingId && !search.proposal} allSelected={aiAll} busy={aiBusy} setBusy={setAiBusy}
      selection={aiAll ? { filters: { source, ...(jobId ? { jobId } : {}), ...(filters.candidateKind ? { candidateKind: filters.candidateKind } : {}) } } : Object.keys(aiSelected).length ? { candidates: Object.entries(aiSelected).map(([id, version]) => ({ id, version })) } : null}
      onToggleAll={() => setAiSelection({ scope, all: !aiAll, ids: {} })}
      onStarted={() => setAiSelection({ scope, all: false, ids: {} })} />}

    <section aria-label="검수 후 등록" className="grid gap-3 border-b pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">검수 후 등록</h3>
        <p className="text-xs leading-5 text-muted-foreground">{source === "user" ? "제안을 선택해 영상·채널을 확인한 뒤 승인·게시하거나 거절합니다. 연결된 후보도 같은 제안에서 처리합니다." : "검수를 저장한 후보만 임시 등록합니다. 공개는 카탈로그에서 별도로 실행합니다."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:min-h-9 sm:[&>button]:w-auto">
        {(source !== "user" || selectableRows.length > 0) && <><Button variant="outline" disabled={busy || selectableRows.length === 0} onClick={toggleAllSelectableRows}>{allSelectableRowsSelected ? `일괄 선택 해제 (${selectableRows.length}개)` : `등록 가능 ${selectableRows.length}개 일괄 선택`}</Button><Button disabled={busy || !Object.keys(selected).length} onClick={() => void convert()}>선택 {Object.keys(selected).length}개 일괄 임시 등록</Button></>}<Button variant="ghost" onClick={() => onOpenCatalog()}>카탈로그 확인</Button>
      </div>
    </section>
    {conversionResults.length > 0 && <div role="status" aria-label="일괄 임시 등록 결과" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span className="font-medium">일괄 임시 등록 결과</span><span>완료 <strong className="tabular-nums">{conversionSuccessCount}개</strong></span><span className={conversionFailureCount > 0 ? "text-destructive" : "text-muted-foreground"}>실패 <strong className="tabular-nums">{conversionFailureCount}개</strong></span></div>}
    {query.isError && !query.isFetchNextPageError && <p role="alert">검수 목록을 불러오지 못했습니다. <Button variant="link" onClick={() => void query.refetch()}>다시 시도</Button></p>}
    {query.isLoading && <p role="status">검수 목록을 불러오는 중입니다.</p>}
    {!query.isLoading && !query.isError && !rows.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm">해당 조건의 검수 항목이 없습니다.</p>}
    <div className="space-y-2">
    {rows.map(row => <article key={`${row.kind}:${row.id}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-lg border p-4 xl:grid-cols-[2rem_minmax(0,1fr)_13rem_18rem] xl:items-center xl:gap-x-4">
      <label className="col-start-1 row-start-1 flex min-h-11 items-center justify-center xl:min-h-10">
      {aiEligible(row) && <Checkbox className="!min-h-4" aria-label={`${row.title ?? row.id} AI 초안 선택`} checked={aiAll || aiSelected[row.id] !== undefined} disabled={busy || aiAll} onCheckedChange={checked => setAiSelection(current => {
        const ids = current.scope === scope ? { ...current.ids } : {};
        if (checked) ids[row.id] = row.version; else delete ids[row.id];
        return { scope, all: false, ids };
      })} />}
      {row.kind === "candidate" && !aiEligible(row) && <Checkbox className="!min-h-4" aria-label={`${row.title ?? row.id} 선택`} checked={selected[row.id] !== undefined} disabled={busy || row.status !== "ready" || Boolean(row.pendingProposalId)} onCheckedChange={checked => setSelected(current => { const next = { ...current }; if (checked) next[row.id] = row.version; else delete next[row.id]; return next; })} />}
      </label>
      <div className="col-start-2 min-w-0 space-y-1">
        <p className="break-words text-sm font-medium leading-6">{row.title ?? "제목 미확인"}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{row.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}</span>
          {row.sources.map(source => <span key={source}>{sourceLabels[source]}</span>)}
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 xl:col-start-3">
        <Badge variant="secondary">{statusLabels[row.status] ?? row.status}</Badge>
        {row.aiDraft && <Badge variant="outline">AI · {aiBatchStatusLabels[row.aiDraft.status]}</Badge>}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 xl:col-start-4">
      <Button size="sm" variant="outline" className="h-11 flex-1 xl:h-9" disabled={busy || aiBusy} onClick={event => { if (row.pendingProposalId) onProposal(row.pendingProposalId); else if (row.kind === "proposal") onProposal(row.id); else { returnFocus.current = event.currentTarget; update({ view: "review", selected: row.id }, false); } }}>{row.pendingProposalId ? "연결된 제안 검수" : row.kind === "proposal" && row.status !== "pending_review" ? "처리 내역" : row.aiDraft && ["saved", "needs_selection", "changed"].includes(row.aiDraft.status) ? "초안 검수" : "검수 열기"}</Button>
      {row.kind === "candidate" && !["converted", "ignored"].includes(row.status) && <Button size="sm" variant="ghost" className="h-11 xl:h-9" disabled={busy} onClick={() => void changeKind(row)}>{row.candidateKind === "official_video" ? "노래 클립으로 정정" : "공식 영상으로 정정"}</Button>}
      <Button size="sm" variant="ghost" className="h-11 text-destructive hover:text-destructive xl:h-9" aria-label={`${row.title ?? row.id} 삭제`} disabled={busy || aiBusy || Boolean(row.pendingProposalId) || (row.kind === "proposal" && row.status === "pending_review")} onClick={() => void deleteItem(row)}>삭제</Button>
      </div>
      {row.aiDraft?.errorMessage && <p className="col-start-2 -col-end-1 break-words text-xs leading-5 text-destructive">AI · {row.aiDraft.errorMessage}</p>}
      {row.pendingProposalId && <p className="col-start-2 -col-end-1 text-xs leading-5 text-muted-foreground">같은 영상의 사용자 제안이 검수 대기 중입니다. 연결된 제안을 먼저 처리하면 이 이력에서 후속 검수를 진행할 수 있습니다.</p>}
      {row.kind === "proposal" && row.status === "pending_review" && <p className="col-start-2 -col-end-1 text-xs leading-5 text-muted-foreground">대기 중인 제안은 승인·거절 후 목록에서 삭제할 수 있습니다.</p>}
      {results[row.id] && !(results[row.id].action === "conversion" && results[row.id].outcome === "success") && <p className="col-start-2 -col-end-1 text-sm leading-6" role="status">{results[row.id].message}</p>}
    </article>)}
    </div>
    {Object.entries(results).filter(([id, result]) => !rows.some(row => row.id === id) && !(result.action === "conversion" && result.outcome === "success")).map(([id, result]) => <p key={id} role="status" className="text-sm">{result.message}</p>)}
    <div ref={setLoadMoreTarget} className="flex min-h-10 items-center justify-center gap-2">
      {query.isFetchingNextPage ? <p role="status" className="text-sm text-muted-foreground">다음 검수 항목을 불러오는 중입니다.</p> : query.isFetchNextPageError ? <><p role="alert" className="text-sm">다음 검수 항목을 불러오지 못했습니다.</p><Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>다음 항목 다시 시도</Button></> : query.hasNextPage ? <Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>더 보기</Button> : rows.length > 0 && <p className="text-sm text-muted-foreground">모든 검수 항목을 불러왔습니다.</p>}
    </div>
    </section>
    {editingId && editing && selectedJob && source === "playlist" && editing.candidateKind !== selectedJob.candidateKind && <p role="alert" className="text-sm">이 영상은 이전 가져오기의 분류를 유지하고 있습니다. 목록으로 돌아가 가져오기 종류로 정정한 뒤 검수하세요.</p>}
    {editingId && !editing && <section aria-label="검수 항목 불러오기" className="space-y-3">
      <Button variant="outline" onClick={closeReview}>검수 목록으로</Button>
      {query.isError ? <><p role="alert">검수 항목을 불러오지 못했습니다.</p><Button onClick={() => void query.refetch()}>다시 시도</Button></> : <p role="status">{query.isLoading || query.isFetching || query.hasNextPage ? "검수 항목을 불러오는 중입니다." : "현재 목록에서 항목을 찾을 수 없습니다. 목록의 처리 상태와 필터를 확인해 주세요."}</p>}
    </section>}
    {editingId && editing && !catalog && <p role="status">검수에 필요한 카탈로그 정보를 불러오고 있습니다. <Button variant="link" onClick={closeReview}>목록으로</Button></p>}
    {catalog && Object.values(reviewEntries).map(entry => {
      const latest = rows.find(row => row.kind === "candidate" && row.id === entry.id) ?? entry;
      return <div key={`${entry.id}:${latest.candidateKind}`} hidden={editing?.id !== entry.id}>
        <SingingClipReviewDialog presentation="page" active={active && editing?.id === entry.id} candidate={latest.candidate} candidateKind={latest.candidateKind} reviewOnly catalog={catalog} onReviewNext={nextReview}
          onOpenChange={open => { if (!open) closeReview(); }} onConverted={async () => { await client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog(), refetchType: "none" }); await refresh(); }} onReviewSaved={() => { scrollToListStart.current = true; }} onReviewStateChanged={refresh}
          onManageChannel={latest.channelId ? () => onManageChannel(latest.channelId!, latest.candidateKind) : undefined} />
      </div>;
    })}
  </div>;
}
