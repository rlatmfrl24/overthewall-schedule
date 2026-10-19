import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import { D1WorkQueueRepository } from "./d1-work-queue-repository";
import { D1IngestionRepository } from "./d1-ingestion-repository";
import { D1AiBatchRepository } from "./d1-ai-batch-repository";
import { D1AiReviewContext } from "./d1-ai-review-context";
import { IngestionService } from "../application/ingestion-service";
import { AiBatchService } from "../application/ai-batch-service";
import type { AiReviewService } from "../application/ai-review-service";
import { WorkQueueService } from "../application/work-queue-service";
import type { WorkQueueMessage } from "../application/ports/work-queue";
import type { OtwPlayIngestionQueueMessage } from "../application/ports/ingestion-repository";
import type { OtwPlayYouTubeIngestionReader, OtwPlayYouTubePlaylistPage } from "../application/ports/youtube-metadata";
import { AdminCatalogService } from "../application/admin-catalog-service";
import { D1AdminCatalogRepository } from "./d1-admin-catalog-repository";
import { SITE_OPENS_AT } from "@contracts/site-publication";
const db=env.otw_db, now=Date.UTC(2026,9,13), repo=new D1WorkQueueRepository(db), imports=new D1IngestionRepository(db);
let ids=0;
const id=()=>`work-id-${++ids}`;
const sent:WorkQueueMessage[]=[], ingestionSent:OtwPlayIngestionQueueMessage[]=[];
const summary={playlistId:"PL1234567890",title:"Large clips",ownerChannelId:"owner",ownerChannelTitle:"Owner",itemCount:2000,privacyStatus:"public" as const};
const reader={readPlaylistSummary:vi.fn(async()=>summary),readPlaylistPage:vi.fn(async(_playlistId:string,token:string|null):Promise<OtwPlayYouTubePlaylistPage>=>({items:Array.from({length:token ? 1 : 50},(_,n)=>({videoId:String(n+(token ? 50 : 0)).padStart(11,"A"),playlistItemId:`item-${n+(token ? 50 : 0)}`,position:n+(token ? 50 : 0)})),nextPageToken:token ? null : "next-50"})),
  readVideos:vi.fn(async(videos:readonly string[])=>videos.map(videoId=>({videoId,availabilityStatus:"playable" as const,video:{videoId,channelId:"UCkkkkkkkkkkkkkkkkkkkkkk",channelTitle:"Singer clips",title:videoId,thumbnailUrl:null,durationSeconds:180,publishedAt:now,availabilityStatus:"playable" as const}})))};
