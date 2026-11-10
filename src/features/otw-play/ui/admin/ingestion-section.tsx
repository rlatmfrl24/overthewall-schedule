import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gsap } from "gsap";
import { PiArrowLeftBold, PiArrowRightBold, PiCheckBold, PiLinkSimpleBold, PiMusicNotesBold, PiPlaylistBold, PiVideoCameraBold, PiWarningCircleBold } from "react-icons/pi";
import type { OtwPlayAdminCatalogDto, OtwPlayIngestionJobDto, OtwPlayPlaylistPreflightDto } from "@contracts/otw-play";
import type { AiBatchSummary } from "@contracts/otw-play-ai-batch";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useAnimations } from "@/shared/ui/animation-provider";
import { Input } from "@/shared/ui/input";
import { SelectField } from "@/shared/ui/select-field";
import { Progress } from "@/shared/ui/progress";
import { createOtwPlayPlaylistImport, preflightOtwPlayPlaylistImport, resumeOtwPlayImportJob, retryOtwPlayImportJob } from "../../api/admin";
import { getAiBatch, retryAiBatch, startAiBatch } from "../../api/ai-batch";
import { fetchWorkBatch } from "../../api/work-queue";
import { useOtwPlayImportJob, useOtwPlayImportJobs } from "../../queries/use-admin-catalog";
import { useIngestionBudget } from "../../queries/use-ingestion-budget";
import { refreshReviewInbox } from "../../queries/refresh-review-inbox";
import { ReviewInbox } from "./review-inbox";

const statusLabels: Record<OtwPlayIngestionJobDto["status"], string> = {
  queued: "수집 대기", collecting: "영상 수집 중", completed: "수집 완료",
  partial: "일부 수집 실패", failed: "수집 실패",
};

const pendingAnalysis = (batch?: AiBatchSummary) => batch ? batch.counts.queued + batch.counts.analyzing + batch.counts.saving : 0;

type CandidateKind = "official_video" | "singing_clip";

