import type { PlayWorkBatch, PlayWorkCommand, PlayWorkDisposition, PlayWorkQueueAction } from "@contracts/otw-play-work-queue";
import { isAiBatchPending } from "@contracts/otw-play-ai-batch";
import { canCompleteWorkBatch } from "../domain/work-queue-policy";
import { canonicalYouTubePlaylistUrl, extractYouTubePlaylistId } from "../domain/youtube-playlist-id";
import { WorkQueueError, type WorkQueueBatchRecord, type WorkQueueMessage, type WorkQueueRepository } from "./ports/work-queue";
import type { OtwPlayYouTubeIngestionReader } from "./ports/youtube-metadata";
import { IngestionRepositoryError, type IngestionRepository } from "./ports/ingestion-repository";
import { AiReviewError } from "./ports/ai-review";
import type { AdminCatalogActor } from "./ports/admin-catalog-repository";
import type { AiBatchService } from "./ai-batch-service";
import type { IngestionService } from "./ingestion-service";

export class WorkQueueService {
  private readonly repo: WorkQueueRepository;
  private readonly ingestionRepo: IngestionRepository;
  private readonly ingestion: IngestionService;
  private readonly ai: AiBatchService;
  private readonly youtube: OtwPlayYouTubeIngestionReader;
  private readonly send: (message: WorkQueueMessage) => Promise<void>;
  private readonly id: () => string;
  private readonly clock: () => number;
  constructor(repo: WorkQueueRepository, ingestionRepo: IngestionRepository,
    ingestion: IngestionService, ai: AiBatchService,
    youtube: OtwPlayYouTubeIngestionReader, send: (message: WorkQueueMessage) => Promise<void>,
    id: () => string, clock: () => number) {
    this.repo=repo;this.ingestionRepo=ingestionRepo;this.ingestion=ingestion;this.ai=ai;this.youtube=youtube;this.send=send;this.id=id;this.clock=clock;
  }