const ingestion=new IngestionService(imports,reader as unknown as OtwPlayYouTubeIngestionReader,{send:async m=>{ingestionSent.push(m);}},id,()=>now,null,{read:async()=>({status:"available",rowsRead:0,dailyTarget:4000000,measuredAt:new Date(now).toISOString(),resetAt:new Date(now+86400000).toISOString(),reason:null})});
const ai=new AiBatchService(new D1AiBatchRepository(db),{} as AiReviewService,async()=>{},true,id,()=>now,new D1AiReviewContext(db));
const service=new WorkQueueService(repo,imports,ingestion,ai,reader as unknown as OtwPlayYouTubeIngestionReader,async m=>{sent.push(m);},id,()=>now);
beforeEach(async()=>{
  await applyD1Migrations(db,(env as unknown as {OTW_PLAY_INGESTION_MIGRATIONS:D1Migration[]}).OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_catalog_events WHERE aggregate_type IN ('playlist_work_queue','playlist_work_batch') OR event_type='ai_batch.retry'"),
    db.prepare("DELETE FROM music_playlist_work_items"),db.prepare("DELETE FROM music_playlist_work_batches"),db.prepare("DELETE FROM music_playlist_work_queues"),db.prepare("DELETE FROM music_ai_review_batches"),
    db.prepare("DELETE FROM music_ingestion_events"),db.prepare("DELETE FROM music_ingestion_candidate_origins"),db.prepare("DELETE FROM music_ingestion_messages"),db.prepare("DELETE FROM music_ingestion_candidates"),db.prepare("DELETE FROM music_ingestion_jobs"),
    db.prepare("DELETE FROM music_performances WHERE id LIKE 'work-id-%'"),db.prepare("DELETE FROM music_media_sources WHERE id LIKE 'work-id-%'"),db.prepare("DELETE FROM music_songs WHERE id LIKE 'work-id-%'"),
    db.prepare(`INSERT OR IGNORE INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,version,created_at,updated_at) VALUES('work-clip-channel','youtube','UCkkkkkkkkkkkkkkkkkkkkkk','Clips','approved_kirinuki','approved',1,0,?,?)`).bind(now,now),
  ]);
  ids=0;sent.length=0;ingestionSent.length=0;vi.clearAllMocks();
});
it("persists private catalog conversion, retains partial successes and never converts them twice",async()=>{
  let b=await prepared();
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  await db.prepare(`INSERT OR IGNORE INTO music_entities(id,entity_kind,display_name,normalized_name,slug,version,created_at,updated_at) VALUES('work-credit','person','Artist','artist','work-credit',0,?,?)`).bind(now,now).run();
  let failSecond=true;
  const videos={...reader,
    readChannel:async(channelId:string)=>({channelId,displayName:"Clips"}),
    readVideo:async(videoId:string)=>{
      if(videoId === b.items[1].videoId && failSecond) throw new Error("Temporary provider failure");
      return (await reader.readVideos([videoId]))[0].video;
    },
  } as unknown as OtwPlayYouTubeIngestionReader;
  const actor={userId:"admin",displayName:"Admin",ipAddress:null};
  const catalog=new AdminCatalogService(new D1AdminCatalogRepository(db),videos,{record:async()=>{}},id,true,()=>now);
  const actualIngestion=new IngestionService(imports,videos,{send:async()=>{}},id,()=>now,catalog);
  const actual=new WorkQueueService(repo,imports,actualIngestion,ai,videos,async()=>{},id,()=>now);
  const review={song:{kind:"create" as const,title:"Queue reviewed song",isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:"unknown" as const,aliases:[],originalArtists:[{subject:{kind:"entity" as const,entityId:"work-credit"},creditOrder:0,isPrimary:true}],tags:[]},
    participants:[{subject:{kind:"entity" as const,entityId:"work-credit"},participantRole:"vocal" as const,creditOrder:0}],relationType:"singing_clip" as const,releaseType:"broadcast" as const,participationType:"solo" as const,
    broadcast:{performedOn:null,dateEvidence:null,originalUrl:null,extent:null},startSeconds:0,endSeconds:180,internalNote:"Human reviewed"};
  const saved=await actualIngestion.updateCandidate(b.items[0].candidateId!,{action:"save",expectedVersion:b.items[0].candidateVersion,input:review},actor);
  await actualIngestion.updateCandidate(b.items[1].candidateId!,{action:"save",expectedVersion:b.items[1].candidateVersion,input:saved.reviewInput!},actor);
  for(const i of b.items.slice(2)) await actual.disposition(i.id,i.version,"deferred","검수 대기",actor.userId);
  b=await actual.batch(b.id);
  await actual.complete(b.id,{expectedVersion:b.version,idempotencyKey:"convert-first",startNext:false},actor.userId);
  await actual.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  const partial=await actual.batch(b.id);
  expect(partial.status).toBe("completing");expect(partial.errorMessage).toBeTruthy();
  expect(partial.items[0].candidateStatus,partial.items[0].errorMessage ?? "first conversion").toBe("converted");
  expect(await db.prepare("SELECT count(*) AS n FROM music_performances WHERE id LIKE 'work-id-%'").first()).toEqual({n:1});
  expect(await repo.active()).not.toBeNull();
  failSecond=false;
  await actual.retry(b.id,{expectedVersion:partial.version,idempotencyKey:"partial-registration-retry"},actor);
  expect((await ai.get(b.ai!.id)).batch.counts.queued).toBe(0);
  const latest=await actual.batch(b.id);
  const command={expectedVersion:latest.version,idempotencyKey:"convert-retry",startNext:false};
  await actual.complete(b.id,command,actor.userId);await actual.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  await actual.complete(b.id,command,actor.userId);
  expect(await repo.active()).toBeNull();
  const performances=(await db.prepare("SELECT publication_status,relation_type,release_type,song_id FROM music_performances WHERE id LIKE 'work-id-%'").all()).results;
  expect(performances).toHaveLength(2);
  for(const p of performances) expect(p).toMatchObject({publication_status:"draft",relation_type:"singing_clip",release_type:"broadcast",song_id:saved.reviewInput!.song.kind === "existing" ? saved.reviewInput!.song.songId : "unexpected"});
});
async function sourceReady() {
  const result=await service.add([summary.playlistId],"admin");
  const qid=result[0].queueId!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:qid});
  return repo.source(qid);
}
async function prepared() {
  const q=await sourceReady();
  const b=await service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"start-first"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b!.id});
  await ingestion.process(ingestionSent.shift()!);
  await service.afterIngestion(b!.jobId);
  return service.batch(b!.id);
}
it("bulk registration stores information only and readonly progress never starts work",async()=>{
  const results=await service.add([summary.playlistId,`https://youtube.com/playlist?list=${summary.playlistId}`,"invalid"],"admin");
  expect(results).toHaveLength(2);expect(results[1].errorMessage).toBeTruthy();
  await service.process(sent[0]);
  const overview=await service.overview();
  expect(overview.queues[0]).toMatchObject({itemCount:2000,status:"waiting"});
  await service.overview();
  expect(reader.readPlaylistPage).not.toHaveBeenCalled();expect(reader.readVideos).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT count(*) AS n FROM music_ai_review_batches").first()).toEqual({n:0});
});
it("recovers queue commands after a lost response without repeating a scan or changing an intent",async()=>{
  const q=await sourceReady(), command={expectedVersion:q.version,idempotencyKey:"source-response-lost"};
  await service.action(q.id,"rescan",command,"admin");
  const accepted=await repo.source(q.id);
  await service.action(q.id,"rescan",command,"admin");
  expect((await repo.source(q.id)).version).toBe(accepted.version);
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:q.id});
  const done=await repo.source(q.id);
  await service.action(q.id,"rescan",command,"admin");
  expect((await repo.source(q.id)).version).toBe(done.version);
  expect(reader.readPlaylistSummary).toHaveBeenCalledTimes(2);
  await expect(service.action(q.id,"archive",{...command,expectedVersion:done.version},"admin")).rejects.toMatchObject({code:"idempotency_conflict"});
  expect((await repo.source(q.id)).status).toBe("waiting");
  expect(await db.prepare("SELECT count(*) AS n FROM music_catalog_events WHERE aggregate_type='playlist_work_queue'").first()).toEqual({n:1});
});
it("collects exactly one page, snapshots at most 50 AI targets and leaves continuation parked",async()=>{
  const b=await prepared();
  expect(b.status).toBe("review");expect(b.items).toHaveLength(50);expect(b.ai?.total).toBe(50);expect(b.canComplete).toBe(false);
  expect(b.items.map(i=>i.videoId)).toEqual(Array.from({length:50},(_,n)=>String(n).padStart(11,"A")));
  expect(reader.readPlaylistPage).toHaveBeenCalledTimes(1);
  expect(reader.readPlaylistPage).toHaveBeenCalledWith(summary.playlistId,null);
  expect(await repo.record(b.id)).toMatchObject({nextPageToken:"next-50",pageRecorded:true});
  expect(await db.prepare("SELECT count(*) AS n FROM music_ingestion_messages WHERE message_kind='playlist_page'").first()).toEqual({n:1});
  await service.overview();expect(reader.readPlaylistPage).toHaveBeenCalledTimes(1);
});
it("reports scan item progress without counting saved reviews or deferred items as catalog completion",async()=>{
  const b=await prepared();
  await db.prepare("UPDATE music_ingestion_candidates SET status='ready' WHERE id=?").bind(b.items[0].candidateId).run();
  await service.disposition(b.items[1].id,b.items[1].version,"deferred","구간 확인","admin");
  await service.disposition(b.items[2].id,b.items[2].version,"excluded","검수 대상 아님","admin");
  const q=(await service.overview()).queues[0];
  expect(q.progress).toMatchObject({total:2000,inspected:50,registered:0,excluded:1,deferred:1,ready:1,completed:1,remaining:1999,uncertain:false});
  const current=await service.batch(b.id);
  expect(current.progress).toMatchObject({total:50,handled:3,ready:1,deferred:1,excluded:1});
});
it("preserves unavailable entries and shares duplicate video decisions without duplicate AI calls",async()=>{
  reader.readPlaylistPage.mockResolvedValueOnce({items:[{playlistItemId:"dup-1",videoId:"AAAAAAAAAAA",position:0},{playlistItemId:"dup-2",videoId:"AAAAAAAAAAA",position:1}],unavailableItems:[{playlistItemId:"private",position:2}],nextPageToken:null});
  const b=await prepared();
  expect(b.items.map(i=>i.playlistPosition)).toEqual([0,1,2]);
  expect(b.items[2]).toMatchObject({candidateId:null,videoId:null,outcome:"pending"});
  expect(b.ai?.total).toBe(1);
  await service.disposition(b.items[0].id,b.items[0].version,"deferred","구간 확인","admin");
  await service.disposition(b.items[2].id,b.items[2].version,"excluded","접근 불가","admin");
  expect((await repo.source(b.queueId)).progress).toMatchObject({inspected:3,deferred:2,excluded:1,completed:1});
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  const latest=await service.batch(b.id);expect(latest.canComplete).toBe(true);
  await service.complete(b.id,{expectedVersion:latest.version,idempotencyKey:"unavailable-close",startNext:false},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  expect(await repo.active()).toBeNull();
  let q=await repo.source(b.queueId);
  await service.action(q.id,"rescan",{expectedVersion:q.version,idempotencyKey:"unavailable-rescan"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:q.id});
  q=await repo.source(q.id);
  reader.readPlaylistPage.mockResolvedValueOnce({items:[],unavailableItems:[{playlistItemId:"private",position:0}],nextPageToken:null});
  const next=(await service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"unavailable-next"},"admin"))!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:next.id});
  const metadata=ingestionSent.shift();if(metadata)await ingestion.process(metadata);await service.afterIngestion(next.jobId);
  expect((await service.batch(next.id)).items[0]).toMatchObject({outcome:"excluded",reason:"접근 불가",candidateId:null});
});
it("keeps work-queue candidates out of legacy filter-wide AI runs but allows exact work targets",async()=>{
  const b=await prepared();
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  const repository=new D1AiBatchRepository(db);
  expect(await repository.preview({filters:{source:"playlist",jobId:b.jobId}})).toBe(0);
  expect(await repository.preview({candidates:[{id:b.items[0].candidateId!,version:b.items[0].candidateVersion}]})).toBe(1);
  const legacy=await imports.listReviewItems({source:"playlist",jobId:b.jobId});
  expect(legacy.items.every(i=>i.workBatchId===b.id)).toBe(true);
});
it("allows only one active batch under concurrent administrators",async()=>{
  const q=await sourceReady();
  const other=await repo.add("other-queue","PL9876543210","https://youtube.com/playlist?list=PL9876543210","admin",now);
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:other.id});
  const second=await repo.source(other.id);
  const results=await Promise.allSettled([
    service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"concurrent-one"},"admin"),
    service.action(second.id,"start",{expectedVersion:second.version,idempotencyKey:"concurrent-two"},"other-admin"),
  ]);
  expect(results.filter(r=>r.status === "fulfilled")).toHaveLength(1);
  expect(await db.prepare("SELECT count(*) AS n FROM music_playlist_work_batches WHERE status!='completed'").first()).toEqual({n:1});
});
it("completion is blocked while AI is pending, then advances one page exactly once on replay",async()=>{
  let b=await prepared();
  for(const i of b.items) await service.disposition(i.id,i.version,"excluded","검수 대상 아님","admin");
  await expect(service.complete(b.id,{expectedVersion:b.version,idempotencyKey:"finish-first",startNext:true},"admin")).rejects.toMatchObject({code:"review_incomplete"});
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  b=await service.batch(b.id);
  const command={expectedVersion:b.version,idempotencyKey:"finish-first",startNext:true};
  await service.complete(b.id,command,"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  await service.complete(b.id,command,"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  expect(await db.prepare("SELECT count(*) AS n FROM music_playlist_work_batches").first()).toEqual({n:2});
  const next=(await repo.active())!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:next.id});
  expect(reader.readPlaylistPage).toHaveBeenLastCalledWith(summary.playlistId,"next-50");
  await ingestion.process(ingestionSent.shift()!);await service.afterIngestion(next.jobId);
  expect((await service.batch(next.id)).items).toHaveLength(1);
});
it("explicit defer remains visible across completion and a fresh service read",async()=>{
  let b=await prepared();
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  for(const i of b.items) await service.disposition(i.id,i.version,"deferred","채널 정보 확인 대기","admin");
  b=await service.batch(b.id);
  await service.complete(b.id,{expectedVersion:b.version,idempotencyKey:"finish-pause",startNext:false},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  const read=await service.overview();
  expect(read.activeBatch).toBeNull();expect(read.deferred).toHaveLength(50);
  expect(read.queues[0].counts).toMatchObject({registered:0,deferred:50});
  expect(reader.readPlaylistPage).toHaveBeenCalledTimes(1);
  await service.action(read.queues[0].id,"rescan",{expectedVersion:read.queues[0].version,idempotencyKey:"rescan-pass"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:read.queues[0].id});
  const q=await repo.source(read.queues[0].id);
  expect(q).toMatchObject({deferredCount:50,progress:{deferred:0,inspected:0}});
  const next=await service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"rescan-start"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:next!.id});
  await ingestion.process(ingestionSent.shift()!);await service.afterIngestion(next!.jobId);
  const rescanned=await service.batch(next!.id);
  expect(rescanned.items.every(i=>i.disposition === "deferred")).toBe(true);expect(rescanned.ai).toBeNull();
});
it.each(["queue_retries_exhausted","provider_auth","invalid_request"])("does not present missing video metadata as AI review and recovers after %s",async code=>{
  const q=await sourceReady();
  const b=(await service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"metadata-fail"},"admin"))!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  const metadata=ingestionSent.shift()!;
  await imports.markMessageDeadLetter(metadata.idempotencyKey,code,now);
  await service.afterIngestion(b.jobId);
  const failed=await service.batch(b.id);
  expect(failed.status).toBe("preparing");expect(failed.errorMessage).toBeTruthy();
  await service.retry(b.id,{expectedVersion:failed.version,idempotencyKey:`metadata-retry-${code}`},{userId:"admin",displayName:null,ipAddress:null});
  await ingestion.process(metadata);await service.afterIngestion(b.jobId);
  expect((await service.batch(b.id)).ai?.total).toBe(50);
});
it("projects only the latest disposition after defer, completion and rescan",async()=>{
  let b=await prepared();
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  for(const i of b.items) await service.disposition(i.id,i.version,"deferred","나중에 검수","admin");
  b=await service.batch(b.id);
  await service.complete(b.id,{expectedVersion:b.version,idempotencyKey:"defer-close",startNext:false},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  const q=await repo.source(b.queueId);
  await service.action(q.id,"rescan",{expectedVersion:q.version,idempotencyKey:"latest-rescan"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:q.id});
  const ready=await repo.source(q.id);
  const next=(await service.action(q.id,"start",{expectedVersion:ready.version,idempotencyKey:"latest-start"},"admin"))!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:next.id});
  await ingestion.process(ingestionSent.shift()!);await service.afterIngestion(next.jobId);
  const rows=(await service.batch(next.id)).items;
  await service.disposition(rows[0].id,rows[0].version,"excluded","제외로 결정 변경","admin");
  const read=await service.overview();
  expect(read.deferred.some(i=>i.candidateId === rows[0].candidateId)).toBe(false);
  expect(read.queues[0].counts).toMatchObject({deferred:49,excluded:1});
});
it("locks historical decisions while a shared candidate is being registered",async()=>{
  const b=await prepared(), old=b.items[0];
  await service.disposition(old.id,old.version,"deferred","검수 대기","admin");
  await db.prepare("UPDATE music_playlist_work_batches SET status='completed' WHERE id=?").bind(b.id).run();
  const q=await repo.source(b.queueId);
  const next=await repo.reserve("second-batch",q.id,"admin",{expectedVersion:q.version,idempotencyKey:"second-batch"},now);
  await db.prepare("INSERT INTO music_playlist_work_items(id,batch_id,candidate_id,playlist_item_id,disposition,created_at,updated_at) VALUES('shared-active',?,?,?,'pending',?,?)").bind(next.id,old.candidateId,"shared-entry",now,now).run();
  await db.prepare("UPDATE music_playlist_work_batches SET status='completing' WHERE id=?").bind(next.id).run();
  await expect(service.disposition(old.id,old.version+1,"excluded","제외 결정","admin")).rejects.toMatchObject({code:"stale_write"});
  expect((await repo.items(b.id))[0].outcome).toBe("deferred");
});
it("shares and locks decisions for the same unavailable playlist membership across scans",async()=>{
  const page={items:[{videoId:"AAAAAAAAAAA",playlistItemId:"visible",position:0}],unavailableItems:[{playlistItemId:"private",position:1}],nextPageToken:null};
  reader.readPlaylistPage.mockResolvedValueOnce(page);
  let b=await prepared();const old=b.items[1];
  await service.disposition(b.items[0].id,b.items[0].version,"excluded","검수 제외","admin");
  await service.disposition(old.id,old.version,"deferred","영상 접근 확인","admin");
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  b=await service.batch(b.id);await service.complete(b.id,{expectedVersion:b.version,idempotencyKey:"missing-close",startNext:false},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:b.id});
  let q=await repo.source(b.queueId);
  await service.action(q.id,"rescan",{expectedVersion:q.version,idempotencyKey:"missing-rescan"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:q.id});q=await repo.source(q.id);
  reader.readPlaylistPage.mockResolvedValueOnce(page);
  const next=(await service.action(q.id,"start",{expectedVersion:q.version,idempotencyKey:"missing-start"},"admin"))!;
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:next.id});
  const metadata=ingestionSent.shift();if(metadata)await ingestion.process(metadata);await service.afterIngestion(next.jobId);
  await service.disposition(old.id,old.version+1,"excluded","영상 접근 불가 확정","admin");
  expect((await service.batch(next.id)).items[1]).toMatchObject({outcome:"excluded",reason:"영상 접근 불가 확정"});
  const current=await service.batch(next.id);
  await service.complete(current.id,{expectedVersion:current.version,idempotencyKey:"missing-complete",startNext:false},"admin");
  await expect(service.disposition(old.id,old.version+2,"deferred","다시 확인","admin")).rejects.toMatchObject({code:"stale_write"});
});
it("recovers a lost batch retry response without incrementing versions or AI retries twice",async()=>{
  const b=await prepared(),actor={userId:"admin",displayName:null,ipAddress:null};
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  const command={expectedVersion:b.version,idempotencyKey:"batch-retry-response-lost"};
  await repo.retryBatch(b.id,command,actor.userId,now);
  await Promise.all([service.retry(b.id,command,actor),service.retry(b.id,command,actor)]);
  const accepted=await service.batch(b.id);
  await service.retry(b.id,command,actor);
  expect((await service.batch(b.id)).version).toBe(accepted.version);
  expect(await db.prepare("SELECT MIN(generation) AS minimum,MAX(generation) AS maximum FROM music_ai_review_batch_items WHERE batch_id=?").bind(b.ai!.id).first()).toEqual({minimum:1,maximum:1});
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed' WHERE batch_id=?").bind(b.ai!.id).run();
  await service.retry(b.id,command,actor);
  expect(await db.prepare("SELECT MIN(generation) AS minimum,MAX(generation) AS maximum FROM music_ai_review_batch_items WHERE batch_id=?").bind(b.ai!.id).first()).toEqual({minimum:1,maximum:1});
  await service.retry(b.id,{expectedVersion:accepted.version,idempotencyKey:"newer-batch-retry"},actor);
  const dispatched=sent.length;
  await service.retry(b.id,command,actor);
  expect(sent).toHaveLength(dispatched);
  await expect(service.retry(b.id,{...command,expectedVersion:command.expectedVersion+1},actor)).rejects.toMatchObject({code:"idempotency_conflict"});
  expect(await db.prepare("SELECT MIN(generation) AS minimum,MAX(generation) AS maximum FROM music_ai_review_batch_items WHERE batch_id=?").bind(b.ai!.id).first()).toEqual({minimum:2,maximum:2});
  expect(await db.prepare("SELECT COUNT(*) AS count FROM music_catalog_events WHERE aggregate_type='playlist_work_batch'").first()).toEqual({count:2});
  expect(await db.prepare("SELECT COUNT(*) AS count FROM music_catalog_events WHERE event_type='ai_batch.retry'").first()).toEqual({count:2});
});
it("starts a new scan after metadata expiration without accumulating previous scan slots",async()=>{
  const b=await prepared();
  await db.prepare("UPDATE music_playlist_work_batches SET status='completed' WHERE id=?").bind(b.id).run();
  await repo.clearExpired(now+31*86400000);
  const q=await repo.source(b.queueId);
  await service.action(q.id,"rescan",{expectedVersion:q.version,idempotencyKey:"expired-rescan"},"admin");
  await service.process({kind:"otw_play_work_queue",schemaVersion:1,target:"queue",id:q.id});
  expect((await repo.source(q.id)).progress).toMatchObject({scanGeneration:2,inspected:0});
});
it.each([false,true])('continues a mixed cutoff-only partial batch, retaining other failure=%s as blocked',async otherFailure=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  try {
    await db.prepare("INSERT INTO members(uid,code,name,youtube_channel_id,content_access) VALUES(700001,'bing_hayu','Selected','UCaaaaaaaaaaaaaaaaaaaaaa','normal')").run();
    reader.readPlaylistPage.mockResolvedValueOnce({items:[{playlistItemId:'cutoff-selected',videoId:'PPPPPPPPPP1',position:0},{playlistItemId:'cutoff-remaining',videoId:'PPPPPPPPPP2',position:1}],nextPageToken:null});
    reader.readVideos.mockImplementationOnce(async videos=>videos.map(videoId=>({videoId,availabilityStatus:'playable' as const,video:{videoId,channelId:videoId==='PPPPPPPPPP1'?'UCaaaaaaaaaaaaaaaaaaaaaa':'UCkkkkkkkkkkkkkkkkkkkkkk',channelTitle:'Clips',title:videoId,thumbnailUrl:null,durationSeconds:180,publishedAt:now,availabilityStatus:'playable' as const}})));
    const q=await sourceReady(),b=await service.action(q.id,'start',{expectedVersion:q.version,idempotencyKey:'cutoff-batch'},'admin');
    await service.process({kind:'otw_play_work_queue',schemaVersion:1,target:'batch',id:b!.id});
    await ingestion.process(ingestionSent.shift()!);
    expect((await imports.getJob(b!.jobId)).status).toBe('partial');
    if(otherFailure) await db.prepare("UPDATE music_ingestion_messages SET last_error_code='provider_unavailable' WHERE job_id=? AND status='failed'").bind(b!.jobId).run();
    await service.afterIngestion(b!.jobId);
    const current=await service.batch(b!.id);
    if(otherFailure) {expect(current.status).toBe('preparing');expect(current.errorMessage).toBeTruthy();expect(current.ai).toBeNull();}
    else {
      expect(current.status,current.errorMessage??'review').toBe('review');
      expect(current.items.find(item=>item.playlistItemId==='cutoff-selected')).toMatchObject({outcome:'excluded',reason:'publication_cutoff'});
      expect(current.items.find(item=>item.videoId==='PPPPPPPPPP2')).toMatchObject({outcome:'pending',candidateId:'youtube:PPPPPPPPPP2'});
      expect(current.ai?.total).toBe(1);
    }
  } finally {clock.mockRestore();await db.prepare('DELETE FROM members WHERE uid=700001').run();}
});

it("scopes source progress before unrelated queues and older generations",async()=>{
  const {meterD1}=await import('../../../test-support/d1-meter');
  await db.batch(['target','history'].map(id=>db.prepare("INSERT INTO music_playlist_work_queues(id,playlist_id,source_url,actor,status,created_at,updated_at) VALUES(?,?,?,'admin','waiting',1,1)").bind(id,id,'https://example.com/'+id)));
  await db.batch(['target','history'].map(id=>db.prepare("INSERT INTO music_playlist_work_batches(id,queue_id,job_id,request_key,actor,status,created_at,updated_at) VALUES(?,?,?,?,'admin','completed',1,1)").bind(id,id,'job-'+id,'request-'+id)));
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO music_playlist_work_items(id,batch_id,playlist_item_id,disposition,created_at,updated_at) SELECT 'old-'||x,'history','old-'||x,'excluded',1,1 FROM n").run();
  const meter=meterD1(db),target=await new D1WorkQueueRepository(meter.db).source('target');
  expect(target.progress.inspected).toBe(0);
  console.info('WORK_QUEUE_SOURCE_D1_COST',JSON.stringify(meter.summary()));
  expect(meter.summary().rowsRead).toBeLessThan(100);
});