function ImportSteps({ current, manualReview = false }: { current: number; manualReview?: boolean }) {
  return <ol aria-label="가져오기 진행 단계" className="grid grid-flow-dense grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @min-[32rem]/import:grid-cols-4">
    {["링크·수집", "AI 일괄 검수", "관리자 검수", "카탈로그 추가"].map((label, index) => (
      <li key={label} aria-current={current === index ? "step" : undefined}
        className={`flex min-h-11 items-center gap-2 bg-background px-2.5 py-2 text-xs @min-[32rem]/import:px-3 ${current === index ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[0.6875rem] tabular-nums ${current === index ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {index < current && !(manualReview && index === 1) ? <><PiCheckBold aria-hidden="true" /><span className="sr-only">완료</span></> : <span aria-hidden="true">{index + 1}</span>}
        </span>
        {manualReview && index === 1 ? "AI 검수 보류" : label}
      </li>
    ))}
  </ol>;
}

export function IngestionSection({ active = true, catalog = null, onManageChannel = () => {}, onProposal = () => {}, onOpenCatalog = () => {} }: {
  active?: boolean;
  catalog?: OtwPlayAdminCatalogDto | null;
  onManageChannel?: (id: string, kind?: CandidateKind) => void;
  onProposal?: (id: string, candidateId?: string) => void;
  onOpenCatalog?: () => void;
}) {
  const client = useQueryClient();
  const [search, navigate] = useConsoleSearch();
  const fieldId = useId();
  const verifiedIcon = useRef<HTMLSpanElement>(null);
  const { enabled: animationsEnabled } = useAnimations();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<CandidateKind>("official_video");
  const [preflight, setPreflight] = useState<OtwPlayPlaylistPreflightDto | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const busy = operation !== null;
  const [error, setError] = useState<string | null>(null);
  const [collectionRetry, setCollectionRetry] = useState<{ jobId: string; message: string } | null>(null);
  const jobId = search.category === "all-playlist-imports" ? undefined : search.category;
  const legacyBatch = useQuery({
    queryKey: ["otw-play-work-batch", search.workBatch],
    queryFn: () => fetchWorkBatch(search.workBatch!),
    enabled: active && !jobId && Boolean(search.workBatch),
    retry: false,
  });
  const resolvedLegacyJobId = legacyBatch.data?.data.jobId;
  useEffect(() => {
    if (active && !jobId && resolvedLegacyJobId) {
      navigate({ category: resolvedLegacyJobId, workBatch: undefined, workQueue: undefined, workItem: undefined });
    }
  }, [active, jobId, resolvedLegacyJobId, navigate]);
  const budget = useIngestionBudget(active);
  const budgetBlocked = budget.data?.status === "blocked" && Date.parse(budget.data.resetAt) > Date.now();
  const jobs = useOtwPlayImportJobs(active && !jobId);
  const jobCards = jobs.data?.pages.flatMap(page => page.data) ?? [];
  const jobQuery = useOtwPlayImportJob(jobId ?? null, active, budgetBlocked);
  const job = jobQuery.data;
  const batchQuery = useQuery({
    queryKey: ["play-import-ai", job?.aiBatchId],
    queryFn: () => getAiBatch(job!.aiBatchId!),
    enabled: active && Boolean(job?.aiBatchId),
    retry: false,
    refetchInterval: (query) => active && job?.aiExecutionAvailable && pendingAnalysis(query.state.data?.data.batch) > 0 ? 5000 : false,
  });
  const batch = batchQuery.data?.data.batch;
  const pending = pendingAnalysis(batch);
  const collected = job?.status === "completed";
  const manualReview = collected && job.aiExecutionAvailable === false && !job.aiBatchId && !job.aiSharedPending;
  const canReview = Boolean(
    (collected && batch && pending === 0 && !job?.aiBatchNeedsResume) ||
    job?.canResumeLegacyReview || manualReview,
  );
  useEffect(() => {
    if (active && batch?.id && pending === 0) void refreshReviewInbox(client);
  }, [active, batch?.id, pending, client]);
  useEffect(() => {
    if (!active || !animationsEnabled || !preflight || !verifiedIcon.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(verifiedIcon.current, { scale: 0.86, opacity: 0.65 }, { scale: 1, opacity: 1, duration: 0.22, ease: "expo.out" });
    });
    return () => context.revert();
  }, [active, animationsEnabled, preflight]);

  const run = async (task: () => Promise<void>, label = "요청 처리 중") => {
    setOperation(label);
    setError(null);
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "작업을 완료하지 못했습니다. 다시 시도해 주세요."); }
    finally { setOperation(null); }
  };
  const open = (category?: string) => {
    setError(null);
    navigate({ category, view: undefined, state: undefined, selected: undefined, workBatch: undefined, workQueue: undefined, workItem: undefined }, false);
  };
  const refresh = async () => {
    await Promise.all([jobQuery.refetch(), client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs(), exact: true })]);
  };
  const startImport = async () => {
    if (!preflight || preflight.requiresSplit) return;
    const input = { playlistUrl: preflight.canonicalUrl, mode: "all_new" as const, candidateKind: kind };
    const key = `play-import:${preflight.playlistId}:${kind}`;
    const idempotencyKey = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, idempotencyKey);
    const created = await createOtwPlayPlaylistImport({ ...input, idempotencyKey });
    sessionStorage.removeItem(key);
    client.setQueryData(queryKeys.otwPlay.importJob(created.id), created);
    setUrl("");
    setPreflight(null);
    open(created.id);
    await client.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs(), exact: true });
  };
  const startAnalysis = async () => {
    if (!job) return;
    const response = await startAiBatch({ importJobId: job.id }, crypto.randomUUID());
    client.setQueryData(queryKeys.otwPlay.importJob(job.id), { ...job, aiBatchId: response.data.id });
    await refresh();
  };

  if (!jobId && !search.workBatch) return (
    <div className="@container/import min-w-0 space-y-4 md:space-y-6">
      <ImportSteps current={0} />
      <form aria-labelledby={`${fieldId}-title`} className="space-y-4 rounded-xl border bg-card p-4 @min-[32rem]/import:p-5" onSubmit={event => {
        event.preventDefault();
        if (!busy && url.trim()) void run(async () => setPreflight(await preflightOtwPlayPlaylistImport({
          playlistUrl: url.trim(), candidateKind: kind, mode: "all_new",
        })), "링크 확인 중");
      }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${fieldId}-title`} className="w-full max-w-5xl text-xl leading-tight font-semibold tracking-tight">플레이리스트 가져오기</h2>
            <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-muted-foreground">공개 또는 일부 공개 YouTube 플레이리스트 · 최대 5,000개</p>
          </div>
          <span aria-hidden="true" className="hidden size-10 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground @min-[26rem]/import:grid"><PiPlaylistBold className="size-5" /></span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 @min-[32rem]/import:grid-cols-[minmax(0,1fr)_8.5rem_auto]">
          <div className="col-span-2 grid min-w-0 gap-1.5 @min-[32rem]/import:col-span-1">
            <label className="text-sm font-medium" htmlFor={`${fieldId}-url`}>YouTube 플레이리스트 링크</label>
            <div className="relative min-w-0">
              <PiLinkSimpleBold aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id={`${fieldId}-url`} aria-describedby={`${fieldId}-hint`} inputMode="url" autoComplete="off" spellCheck={false} className="h-11 bg-background pl-9" value={url} placeholder="https://www.youtube.com/playlist?list=…" disabled={busy}
                onChange={event => { setUrl(event.target.value); setPreflight(null); setError(null); }} />
            </div>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <label className="text-sm font-medium" htmlFor={`${fieldId}-kind`}>영상 종류</label>
            <SelectField id={`${fieldId}-kind`} className="h-11 w-full bg-background data-[size=default]:h-11" value={kind} disabled={busy} onValueChange={value => {
              if (value === "official_video" || value === "singing_clip") { setKind(value); setPreflight(null); setError(null); }
            }} options={[{ value: "official_video", label: "공식 영상" }, { value: "singing_clip", label: "노래 클립" }]} />
          </div>
          <Button className="min-h-11" type="submit" variant={preflight ? "outline" : "default"} disabled={busy || !url.trim()}>
            링크 확인<PiArrowRightBold aria-hidden="true" />
          </Button>
        </div>
        {preflight && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
          <div className="flex min-w-0 flex-1 basis-48 items-start gap-2.5">
            <span ref={verifiedIcon} aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted">
              {preflight.requiresSplit ? <PiWarningCircleBold /> : <PiCheckBold />}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-medium wrap-anywhere" role="status">{preflight.title} · {preflight.itemCount.toLocaleString("ko-KR")}개</p>
              {preflight.requiresSplit && <p role="alert" className="text-sm text-destructive">5,000개를 초과합니다. 5,000개 이하의 플레이리스트 링크를 입력해 주세요.</p>}
            </div>
          </div>
          <Button className="min-h-11" type="button" disabled={busy || preflight.requiresSplit} onClick={() => void run(startImport, "가져오기 요청 중")}>가져오기 시작</Button>
        </div>}
        {operation && <p role="status" className="text-sm text-muted-foreground">{operation}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <section aria-label="가져오기 작업 목록" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b pb-2.5">
          <h2 className="text-base font-semibold">가져오기 작업</h2>
          {jobCards.length > 0 && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">표시 중 {jobCards.length.toLocaleString("ko-KR")}건</span>}
        </div>
        {jobs.isLoading && <p role="status">가져오기 작업을 불러오는 중입니다.</p>}
        {jobs.isError && !jobs.isFetchNextPageError && <p role="alert">가져오기 작업을 불러오지 못했습니다. <Button variant="link" onClick={() => void jobs.refetch()}>다시 시도</Button></p>}
        {jobs.isSuccess && !jobCards.length && <div className="rounded-xl border border-dashed px-4 py-5">
          <p className="text-sm font-medium">아직 가져온 플레이리스트가 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">위에서 링크를 확인하고 가져오기를 시작하면 이곳에 작업이 표시됩니다.</p>
        </div>}
        {jobCards.length > 0 && <ul className="space-y-2">
          {jobCards.map(item => <li key={item.id}>
            <button type="button" className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring @min-[32rem]/import:grid-cols-[auto_minmax(0,1fr)_auto_auto]" onClick={() => open(item.id)}>
              <span aria-hidden="true" className="row-span-2 grid size-9 place-items-center self-start rounded-lg bg-muted text-muted-foreground @min-[32rem]/import:row-span-1 @min-[32rem]/import:self-center">
                {item.candidateKind === "singing_clip" ? <PiMusicNotesBold /> : <PiVideoCameraBold />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-snug font-semibold wrap-anywhere">{item.playlistTitle ?? item.playlistId}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
                  <span>{item.candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"}</span>
                  <span>· {item.counts.discovered.toLocaleString("ko-KR")}/{item.requestedItemCount.toLocaleString("ko-KR")}개</span>
                  <time dateTime={new Date(item.createdAt).toISOString()}>· {new Date(item.createdAt).toLocaleDateString("ko-KR")}</time>
                </span>
              </span>
              <span className="col-start-2 row-start-2 w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap @min-[32rem]/import:col-start-3 @min-[32rem]/import:row-start-1">{item.status === "completed" && item.aiBatchId ? "AI 검수" : statusLabels[item.status]}</span>
              <PiArrowRightBold aria-hidden="true" className="col-start-3 row-start-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 @min-[32rem]/import:col-start-4" />
            </button>
          </li>)}
        </ul>}
        {jobs.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">이전 가져오기 작업을 불러오지 못했습니다.</p>}
        {jobs.hasNextPage && <Button variant="outline" disabled={jobs.isFetching} onClick={() => void jobs.fetchNextPage({ cancelRefetch: false })}>
          {jobs.isFetchingNextPage ? "불러오는 중" : jobs.isFetchNextPageError ? "이전 작업 다시 불러오기" : "이전 작업 더 보기"}
        </Button>}
      </section>
    </div>
  );

  return <div className="@container/import min-w-0 space-y-3 md:space-y-5">
    {(!job || !search.selected) && <Button className="min-h-11 -ml-2 px-2" variant="ghost" onClick={() => open()}><PiArrowLeftBold aria-hidden="true" />가져오기 목록으로</Button>}
    {(legacyBatch.isError || jobQuery.isError) && <p role="alert">작업을 불러오지 못했습니다. <Button variant="link" onClick={() => void (jobId ? jobQuery.refetch() : legacyBatch.refetch())}>다시 시도</Button></p>}
    {!job && !jobQuery.isError && !legacyBatch.isError && <p role="status">플레이리스트를 불러오는 중입니다.</p>}
    {job && <>
      {!search.selected && <ImportSteps current={canReview ? 2 : collected ? 1 : 0} manualReview={manualReview} />}
      <section aria-labelledby={`${fieldId}-job`} className="space-y-4 rounded-xl border bg-card p-4 @min-[32rem]/import:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <h2 id={`${fieldId}-job`} className="w-full max-w-5xl text-xl leading-tight font-semibold tracking-tight wrap-anywhere">{job.playlistTitle ?? job.playlistId}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{job.candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"} · 영상 {job.counts.discovered.toLocaleString("ko-KR")}/{job.requestedItemCount.toLocaleString("ko-KR")}개</p>
          </div>
          <Badge variant="outline" className="shrink-0">{statusLabels[job.status]}</Badge>
        </header>
        <div hidden={Boolean(search.selected)} className="space-y-3 border-t pt-4">
        {budgetBlocked && !collected && <p role="status" className="rounded-lg border bg-background px-3 py-2 text-sm">읽기 예산 대기 · {new Date(budget.data!.resetAt).toLocaleString("ko-KR")} 이후 재개</p>}
        {job.lastErrorCode && !collected && <p role="status" className="text-sm text-muted-foreground">최근 수집 오류 · {job.lastErrorCode}</p>}
        {(job.status === "partial" || job.status === "failed") && job.counts.permanentError > 0 &&
          <Button variant="outline" disabled={busy || budgetBlocked} onClick={() => void run(async () => {
            setCollectionRetry(null);
            const data = await retryOtwPlayImportJob(job.id);
            await refresh();
            if (data.enqueued === 0) setCollectionRetry({ jobId: job.id, message: data.job.status === "collecting"
              ? "재시도 작업이 대기 중입니다. 수집 진행 상태를 확인해 주세요."
              : "지금 다시 수집할 수 있는 실패 항목이 없습니다." });
          })}>수집 실패 항목 재시도</Button>}
        {collectionRetry?.jobId === job.id && !collected && <p role="status" className="text-sm text-muted-foreground">{collectionRetry.message}</p>}
        {job.status === "partial" && !job.counts.retryPending && <p className="text-sm text-muted-foreground">누락된 영상을 다시 수집한 뒤 AI 검수를 시작할 수 있습니다.</p>}
        {(job.status === "queued" || job.status === "collecting" || job.status === "partial" && job.counts.retryPending > 0) &&
          <Button variant="outline" disabled={busy || budgetBlocked} onClick={() => void run(async () => { await resumeOtwPlayImportJob(job.id); await refresh(); })}>대기 수집 재개</Button>}
        {collected && !manualReview && (!job.aiBatchId || job.aiBatchNeedsResume && pending === 0) && <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">{job.aiBatchNeedsResume ? "추가로 수집된 영상의 검수 초안을 준비합니다." : "AI가 가져온 영상을 분석해 검수 초안을 준비합니다."}</p>
          <Button className="min-h-11" disabled={busy || !job.aiExecutionAvailable} onClick={() => void run(startAnalysis, "AI 검수 요청 중")}>{job.aiBatchNeedsResume ? "복구 영상 AI 검수" : "AI 일괄 검수 시작"}<PiArrowRightBold aria-hidden="true" /></Button>
        </div>}
        {!job.aiExecutionAvailable && (collected && (!job.aiBatchId || job.aiBatchNeedsResume) || pending > 0 || Boolean(batch?.counts.failed)) && <p role="status" className="text-sm text-muted-foreground">{manualReview ? "AI 실행이 보류 중입니다. 수집된 영상은 직접 검수할 수 있습니다." : "AI 실행이 보류 중입니다."}</p>}
        {job.aiSharedPending && <p role="status" className="text-sm text-muted-foreground">다른 가져오기 카드와 공유된 영상의 AI 검수가 진행 중입니다.</p>}
        {batchQuery.isLoading && <p role="status">AI 검수 상태를 불러오는 중입니다.</p>}
        {batchQuery.isError && <p role="alert">AI 검수 상태를 불러오지 못했습니다. <Button variant="link" onClick={() => void batchQuery.refetch()}>다시 시도</Button></p>}
        {batch && <div className="space-y-3" aria-label="AI 일괄 검수 상태">
          <p role="status" className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
            <span>{pending ? "AI 일괄 검수 중" : batch.total ? "AI 일괄 검수 완료" : "새로 AI 분석할 영상이 없습니다."}</span>
            {batch.total > 0 && <span className="text-muted-foreground tabular-nums">{batch.total - pending}/{batch.total}개</span>}
          </p>
          {batch.total > 0 && <Progress aria-label="AI 일괄 검수 진행률" value={(batch.total - pending) / batch.total * 100} />}
          {batch.total > 0 && <dl className="grid grid-flow-dense grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @min-[32rem]/import:grid-cols-4">
            {[["초안", batch.counts.saved], ["선택 필요", batch.counts.needs_selection], ["실패", batch.counts.failed], ["후보 변경", batch.counts.changed]].map(([label, count]) => <div key={label} className="bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{count}</dd>
            </div>)}
          </dl>}
          {Boolean(batch.budgetWaiting) && <p role="status" className="text-sm text-muted-foreground">AI 예산 대기 {batch.budgetWaiting}개</p>}
          {batch.counts.failed > 0 && <Button variant="outline" disabled={busy || !job.aiExecutionAvailable || pending > 0 || Boolean(search.selected)} onClick={() => void run(async () => {
            await retryAiBatch(batch.id);
            await batchQuery.refetch();
            await refreshReviewInbox(client);
          })}>AI 실패 항목 재시도</Button>}
        </div>}
        {operation && <p role="status" className="text-sm text-muted-foreground">{operation}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </section>
      <ReviewInbox key={job.id} playlistJob={job} canReview={canReview} active={active} catalog={catalog} onManageChannel={onManageChannel} onProposal={onProposal} onOpenCatalog={onOpenCatalog} />
    </>}
  </div>;
}