  async add(urls: string[], actor: string) {
    const results: { input: string; queueId: string | null; errorMessage: string | null }[] = [];
    const seen = new Set<string>();
    for (const input of urls) {
      const playlistId = extractYouTubePlaylistId(input);
      if (!playlistId) { results.push({ input,queueId:null,errorMessage:"공개·일부 공개 YouTube 플레이리스트 URL 또는 ID를 입력하세요." }); continue; }
      if (seen.has(playlistId)) continue;
      seen.add(playlistId);
      const q = await this.repo.add(this.id(),playlistId,canonicalYouTubePlaylistUrl(playlistId),actor,this.clock());
      results.push({ input,queueId:q.id,errorMessage:null });
    }
    await this.recover();
    return results;
  }
  async overview(cursor?: string,queueId?:string) {
    const [queues, active, deferred] = await Promise.all([this.repo.sources(),this.repo.active(),this.repo.deferred(cursor,queueId)]);
    return { queues,activeBatch:active ? await this.batch(active.id) : null,deferred:deferred.items,deferredCursor:deferred.cursor };
  }
  async batch(id: string): Promise<PlayWorkBatch> {
    const b = await this.repo.record(id), items = await this.repo.items(id);
    const ai = b.aiBatchId ? (await this.ai.get(b.aiBatchId)).batch : null;
    const pending = items.some(i=>i.aiStatus !== null && isAiBatchPending(i.aiStatus));
    return { id:b.id,queueId:b.queueId,jobId:b.jobId,status:b.status,errorMessage:b.errorMessage,version:b.version,
      hasMore:b.nextPageToken !== null,ai,items,canComplete:b.status === "review" && canCompleteWorkBatch(items,pending),
      continuation:{requested:b.startNext,nextBatchId:b.nextBatchId},
      progress:{total:items.length,handled:items.filter(i=>i.outcome !== "pending").length,
        ...Object.fromEntries(["ready","registered","excluded","deferred"].map(s=>[s,items.filter(i=>i.outcome===s).length]))} as PlayWorkBatch['progress'] };
  }
  async action(id: string, action: PlayWorkQueueAction, command: PlayWorkCommand, actor: string) {
    if (action === "start") {
      const batch = await this.repo.reserve(this.id(),id,actor,command,this.clock());
      await this.dispatch({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:batch.id});
      return this.batch(batch.id);
    }
    await this.repo.commandSource(id,action,command,actor,this.clock());
    if (action !== "archive") await this.recover();
    return null;
  }
  async disposition(id: string, version: number, disposition: PlayWorkDisposition, reason: string | null, actor: string) {
    if (disposition !== "pending" && !reason?.trim()) throw new WorkQueueError("invalid_request","보류·제외 사유를 입력하세요.",400);
    await this.repo.disposition(id,version,disposition,reason?.trim() ?? null,actor,this.clock());
  }
  async complete(id: string, command: PlayWorkCommand & { startNext: boolean }, actor: string) {
    const b = await this.repo.record(id), key = `${actor}:${command.idempotencyKey}`;
    if (b.completionKey !== key) {
      const current = await this.batch(id);
      if (!current.canComplete) throw new WorkQueueError("review_incomplete","AI 처리가 끝난 뒤 미검수 항목을 저장하거나 보류·제외해 주세요.");
    }
    await this.repo.beginCompletion(id,actor,command,this.clock());
    await this.dispatch({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id});
    return this.batch(id);
  }
  async retry(id: string, command: PlayWorkCommand, actor: AdminCatalogActor) {
    const b = await this.repo.record(id);
    await this.repo.retryBatch(id,command,actor.userId,this.clock());
    if (b.status === "review" && b.aiBatchId) {
      const ids=(await this.repo.items(b.id)).filter(i=>i.outcome === "pending" && i.aiStatus === "failed").flatMap(i=>i.candidateId ? [i.candidateId] : []);
      if (ids.length) await this.ai.retry(b.aiBatchId,ids);
    }
    try { await this.ingestion.retryJob(b.jobId,actor); } catch(error) { if (!(error instanceof IngestionRepositoryError && error.code === "not_found")) throw error; }
    await this.dispatch({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id});
    return this.batch(id);
  }
  async afterIngestion(jobId: string) {
    const b = await this.repo.byJob(jobId);
    if (b?.status === "preparing") await this.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  }
  async process(message: WorkQueueMessage) {
    const collection=message.target === "queue" || (await this.repo.record(message.id)).status === "preparing";
    if (collection && (await this.ingestion.readBudget()).status === "blocked") return;
    const token = this.id();
    if (!await this.repo.claim(message,token,this.clock())) return;
    try {
      if (message.target === "queue") {
        const q=await this.repo.source(message.id), summary=await this.youtube.readPlaylistSummary(q.playlistId);
        if (!summary) throw new WorkQueueError("playlist_unavailable","플레이리스트가 비공개이거나 접근할 수 없습니다.",404);
        await this.repo.saveSummary(q.id,token,summary,this.clock());
        return;
      }
      const b=await this.repo.record(message.id);
      if (b.status === "preparing") await this.prepareBatch(b,token);
      else if (b.status === "completing") await this.finish(b,token);
      if ((await this.repo.record(b.id)).status === "completed") await this.advance(await this.repo.record(b.id));
    } catch (error) {
      if (message.target !== "batch" || (await this.repo.record(message.id)).status !== "completed") {
        const text=error instanceof WorkQueueError || error instanceof AiReviewError ? error.message : "작업을 처리하지 못했습니다. 설정·예산과 가져오기 오류를 확인하고 재시도하세요.";
        await this.repo.failed(message,token,text,this.clock());
      }
    } finally { await this.repo.release(message,token,this.clock()); }
  }
  private async prepareBatch(b: WorkQueueBatchRecord, token: string) {
    const q=await this.repo.source(b.queueId);
    const summary=await this.youtube.readPlaylistSummary(q.playlistId);
    if (!summary) throw new WorkQueueError("playlist_unavailable","플레이리스트에 접근할 수 없습니다. 공개 상태를 확인하세요.");
    await this.repo.observeSummary(q.id,summary,this.clock());
    const created=await this.ingestionRepo.createJob({jobId:b.jobId,actorUserId:b.actor,initialPageToken:b.pageToken,
      input:{playlistUrl:q.url,mode:"all_new",candidateKind:"singing_clip",idempotencyKey:`work-${b.id}`},
      preflight:{candidateKind:"singing_clip",playlistId:q.playlistId,canonicalUrl:q.url,title:summary.title,
        ownerChannelId:summary.ownerChannelId,ownerChannelTitle:summary.ownerChannelTitle,itemCount:summary.itemCount,privacyStatus:summary.privacyStatus,
        rangeStartPosition:0,rangeEndExclusive:50,nextRangeStart:null,requestedItemCount:50,estimatedPageCount:1,estimatedVideoBatchCount:1,hardCap:5000,requiresSplit:false,previousImport:null},now:this.clock()});
    const job=await this.ingestion.getJob(b.jobId);
    if (job.status === "queued") {
      await this.ingestion.process(created.message);
      if ((await this.ingestion.getJob(b.jobId)).status === "completed") await this.prepareBatch(b,token);
      return;
    }
    if (job.status === "collecting") return;
    if (job.status !== "completed") throw new WorkQueueError("metadata_incomplete","영상 수집이 완료되지 않았습니다. 가져오기 오류를 확인한 뒤 현재 묶음을 재시도하세요.");
    const latest=await this.repo.record(b.id);
    if (!latest.pageRecorded) throw new WorkQueueError("playlist_page_failed","목록 페이지를 읽지 못했습니다. 가져오기 오류를 확인하거나 목록을 다시 확인하세요.");
    await this.repo.snapshot(b.id,this.clock());
    const selections:{id:string;version:number}[]=[];
    for (const i of await this.repo.items(b.id)) {
      if (!i.candidateId || selections.some(s=>s.id===i.candidateId) || i.outcome !== "pending" || i.candidateKind !== "singing_clip" || i.pendingProposalId || !["discovered","needs_input","blocked"].includes(i.candidateStatus)) continue;
      const draft=await this.ai.draft(i.candidateId);
      if (draft && draft.candidateVersion === i.candidateVersion && ["saved","needs_selection"].includes(draft.status)) continue;
      selections.push({id:i.candidateId,version:i.candidateVersion});
    }
    const selection={candidates:selections};
    const recovered=await this.repo.record(b.id);
    const aiBatch=recovered.aiBatchId ? (await this.ai.get(recovered.aiBatchId)).batch
      : selections.length && await this.ai.preview(selection) ? await this.ai.start(selection,`work-${b.id}`,b.actor) : null;
    await this.repo.reviewed(b.id,token,aiBatch?.id ?? null,this.clock());
  }
  private async finish(b: WorkQueueBatchRecord, token: string) {
    const current=await this.batch(b.id);
    if (!canCompleteWorkBatch(current.items,current.items.some(i=>i.aiStatus !== null && isAiBatchPending(i.aiStatus)))) throw new WorkQueueError("review_changed","검수 상태가 변경되었습니다. 최신 항목을 확인하세요.");
    let failed=false;
    const converted=new Set<string>();
    for (const i of current.items) {
      if (!i.candidateId || i.outcome !== "ready" || converted.has(i.candidateId)) continue;
      converted.add(i.candidateId);
      const result=await this.ingestion.convertCandidate(i.candidateId,{expectedVersion:i.candidateVersion},{userId:b.actor,displayName:null,ipAddress:null});
      const ok=result.outcome === "created" || result.outcome === "duplicate";
      await this.repo.itemError(i.id,ok ? null : `등록 실패: ${result.errorCode ?? result.outcome}`,this.clock());
      failed ||= !ok;
    }
    const after=await this.repo.items(b.id);
    if (failed || after.some(i=>["pending","ready"].includes(i.outcome))) throw new WorkQueueError("conversion_failed","일부 항목을 등록하지 못했습니다. 성공한 항목은 보존되며 실패 항목만 다시 처리합니다.");
    await this.repo.close(b.id,token,this.clock());
  }
  private async advance(b: WorkQueueBatchRecord) {
    if (!b.startNext || b.nextBatchId) return;
    const active=await this.repo.active();
    if (active) { await this.repo.linkNext(b.id,active.id,this.clock()); return; }
    const same=await this.repo.source(b.queueId), next=same.status === "waiting" ? same : await this.repo.nextSource();
    if (!next) { await this.repo.linkNext(b.id,"done",this.clock()); return; }
    const created=await this.repo.reserve(this.id(),next.id,b.actor,{expectedVersion:next.version,idempotencyKey:`next-${b.id}`},this.clock());
    await this.repo.linkNext(b.id,created.id,this.clock());
    await this.dispatch({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:created.id});
  }
  private async dispatch(message: WorkQueueMessage) {
    try { await this.send(message); await this.repo.dispatched(message,this.clock()); } catch { /* Durable work is recovered by maintenance. */ }
  }
  async recover() {
    let queued=0,failed=0;
    for (const message of await this.repo.pending(this.clock())) {
      try { await this.send(message); await this.repo.dispatched(message,this.clock()); queued++; } catch { failed++; }
    }
    return { queued,failed };
  }
  clearExpired() { return this.repo.clearExpired(this.clock()); }
  async dead(message: WorkQueueMessage) {
    const token=this.id();
    if (!await this.repo.claim(message,token,this.clock())) return;
    await this.repo.failed(message,token,"작업 큐 전달에 실패했습니다. 현재 작업을 재시도하세요.",this.clock());
    await this.repo.release(message,token,this.clock());
  }
}
