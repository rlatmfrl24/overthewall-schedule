import { QueryReadback } from "@/shared/ui/query-readback";
import {getContentWriteMessage} from '@/shared/api/client';
import { refreshReviewInbox } from "../../queries/refresh-review-inbox";
import { useConfirmation } from "@/shared/lib/confirmation";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminCatalogDto, OtwPlayIngestionJobDto, OtwPlayReviewFilters, OtwPlayReviewItemDto } from "@contracts/otw-play";
import { fetchOtwPlayReviewItems, convertOtwPlayImportCandidates, updateOtwPlayImportCandidate, deleteOtwPlayReviewItem } from "../../api/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Badge } from "@/shared/ui/badge";
import { SelectField } from "@/shared/ui/select-field";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";
import { aiBatchStatusLabels } from "@contracts/otw-play-ai-batch";
import { PiArrowRightBold, PiCheckBold, PiClockBold, PiMinusBold, PiMusicNotesBold, PiTrashBold, PiVideoCameraBold, PiXBold } from "react-icons/pi";

const statusLabels: Record<string, string> = { withdrawn: "철회", discovered: "검수 대기", needs_input: "정보 입력 필요", ready: "등록 준비 완료", blocked: "확인 필요", converted: "등록 완료", ignored: "제외됨", pending_review: "제안 검수 대기", approved: "승인됨", rejected: "거절됨" };
const proposalDate = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });
const proposalStatusIcons: Record<string, typeof PiClockBold> = {
  pending_review: PiClockBold, approved: PiCheckBold, rejected: PiXBold, withdrawn: PiMinusBold,
};
const conversionReasons: Record<string, string> = {
  channel_not_approved: "영상 채널의 승인 상태를 확인해 주세요.",
  validation_failed: "곡과 가창 정보의 등록 조건을 확인해 주세요.",
  external_service_unavailable: "영상 정보를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  stale_write: "검수 내용이 변경되었습니다. 최신 내용을 확인해 주세요.",
  CONTENT_MOVED: "영상이 다른 사이트로 이관되었습니다.",
  CONTENT_CONFLICT: "영상 정보가 충돌했습니다. 최신 내용을 확인해 주세요.",
};
const conversionReason = (code: string) => conversionReasons[code] ?? code;
type ReviewActionResult = { outcome: "success" | "error"; message: string };
export function ReviewInbox({ catalog, onProposal, onManageChannel, onOpenCatalog, active = true, playlistJob, canReview = false }: {
  active?: boolean;
  catalog: OtwPlayAdminCatalogDto | null;
  onProposal: (id: string, candidateId?: string) => void;
  onManageChannel: (id: string, kind?: "official_video" | "singing_clip") => void;
  onOpenCatalog: () => void;
  playlistJob?: OtwPlayIngestionJobDto;
  canReview?: boolean;
}) {
  const [search, update] = useConsoleSearch();
  const proposalsOnly = !playlistJob;
  const jobId = playlistJob?.id;
  const editingId = playlistJob && search.view === "review" ? search.selected : undefined;
  const filters: OtwPlayReviewFilters = {
    jobId,
    source: playlistJob ? "playlist" : "user",
    status: search.state === "completed" ? "completed" : search.state === "ready" && !proposalsOnly ? "ready"
      : playlistJob && search.state !== "pending" ? "all" : "pending",
  };
  const confirm = useConfirmation();
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useInfiniteQuery({ enabled: active, queryKey: ["otw-play-review-inbox", filters], queryFn: ({ pageParam }) => fetchOtwPlayReviewItems({ ...filters, cursor: pageParam ?? undefined }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity });
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const lastJobUpdate = useRef(playlistJob?.updatedAt);
  useEffect(() => {
    if (!active || !jobId || lastJobUpdate.current === playlistJob?.updatedAt) return;
    lastJobUpdate.current = playlistJob?.updatedAt;
    void client.invalidateQueries({ queryKey: ["otw-play-review-inbox", { source: "playlist", jobId }] });
  }, [active, client, jobId, playlistJob?.updatedAt]);
  const canSelect = (row: OtwPlayReviewItemDto) => Boolean(canReview && playlistJob &&
    row.contentAccess !== "admin_archive" && row.kind === "candidate" && row.status === "ready" &&
    !row.pendingProposalId && row.candidate?.availabilityStatus !== "unknown" &&
    row.candidateKind === (playlistJob.candidateKind ?? "official_video"));
  const selectableRows = rows.filter(canSelect);
  const scope = filters.status ?? "pending";
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
  const editingScope = `${scope}:${editingId ?? ""}`;
  const canEdit = (row: OtwPlayReviewItemDto) => canReview && row.kind === "candidate" && !["converted", "ignored"].includes(row.status);
  const editedRow = rows.find(row => row.kind === "candidate" && row.id === editingId) ?? (editingId && visitedScopes[editingScope] ? visited[editingId] : undefined);
  const editing = editedRow && canEdit(editedRow) && !editedRow.pendingProposalId ? editedRow : undefined;
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
  const list = useRef<HTMLElement | null>(null);
  const scrollToListStart = useRef(false);
  const previousEditingId = useRef(editingId);
  useEffect(() => {
    if (editing && !visited[editing.id]) setVisited(current => ({ ...current, [editing.id]: editing }));
    if (editing && !visitedScopes[editingScope]) setVisitedScopes(current => ({ ...current, [editingScope]: true }));
  }, [editing, visited, visitedScopes, editingScope]);
  useEffect(() => {
    if (active && editingId && !editedRow && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [active, editingId, editedRow, hasNextPage, isFetching, isError, fetchNextPage]);
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
      const next = page.items.find(row => row.id !== editingId && canEdit(row) && row.status !== "ready" && !row.pendingProposalId && row.candidate?.availabilityStatus === "playable");
      if (next) { update({ view: "review", selected: next.id, state: "pending" }, false); return; }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    closeReview();
  };
  const reviewEntries = editing && !visited[editing.id] ? { ...visited, [editing.id]: editing } : visited;
  const [resultState, setResultState] = useState<Record<string, Record<string, ReviewActionResult>>>({});
  const convertedIds = new Set(rows.filter(row => row.kind === "candidate" && row.status === "converted").map(row => row.id));
  const results = Object.fromEntries(Object.entries(resultState[scope] ?? {}).map(([id, result]) => [
    id, result.outcome === "error" && convertedIds.has(id) ? { outcome: "success", message: "임시 등록 완료" } : result,
  ]));
  const setResults = (next: (current: Record<string, ReviewActionResult>) => Record<string, ReviewActionResult>) => setResultState(current => ({ ...current, [scope]: next(current[scope] ?? {}) }));
  const conversionResults = Object.values(results);
  const conversionSuccessCount = conversionResults.filter(result => result.outcome === "success").length;
  const conversionFailureCount = conversionResults.filter(result=>result.outcome==='error').length;
  const refresh = async (allScopes = false) => {
    await Promise.all([
      refreshReviewInbox(client, allScopes ? undefined : filters),
      ...(jobId ? [
        client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs(), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJob(jobId), exact: true }),
      ] : []),
    ]);
  };

  const convert = async () => {
    if (!playlistJob || !canReview || !await confirm({ title: "선택 항목을 카탈로그에 추가할까요?", description: `검수한 영상 ${Object.keys(selected).length}개와 필요한 곡·인물·태그 정보를 비공개로 등록합니다.`, confirmLabel: "카탈로그 추가" })) return;
    setResults(() => ({}));
    setBusy(true);
    try {
      for (const [id, expectedVersion] of Object.entries(selected)) {
        try {
          const request = { candidates: [{ id, expectedVersion }] };
          const response = await convertOtwPlayImportCandidates(playlistJob.id, request).catch(error => {
            if (!(error instanceof TypeError)) throw error;
            return convertOtwPlayImportCandidates(playlistJob.id, request);
          });
          const result = response.results[0];
          const ok = result.outcome === "created" || result.outcome === "duplicate";
          setResults(current => ({ ...current, [id]: { outcome: ok ? "success" : "error", message: ok ? "임시 등록 완료" : `등록 실패: ${conversionReason(result.errorCode ?? result.outcome)}` } }));
          setSelected(current => { const next = { ...current }; delete next[id]; return next; });
        } catch(error) {
          setResults(current => ({ ...current, [id]: { outcome: "error", message: getContentWriteMessage(error)??"등록 실패 · 최신 후보를 확인하고 재시도하세요." } }));
          setSelected(current => { const next = { ...current }; delete next[id]; return next; });
        }
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
      await refresh(true);
      list.current?.focus({ preventScroll: true });
      toast({ variant: "success", description: "검수 목록에서 삭제했습니다." });
    } catch (error) {
      toast({ variant: "error", description: error instanceof Error ? error.message : "삭제하지 못했습니다. 목록을 새로고침하고 다시 시도해 주세요." });
    } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <section ref={list} tabIndex={-1} aria-label={proposalsOnly ? "사용자 제안 목록" : "플레이리스트 영상 목록"} hidden={Boolean(editingId || search.proposal)} className={proposalsOnly ? "@container/proposals min-w-0 space-y-4" : "space-y-5"}>
    {proposalsOnly ? <section aria-labelledby="proposal-list-heading" className="space-y-4 rounded-xl border bg-card p-4 @min-[32rem]/proposals:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="proposal-list-heading" className="text-xl leading-tight font-semibold tracking-tight">사용자 제안</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">영상과 가창 정보를 확인하고 제안을 처리합니다.</p>
        </div>
        <Button size="sm" variant="outline" className="min-h-11 @min-[32rem]/proposals:min-h-9" disabled={query.isFetching} onClick={() => void refresh()}>새로고침</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3">
        <div role="group" aria-label="검수 처리 상태" className="inline-flex gap-1 rounded-lg border bg-background p-1">
          {([{ value: "pending", label: "검수 대기" }, { value: "completed", label: "처리 완료" }] as const).map(option => {
            const isCurrent = filters.status === option.value;
            return <Button key={option.value} type="button" size="sm" aria-pressed={isCurrent} variant={isCurrent ? "default" : "ghost"} className="min-h-11 @min-[32rem]/proposals:min-h-9" onClick={() => update({ state: option.value === "completed" ? "completed" : undefined }, false)}>{option.label}</Button>;
          })}
        </div>
        <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError && Boolean(query.data)} />
      </div>
    </section> : <section aria-label="검수 목록 필터" className="space-y-3 border-b pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">가져온 영상</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError && Boolean(query.data)} />
          <Button size="sm" variant="outline" onClick={() => void refresh()}>새로고침</Button>
        </div>
      </div>
      <label className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium">처리 상태
        <SelectField className="min-w-32 data-[size=default]:h-11 @min-[32rem]/import:data-[size=default]:h-9" aria-label="검수 처리 상태"
          value={scope} onValueChange={value => { setSelected({}); update({ state: value }); }}
          options={[{ value: "all", label: "전체 영상" }, { value: "pending", label: "검수 중 · 추가 대기" }, { value: "ready", label: "추가 대기" }, { value: "completed", label: "처리 완료" }]} />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">여러 작업에 같은 영상이 있으면 검수 정보를 공유합니다.</p>
    </section>}
    {playlistJob && rows.length > 0 && (canReview
      ? <section aria-label="검수 후 등록" className="grid gap-3 rounded-xl border bg-card p-3.5 @min-[48rem]/import:grid-cols-[minmax(0,1fr)_auto] @min-[48rem]/import:items-center">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">검수 후 등록</h3>
          <p className="text-xs leading-5 text-muted-foreground">검수 저장으로 초안을 남긴 뒤 추가할 영상을 선택하세요. 선택한 영상은 비공개로 등록됩니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:min-h-9 sm:[&>button]:w-auto">
          <Button variant="outline" disabled={busy || selectableRows.length === 0} onClick={toggleAllSelectableRows}>{allSelectableRowsSelected ? `일괄 선택 해제 (${selectableRows.length}개)` : `등록 가능 ${selectableRows.length}개 일괄 선택`}</Button>
          <Button disabled={busy || !Object.keys(selected).length} onClick={() => void convert()}>선택 항목 카탈로그 추가 ({Object.keys(selected).length}개)</Button>
          <Button variant="ghost" onClick={() => onOpenCatalog()}>카탈로그 확인</Button>
        </div>
      </section>
      : <p role="status" className="rounded-lg border bg-muted/30 px-3.5 py-2 text-xs text-muted-foreground">영상 수집과 AI 일괄 검수가 끝나면 영상별 검수를 진행할 수 있습니다.</p>)}
    {conversionResults.length > 0 && <div role="status" aria-label="일괄 임시 등록 결과" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span className="font-medium">일괄 임시 등록 결과</span><span>완료 <strong className="tabular-nums">{conversionSuccessCount}개</strong></span><span className={conversionFailureCount > 0 ? "text-destructive" : "text-muted-foreground"}>실패 <strong className="tabular-nums">{conversionFailureCount}개</strong></span></div>}
    {query.isError && !query.isFetchNextPageError && <p role="alert">검수 목록을 불러오지 못했습니다. <Button variant="link" onClick={() => void query.refetch()}>다시 시도</Button></p>}
    {query.isLoading && <p role="status">검수 목록을 불러오는 중입니다.</p>}
    {!query.isLoading && !query.isError && !rows.length && <div className={proposalsOnly ? "rounded-xl border border-dashed px-4 py-5 text-sm" : "rounded-lg border border-dashed p-6 text-center text-sm"}>
      {proposalsOnly ? <><p className="font-medium">{filters.status === "completed" ? "아직 처리된 제안이 없습니다." : "검수 대기 중인 제안이 없습니다."}</p><p className="mt-1 text-muted-foreground">{filters.status === "completed" ? "승인, 거절 또는 철회된 제안이 여기에 표시됩니다." : "사용자가 새 곡을 제안하면 여기에 표시됩니다."}</p></> : "해당 조건의 검수 항목이 없습니다."}
    </div>}
    <div className="space-y-2">
    {rows.map(row => {
      if (proposalsOnly && row.kind === "proposal") {
        const pending = row.status === "pending_review";
        const StatusIcon = proposalStatusIcons[row.status];
        const title = row.title ?? "제목 미확인";
        return <article key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border bg-card p-3.5 @min-[36rem]/proposals:grid-cols-[auto_minmax(0,1fr)_auto] @min-[36rem]/proposals:items-center">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">{row.candidateKind === "singing_clip" ? <PiMusicNotesBold /> : <PiVideoCameraBold />}</span>
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-sm leading-snug font-semibold wrap-anywhere">{title}</h3>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
              <Badge variant={pending ? "secondary" : "outline"} className="gap-1 whitespace-nowrap">{StatusIcon && <StatusIcon aria-hidden="true" />}{pending ? "검수 대기" : statusLabels[row.status] ?? row.status}</Badge>
              <span>{row.candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"}</span>
              <time dateTime={new Date(row.createdAt).toISOString()} className="tabular-nums">{proposalDate.format(row.createdAt)} 접수</time>
            </div>
          </div>
          <div className="col-start-2 flex flex-wrap items-center gap-2 @min-[36rem]/proposals:col-start-3">
            <Button size="sm" variant="outline" className="min-h-11 @min-[36rem]/proposals:min-h-9" disabled={busy} onClick={() => onProposal(row.id)}>{pending ? "검수 열기" : "처리 내역"}<PiArrowRightBold aria-hidden="true" /></Button>
            {!pending && row.contentAccess !== "admin_archive" && <Button size="icon" variant="ghost" className="size-11 text-destructive @min-[36rem]/proposals:size-9" aria-label={`${title} 삭제`} disabled={busy} onClick={() => void deleteItem(row)}><PiTrashBold aria-hidden="true" /></Button>}
          </div>
        </article>;
      }
      if (!playlistJob || row.kind !== "candidate") return null;
      const ready = row.status === "ready";
      return <article key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-3 py-2.5 @min-[36rem]/import:grid-cols-[auto_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)]">
        {ready && <label className="col-start-1 row-start-1 flex min-h-11 items-center justify-center">
          <Checkbox className="!min-h-4" aria-label={`${row.title ?? row.id} 선택`} checked={selected[row.id] !== undefined} disabled={busy || !canSelect(row)}
            onCheckedChange={checked => setSelected(current => {
              const next = { ...current };
              if (checked) next[row.id] = row.version;
              else delete next[row.id];
              return next;
            })} />
        </label>}
        <div className={ready ? "col-start-2 min-w-0 space-y-1" : "col-span-2 col-start-1 row-start-1 min-w-0 space-y-0.5"}>
          <p className="text-sm leading-5 font-medium wrap-anywhere">{row.title ?? "제목 미확인"}</p>
          <p className="text-xs text-muted-foreground">{row.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}</p>
        </div>
        <div className="col-start-3 row-start-1 flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{statusLabels[row.status] ?? row.status}</Badge>
          {row.aiDraft && <Badge variant="outline">AI · {aiBatchStatusLabels[row.aiDraft.status]}</Badge>}
        </div>
        <div className="col-span-3 col-start-1 flex flex-wrap justify-end gap-2 empty:hidden @min-[36rem]/import:col-span-1 @min-[36rem]/import:col-start-4 @min-[36rem]/import:row-start-1">
          {row.pendingProposalId ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onProposal(row.pendingProposalId!, row.id)}>연결된 제안 검수</Button>
            : canEdit(row) && <Button size="sm" variant="outline" className="h-11 @min-[36rem]/import:h-9" disabled={busy} onClick={event => {
              returnFocus.current = event.currentTarget;
              update({ view: "review", selected: row.id }, false);
            }}>{row.aiDraft && ["saved", "needs_selection", "changed"].includes(row.aiDraft.status) ? "초안 검수" : "검수 열기"}</Button>}
          {canEdit(row) && row.candidateKind !== playlistJob.candidateKind && <Button size="sm" variant="ghost" className="h-11 xl:h-9" disabled={busy || row.contentAccess === "admin_archive"} onClick={() => void changeKind(row)}>{row.candidateKind === "official_video" ? "노래 클립으로 정정" : "공식 영상으로 정정"}</Button>}
        </div>
        {row.aiDraft?.errorMessage && <p className="col-start-2 -col-end-1 break-words text-xs leading-5 text-destructive">AI · {row.aiDraft.errorMessage}</p>}
        {row.status === "ready" && row.candidate?.availabilityStatus === "unknown" && <p className="col-start-2 -col-end-1 text-xs text-muted-foreground">검수를 열어 영상 정보를 다시 확인하면 저장한 초안을 이어서 등록할 수 있습니다.</p>}
        {row.conversionErrorCode && !results[row.id] && <p className="col-start-2 -col-end-1 text-sm text-destructive">등록 실패 · {conversionReason(row.conversionErrorCode)}</p>}
        {row.pendingProposalId && <p className="col-start-2 -col-end-1 text-xs leading-5 text-muted-foreground">같은 영상의 사용자 제안이 검수 대기 중입니다. 연결된 제안을 먼저 처리하면 이 이력에서 후속 검수를 진행할 수 있습니다.</p>}
        {results[row.id]?.outcome === "error" && <p className="col-start-2 -col-end-1 text-sm leading-6" role="status">{results[row.id].message}</p>}
      </article>;
    })}
    </div>
    {Object.entries(results).filter(([id, result]) => !rows.some(row => row.id === id) && result.outcome === "error").map(([id, result]) => <p key={id} role="status" className="text-sm">{result.message}</p>)}
    <div ref={setLoadMoreTarget} className="flex min-h-10 items-center justify-center gap-2">
      {query.isFetchingNextPage ? <p role="status" className="text-sm text-muted-foreground">다음 검수 항목을 불러오는 중입니다.</p> : query.isFetchNextPageError ? <><p role="alert" className="text-sm">다음 검수 항목을 불러오지 못했습니다.</p><Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>다음 항목 다시 시도</Button></> : query.hasNextPage ? <Button variant="outline" disabled={busy || isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>더 보기</Button> : rows.length > 0 && <p className="text-sm text-muted-foreground">모든 검수 항목을 불러왔습니다.</p>}
    </div>
    </section>
    {editingId && editing && playlistJob && editing.candidateKind !== playlistJob.candidateKind && <p role="alert" className="text-sm">이 영상은 이전 가져오기의 분류를 유지하고 있습니다. 목록으로 돌아가 가져오기 종류로 정정한 뒤 검수하세요.</p>}
    {editingId && !editing && <section aria-label="검수 항목 불러오기" className="space-y-3">
      <Button variant="outline" onClick={closeReview}>검수 목록으로</Button>
      {editedRow ? <p role="status">{editedRow.title ?? editedRow.id} · {statusLabels[editedRow.status] ?? editedRow.status}</p> : query.isError ? <><p role="alert">검수 항목을 불러오지 못했습니다.</p><Button onClick={() => void query.refetch()}>다시 시도</Button></> : <p role="status">{query.isLoading || query.isFetching || query.hasNextPage ? "검수 항목을 불러오는 중입니다." : "현재 목록에서 항목을 찾을 수 없습니다. 목록의 처리 상태와 필터를 확인해 주세요."}</p>}
      {playlistJob && editedRow?.pendingProposalId && <Button variant="outline" onClick={() => onProposal(editedRow.pendingProposalId!, editedRow.id)}>연결된 제안 검수</Button>}
    </section>}
    {editingId && editing && !catalog && <p role="status">검수에 필요한 카탈로그 정보를 불러오고 있습니다. <Button variant="link" onClick={closeReview}>목록으로</Button></p>}
    {catalog && Object.values(reviewEntries).map(entry => {
      const latest = rows.find(row => row.kind === "candidate" && row.id === entry.id) ?? entry;
      return <div key={`${entry.id}:${latest.candidateKind}`} hidden={editing?.id !== entry.id}>
        <SingingClipReviewDialog presentation="page" active={active && editing?.id === entry.id} candidate={latest.candidate} candidateKind={latest.candidateKind} reviewOnly playlistJobId={playlistJob?.id} catalog={catalog} onReviewNext={nextReview}
          onOpenChange={open => { if (!open) closeReview(); }} onConverted={async () => { await client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog(), refetchType: "none" }); await refresh(); }} onReviewSaved={() => { scrollToListStart.current = true; }} onReviewStateChanged={refresh}
          onManageChannel={latest.channelId ? () => onManageChannel(latest.channelId!, latest.candidateKind) : undefined} />
      </div>;
    })}
  </div>;
}
