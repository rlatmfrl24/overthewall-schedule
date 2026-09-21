import { useConfirmation } from "@/shared/lib/confirmation";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminCatalogDto, OtwPlayReviewFilters, OtwPlayReviewItemDto } from "@contracts/otw-play";
import { fetchOtwPlayReviewItems, convertOtwPlayImportCandidate, updateOtwPlayImportCandidate } from "../../api/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Badge } from "@/shared/ui/badge";
import { useOtwPlayImportJobs } from "../../queries/use-admin-catalog";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";

const statusLabels: Record<string, string> = { withdrawn: "철회", discovered: "검수 대기", needs_input: "정보 입력 필요", ready: "등록 준비 완료", blocked: "확인 필요", converted: "등록 완료", ignored: "제외됨", pending_review: "제안 검수 대기", approved: "승인됨", rejected: "거절됨" };
const sourceLabels = { playlist: "플레이리스트", automatic: "자동 수집", user: "사용자 제안" };
export function ReviewInbox({ catalog, onProposal, onManageChannel, onOpenCatalog, active = true }: { active?: boolean; catalog: OtwPlayAdminCatalogDto | null; onProposal: (id: string) => void; onManageChannel: (id: string, kind?: "official_video" | "singing_clip") => void; onOpenCatalog: () => void }) {
  const [search, update] = useConsoleSearch();
  const jobsQuery = useOtwPlayImportJobs();
  const source = search.source === "automatic" || search.source === "user" ? search.source : !search.source && search.tab === "automatic-review" ? "automatic" : "playlist";
  const jobId = source === "playlist" ? search.category ?? jobsQuery.data?.[0]?.id : undefined;
  const selectedJob = jobsQuery.data?.find(job => job.id === jobId);
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
  const query = useInfiniteQuery({ enabled: active && (source !== "playlist" || Boolean(jobId)), queryKey: ["otw-play-review-inbox", filters], queryFn: ({ pageParam }) => fetchOtwPlayReviewItems({ ...filters, cursor: pageParam ?? undefined }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, refetchInterval: 30000 });
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const conflicts = useQuery({
    queryKey: ["otw-play-review-kind-conflicts", jobId, selectedJob?.candidateKind],
    enabled: active && source === "playlist" && Boolean(selectedJob),
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
  const [selectionState, setSelectionState] = useState<Record<string, Record<string, number>>>({});
  const selected = selectionState[scope] ?? {};
  const setSelected = (next: Record<string, number> | ((current: Record<string, number>) => Record<string, number>)) => setSelectionState(current => ({ ...current, [scope]: typeof next === "function" ? next(current[scope] ?? {}) : next }));
  const editingId = search.view === "review" ? search.selected : undefined;
  // Keep visited forms mounted so list navigation and failed saves retain local input.
  const [visited, setVisited] = useState<Record<string, OtwPlayReviewItemDto>>({});
  const [visitedScopes, setVisitedScopes] = useState<Record<string, boolean>>({});
  const editingScope = `${source}:${jobId ?? ""}:${editingId ?? ""}`;
  const editing = rows.find(row => row.kind === "candidate" && row.id === editingId) ?? (editingId && visitedScopes[editingScope] ? visited[editingId] : undefined);
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
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
      returnFocus.current?.scrollIntoView?.({ block: "nearest" });
    }
    previousEditingId.current = editingId;
  }, [editingId]);
  const closeReview = () => update({ view: "inbox", selected: undefined }, false);
  const reviewEntries = editing && !visited[editing.id] ? { ...visited, [editing.id]: editing } : visited;
  const [resultState, setResultState] = useState<Record<string, Record<string, string>>>({});
  const results = resultState[scope] ?? {};
  const setResults = (next: (current: Record<string, string>) => Record<string, string>) => setResultState(current => ({ ...current, [scope]: next(current[scope] ?? {}) }));
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["otw-play-review-inbox"] }), client.invalidateQueries({ queryKey: ["otw-play-review-kind-conflicts"] }), client.invalidateQueries({ queryKey: queryKeys.otwPlay.all })]); };
  const convert = async () => {
    setBusy(true);
    try {
      for (const [id, expectedVersion] of Object.entries(selected)) {
        try {
          const result = await convertOtwPlayImportCandidate(id, { expectedVersion });
          const ok = result.outcome === "created" || result.outcome === "duplicate";
          setResults(current => ({ ...current, [id]: ok ? "임시 등록 완료" : `등록 실패: ${result.errorCode ?? result.outcome}` }));
          if (ok) setSelected(current => { const next = { ...current }; delete next[id]; return next; });
        } catch { setResults(current => ({ ...current, [id]: "등록 실패 · 최신 후보를 확인하고 재시도하세요." })); }
      }
      await refresh();
    } finally { setBusy(false); }
  };
  const changeKind = async (row: OtwPlayReviewItemDto) => {
    if (!await confirm({ title: "영상 종류를 정정할까요?", description: "등록 준비 상태를 해제하고 새 종류의 가창 정보와 채널 승인을 다시 검수합니다. 이전 검수는 감사 기록에 보존됩니다.", confirmLabel: "종류 정정" })) return;
    setBusy(true);
    try {
      await updateOtwPlayImportCandidate(row.id, { action: "change_kind", expectedVersion: row.version, candidateKind: row.candidateKind === "official_video" ? "singing_clip" : "official_video" });
      await refresh();
      toast({ variant: "success", description: "종류를 정정했습니다. 가창 정보와 채널 승인을 다시 검수해 주세요." });
    } catch { toast({ variant: "error", description: "등록되었거나 다른 관리자가 변경한 후보는 정정할 수 없습니다." }); }
    finally { setBusy(false); }
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
          setResults(current => ({ ...current, [row.id]: "종류 정정 완료 · 가창 정보를 검수하세요." }));
        } catch { setResults(current => ({ ...current, [row.id]: "종류 정정 실패 · 최신 상태를 확인하고 재시도하세요." })); }
      }
      await refresh();
    } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <section aria-label="통합 검수 목록" hidden={Boolean(editingId)} className="space-y-3">
    {source === "playlist" && <div className="space-y-2">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">가져오기 이력
        <select aria-label="검수 가져오기 이력" disabled={busy || jobsQuery.isLoading} className="min-w-0 max-w-full rounded-md border bg-background p-2" value={jobId ?? ""} onChange={event => update({ category: event.target.value, kind: "all", selected: undefined }, false)}>
          {!jobId && <option value="">이력을 선택하세요</option>}
          {jobId && !selectedJob && <option value={jobId}>선택한 이력 · {jobId}</option>}
          {jobsQuery.data?.map(job => <option key={job.id} value={job.id}>{job.playlistTitle ?? job.playlistId} · {new Date(job.createdAt).toLocaleString("ko-KR")} · {job.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}</option>)}
        </select>
      </label>
      {jobsQuery.isError && <p role="alert">가져오기 이력을 불러오지 못했습니다. <Button size="sm" variant="link" onClick={() => void jobsQuery.refetch()}>이력 다시 불러오기</Button></p>}
      {!jobsQuery.isLoading && !jobsQuery.isError && !jobId && <p className="text-sm text-muted-foreground">가져오기 이력이 없습니다. 새 가져오기를 시작하거나 다른 출처를 선택하세요.</p>}
      {jobId && <p className="text-xs text-muted-foreground">선택한 이력에서 수집한 후보만 표시합니다. 여러 이력에서 발견된 같은 영상은 검수 정보를 공유합니다.</p>}
    </div>}
    {source === "playlist" && Boolean(conflicts.data?.length) && <div role="status" className="space-y-2 border-l-2 border-primary pl-3">
      <p className="text-sm">이 이력은 {selectedJob?.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}으로 가져왔지만, 기존 후보 {conflicts.data!.length}개의 이전 분류가 유지되어 있습니다.</p>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void correctImportKinds()}>가져오기 종류로 일괄 정정</Button>
    </div>}
    {source === "playlist" && conflicts.isError && <p role="alert">기존 후보의 종류 충돌을 확인하지 못했습니다. 새로고침해 주세요.</p>}
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">영상 종류 <select aria-label="검수 영상 종류" className="rounded-md border bg-background p-2" value={search.kind ?? "all"} onChange={e => { setSelected({}); update({ kind: e.target.value as "all" | "official" | "broadcast", selected: undefined }); }}><option value="all">전체</option><option value="official">공식 곡</option><option value="broadcast">노래 클립</option></select></label>
      <label className="text-sm">출처 <select aria-label="검수 출처" className="rounded-md border bg-background p-2" value={source} disabled={busy} onChange={e => { setSelected({}); update({ source: e.target.value, selected: undefined }); }}>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">처리 상태 <select aria-label="검수 처리 상태" className="rounded-md border bg-background p-2" value={filters.status} onChange={e => { setSelected({}); update({ state: e.target.value }); }}><option value="pending">검수 대기</option><option value="ready">등록 준비 완료</option><option value="completed">처리 완료</option></select></label>
      <Button variant="outline" onClick={() => void refresh()}>새로고침</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2"><Button disabled={busy || !Object.keys(selected).length} onClick={() => void convert()}>선택 {Object.keys(selected).length}개 일괄 임시 등록</Button><Button variant="outline" onClick={() => onOpenCatalog()}>카탈로그 확인</Button></div>
    <p className="text-xs text-muted-foreground">검수를 저장한 후보만 임시 등록합니다. 공개는 카탈로그에서 별도로 실행합니다.</p>
    {query.isError && !query.isFetchNextPageError && <p role="alert">검수 목록을 불러오지 못했습니다. <Button variant="link" onClick={() => void query.refetch()}>다시 시도</Button></p>}
    {query.isLoading && <p role="status">검수 목록을 불러오는 중입니다.</p>}
    {!query.isLoading && !query.isError && !rows.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm">해당 조건의 검수 항목이 없습니다.</p>}
    {rows.map(row => <article key={`${row.kind}:${row.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      {row.kind === "candidate" && <Checkbox aria-label={`${row.title ?? row.id} 선택`} checked={selected[row.id] !== undefined} disabled={busy || row.status !== "ready" || Boolean(row.pendingProposalId)} onCheckedChange={checked => setSelected(current => { const next = { ...current }; if (checked) next[row.id] = row.version; else delete next[row.id]; return next; })} />}
      <div className="min-w-0 flex-1"><p className="font-medium">{row.title ?? "제목 미확인"}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{row.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}</Badge><Badge variant="secondary">{statusLabels[row.status] ?? row.status}</Badge>{row.sources.map(source => <span className="text-xs text-muted-foreground" key={source}>{sourceLabels[source]}</span>)}</div></div>
      <Button size="sm" variant="outline" disabled={busy || !catalog} onClick={event => { if (row.pendingProposalId) onProposal(row.pendingProposalId); else if (row.kind === "proposal") onProposal(row.id); else { returnFocus.current = event.currentTarget; update({ view: "review", selected: row.id }, false); } }}>{row.pendingProposalId ? "연결된 제안 검수" : "검수 열기"}</Button>
      {row.pendingProposalId && <p className="w-full text-xs text-muted-foreground">같은 영상의 사용자 제안이 검수 대기 중입니다. 연결된 제안을 먼저 처리하면 이 이력에서 후속 검수를 진행할 수 있습니다.</p>}
      {row.kind === "candidate" && !["converted", "ignored"].includes(row.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void changeKind(row)}>{row.candidateKind === "official_video" ? "노래 클립으로 정정" : "공식 영상으로 정정"}</Button>}
      {results[row.id] && <p className="w-full text-sm" role="status">{results[row.id]}</p>}
    </article>)}
    {Object.entries(results).filter(([id]) => !rows.some(row => row.id === id)).map(([id, result]) => <p key={id} role="status" className="text-sm">{result}</p>)}
    <div ref={setLoadMoreTarget} className="flex min-h-10 items-center justify-center gap-2">
      {query.isFetchingNextPage ? <p role="status" className="text-sm text-muted-foreground">다음 검수 항목을 불러오는 중입니다.</p> : query.isFetchNextPageError ? <><p role="alert" className="text-sm">다음 검수 항목을 불러오지 못했습니다.</p><Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>다음 항목 다시 시도</Button></> : query.hasNextPage ? <Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>더 보기</Button> : rows.length > 0 && <p className="text-sm text-muted-foreground">모든 검수 항목을 불러왔습니다.</p>}
    </div>
    {!catalog && <p role="status">카탈로그 정보를 불러오지 못해 목록 조회만 가능합니다. 입력·등록은 정보가 복구되면 사용할 수 있습니다.</p>}
    </section>
    {editingId && editing && selectedJob && source === "playlist" && editing.candidateKind !== selectedJob.candidateKind && <p role="alert" className="text-sm">이 영상은 이전 가져오기의 분류를 유지하고 있습니다. 목록으로 돌아가 가져오기 종류로 정정한 뒤 검수하세요.</p>}
    {editingId && !editing && <section aria-label="검수 항목 불러오기" className="space-y-3">
      <Button variant="outline" onClick={closeReview}>검수 목록으로</Button>
      {query.isError ? <><p role="alert">검수 항목을 불러오지 못했습니다.</p><Button onClick={() => void query.refetch()}>다시 시도</Button></> : <p role="status">{query.isLoading || query.isFetching || query.hasNextPage ? "검수 항목을 불러오는 중입니다." : "현재 목록에서 항목을 찾을 수 없습니다. 목록의 처리 상태와 필터를 확인해 주세요."}</p>}
    </section>}
    {editingId && editing && !catalog && <p role="alert">카탈로그 정보를 불러와야 검수를 편집할 수 있습니다. <Button variant="link" onClick={closeReview}>목록으로</Button></p>}
    {catalog && Object.values(reviewEntries).map(entry => {
      const latest = rows.find(row => row.kind === "candidate" && row.id === entry.id) ?? entry;
      return <div key={`${entry.id}:${latest.candidateKind}`} hidden={editing?.id !== entry.id}>
        <SingingClipReviewDialog presentation="page" active={active && editing?.id === entry.id} candidate={latest.candidate} candidateKind={latest.candidateKind} reviewOnly catalog={catalog}
          onOpenChange={open => { if (!open) closeReview(); }} onConverted={refresh} onReviewStateChanged={refresh}
          onManageChannel={latest.channelId ? () => onManageChannel(latest.channelId!, latest.candidateKind) : undefined} />
      </div>;
    })}
  </div>;
}
