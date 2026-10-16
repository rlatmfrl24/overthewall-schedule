import {catalogImportProjection,IngestionService,AiReviewService,D1AiReviewAdoption,D1AiReviewRepository} from "../../otw-play";
import { applyD1Migrations, env, introspectWorkflow } from "cloudflare:test";
import type {WorkflowEvent,WorkflowStep} from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {clearAuthCachesForTests} from "../../../platform/auth";
import { D1TransitionRepository } from "./d1-transition-repository";
import { D1AiUnknownControl } from './d1-ai-unknown-control';
import { projectCapturedRecord,decodeProjectedRecord } from "../domain/projected-content";
import { historicalStatements } from "./historical-statements";
import { D1IngestionRepository } from "../../otw-play/infrastructure/d1-ingestion-repository";
import { classifiedTables } from "./manifest-statements";
import { keySql, type ContentTable } from "./capture-graph";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import type { TransitionPlan } from "../../../../contracts/content-transition";
import {D1FileAvailability} from "../../assets/infrastructure/d1-file-availability";
import {D1R2FileStore} from '../../assets';
import type {FileAvailabilityContext} from "../application/ports/file-availability";
import { handleWorkerFetch } from "../../../app/fetch";
import { transitionPeer } from "../../../app/content-transition";
import {createOtwPlayAiReviewService} from '../../../app/ai-review';
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";
import type {ContentTransitionRelay} from "../../../app/content-transition-relay";
import {handleWorkerQueue} from "../../../app/worker-queue";
import {handleScheduledWorkflowCron,SCHEDULED_WORKFLOW_CRON} from "../../../app/scheduled-workflow-cron";
import { getDb } from "../../../platform/db";
import {WORKER_CACHE_POLICY} from "../../../platform/cache-policy";
import { D1NoticeGateway } from "../../notices/infrastructure/d1-notice-gateway";
import { D1NoticeTransitionWriter } from "../../notices/infrastructure/d1-notice-transition-writer";
import { D1DDayRepository } from "../../ddays/infrastructure/d1-dday-repository";
import { D1DDayTransitionWriter } from "../../ddays/infrastructure/d1-dday-transition-writer";
import { D1PendingScheduleRepository } from "../../schedules/infrastructure/d1-pending-schedule-repository";
import { D1PendingTransitionWriter } from "../../schedules/infrastructure/d1-pending-transition-writer";
import {recoverTransitionWork} from "../../../app/content-transition-recovery";
import {autoFillUndecidedLiveSchedules} from "../../schedules/infrastructure/live-schedule";
import {D1LiveScheduleTransitionWriter} from "../../schedules/infrastructure/d1-live-schedule-transition-writer";
import {D1ChzzkReadJournal} from "./d1-chzzk-read-journal";
import {D1YouTubeVideoReadJournal} from "./d1-youtube-video-read-journal";
import {D1YouTubeChannelReadJournal} from "./d1-youtube-channel-read-journal";
import {readYouTubeQuotaLedgerUsage} from "../../youtube/infrastructure/youtube-quota";
import {D1ChzzkScanTransitionWriter} from "../../schedules/infrastructure/d1-chzzk-scan-transition-writer";
import {scanAndPersistRecentChzzkObservations,autoUpdateSchedules} from "../../schedules/infrastructure/auto-update";
import {D1CollectorTransitionWriter} from "../../schedules/infrastructure/d1-collector-transition-writer";
import {reconcileHolidaySuggestions} from "../../schedules/infrastructure/holiday-suggestions";
import {chzzkVideoCatalog,type ChzzkVideoCatalog} from "../../chzzk";
import {D1ScheduledJobRepository} from "../../../platform/scheduled-jobs";
import {D1ChzzkCollectorWriter} from "../../schedules/infrastructure/d1-chzzk-collector-writer";
import {ScheduledJobExecutor,ScheduledJobCoordinator} from "../../scheduled-operations";
import {D1ScheduleWriteRepository,D1ScheduleTransitionWriter,parseScheduleInput,parseScheduleCommand,parseChzzkScanCommand} from "../../schedules";
import {ScheduledOperationsWorkflow} from "../../../workflows/scheduled-workflows";
import type {ScheduledOperationsWorkflowParams} from "@contracts/scheduled-operations";
import {getDataRetentionStatus,readDueDataRetentionPolicyIds,runDataRetentionPolicyPrune} from "../../operations";

const bindings = env as typeof env & { transition_target_db: D1Database; CONTENT_TRANSITION_MIGRATIONS: D1Migration[]; ASSET_BUCKET:R2Bucket;TRANSITION_TARGET_BUCKET:R2Bucket;SOURCE_ASSETS:Fetcher;TARGET_ASSETS:Fetcher };
const sourceDb = bindings.otw_db;
const targetDb = bindings.transition_target_db;
const fixtureClassifications: Array<TransitionPlan["classifications"][number]>=[];
const fixtureRows=new Map<D1Database,{table:ContentTable;rows:Record<string,unknown>[]}[]>();
const plan = {
  id: "move", sourceSite: "otw", targetSite: "luvdia", sourceResource: "source-db", targetResource: "target-db",
  generation: 2, protocol: 1, manifestDigest: "reviewed-manifest",assetBuckets:{source:"otw-bucket",target:"luvdia-bucket"}, members: [
    { code: "bing_hayu", uid: 1, targetUid:1 }, { code: "u_lili", uid: 2, targetUid:2 }, { code: "yang_mei", uid: 3, targetUid:3 },
  ], classifications: fixtureClassifications,
} as const;
const sourceAvailability=new D1FileAvailability(sourceDb,bindings.ASSET_BUCKET,bindings.SOURCE_ASSETS,"otw","otw-bucket");
const targetAvailability=new D1FileAvailability(targetDb,bindings.TRANSITION_TARGET_BUCKET,bindings.TARGET_ASSETS,"luvdia","luvdia-bucket");
const source = new D1TransitionRepository(sourceDb, "otw", "source-db","otw-bucket",sourceAvailability, catalogImportProjection,new D1AiReviewAdoption(sourceDb));
const target = new D1TransitionRepository(targetDb, "luvdia", "target-db","luvdia-bucket",targetAvailability, catalogImportProjection);
const now = 100;
const relayBindings=env as typeof env & {SOURCE_RELAY:Service<ContentTransitionRelay>;TARGET_RELAY:Service<ContentTransitionRelay>;SOURCE_WORKER:Fetcher;TARGET_WORKER:Fetcher};
const admission = (id: string, hash = id) => ({
  codec:{id:"schedules.mutate",version:1},
  transitionId: plan.id, operationId: id, payloadHash: hash, idempotencyKey: id, kind: "content_edit" as const,
  subject: { table: "schedules", key: "[1]" }, expectedVersion: null,
  validation: { contract: 1, validatedAt: now }, payload: {action:"update",input:{id:1,member_uid:1,date:"2026-10-14",start_time:null,title:"accepted edit",status:"방송"}}, admittedAt: now,
});

const fixtureScheduleInput=(payload:Record<string,unknown>)=>{
  const command=parseScheduleCommand(payload);
  if(!command||command.action==='delete') throw new Error('Expected the real schedule mutation fixture');
  return command.input;
};

async function migrate(db: D1Database) {
  const codes = ["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"];
  for (const migration of bindings.CONTENT_TRANSITION_MIGRATIONS) {
    if (migration.name.startsWith("0030_")) {
      await db.batch(codes.map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    }
    try { await applyD1Migrations(db, [migration]); }
    catch (error) { throw new Error(`Actual chain failed at ${migration.name}`, { cause: error }); }
  }
  await db.batch([
    db.prepare("DELETE FROM member_links WHERE member_uid BETWEEN -10007 AND -10000"),
    db.prepare("DELETE FROM members WHERE uid BETWEEN -10007 AND -10000"),
  ]);
}

beforeAll(async () => {
  await migrate(sourceDb); await migrate(targetDb);
  for(const db of [sourceDb,targetDb]) fixtureRows.set(db,await Promise.all((Object.keys(contentDispositionRegistry) as ContentTable[]).map(async table=>({table,rows:(await db.prepare(`SELECT * FROM "${table}"`).all<Record<string,unknown>>()).results}))));
  for(const table of classifiedTables) {
    const rows=(await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results;
    fixtureClassifications.push(...rows.map(row=>({table,key:row.identity,disposition:"exclude" as const,reason:"Fixture-approved unrelated site configuration"})));
  }
}, 120000);
beforeEach(async () => {
  vi.restoreAllMocks();
  for(const db of [sourceDb,targetDb]) {
    await db.prepare('DELETE FROM content_transitions').run();
    const baseline=fixtureRows.get(db)!.toSorted((a,b)=>Number(a.table==='asset_file_reference_paths')-Number(b.table==='asset_file_reference_paths'));
    await db.batch([
      db.prepare('PRAGMA defer_foreign_keys=ON'),
      ...baseline.filter(({table})=>table!=='content_transitions').map(({table})=>db.prepare(`DELETE FROM "${table}"`)),
      ...baseline.flatMap(({table,rows})=>rows.map(row=>{
        const columns=Object.keys(row);
        return db.prepare(`INSERT INTO "${table}"(${columns.map(column=>'"'+column+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(column=>row[column]));
      })),
      ...(db===sourceDb?plan.members.map(member=>db.prepare('INSERT INTO members(uid,code,name) VALUES(?,?,?)').bind(member.uid,member.code,member.code)):[]),
      db.prepare('PRAGMA defer_foreign_keys=OFF'),
    ]);
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  }
  await source.prepare(plan);await target.prepare(plan);
});

it('launch_independent_core saves through ordinary LuvDia APIs without transition or peer authority',async()=>{
  const publicationClock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-18T15:00:00Z'));
  await sourceDb.prepare('DELETE FROM content_transitions').run();
  await targetDb.prepare('DELETE FROM content_transitions').run();
  await targetDb.batch(plan.members.map(member=>targetDb.prepare('INSERT INTO members(uid,code,name) VALUES(?,?,?)').bind(member.targetUid,member.code,member.code)));
  await seedPublicationCatalog('draft',false,targetDb);
  await targetDb.batch([
    targetDb.prepare("INSERT INTO settings(key,value) VALUES('otw_play_automation_paused','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value"),
    targetDb.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled' OR key='auto_update_enabled'"),
  ]);
  const fixture=await pendingAdminFixture('luvdia');
  Object.assign(fixture.runtime,{CONTENT_TRANSITION_PEER:undefined,ASSET_BUCKET:bindings.TRANSITION_TARGET_BUCKET,ASSETS:bindings.TARGET_ASSETS,YOUTUBE_API_KEY:'',GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false',OTW_PLAY_AI_REVIEW_QUEUE:undefined,OTW_OPS_BACKGROUND_QUEUE:undefined,OTW_OPS_CRITICAL_QUEUE:undefined,OTW_OPS_CONTROL_QUEUE:undefined,OTW_PLAY_INGESTION_QUEUE:undefined,SCHEDULED_OPERATIONS_WORKFLOW:undefined});
  const request=async(path:string,method='GET',body?:unknown,actor:string|null='luvdia-pending-admin')=>handleWorkerFetch(new Request(`http://localhost:5174${path}`,{method,headers:{...(actor?{Authorization:`Bearer ${await fixture.token(actor)}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  try {
    expect(await target.readInactiveTargetWorkspace()).toBeNull();
    const profile=await request('/api/members/bing_hayu','GET',undefined,null);expect(profile.status,await profile.clone().text()).toBe(200);expect(await profile.text()).toContain('bing_hayu');
    const schedule={member_uid:1,date:'2026-10-17',title:'Independent launch schedule',status:'휴방'};
    expect((await request('/api/schedules/save','POST',schedule,null)).status).toBe(403);
    const saved=await request('/api/schedules/save','POST',schedule,'ordinary-member');expect(saved.status,await saved.clone().text()).toBe(200);
    const read=await request('/api/schedules?date=2026-10-17','GET',undefined,null);expect(read.status).toBe(200);expect(await read.text()).toContain(schedule.title);
    const song={slug:'launch-native-song',title:'Independent launch song',isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:'unknown',aliases:[],originalArtists:[{entityId:'publication-singer',creditOrder:0,isPrimary:true}],tags:[]};
    expect((await request('/api/play/admin/songs','POST',song,'ordinary-member')).status).toBe(403);
    const created=await request('/api/play/admin/songs','POST',song);expect(created.status,await created.clone().text()).toBe(201);
    expect(await targetDb.prepare("SELECT count(*) n FROM music_song_original_artists WHERE song_id=(SELECT id FROM music_songs WHERE slug='launch-native-song') AND entity_id='publication-singer'").first('n')).toBe(1);
    const publish=await request('/api/play/admin/performances/publication-selected/publish','POST',{expectedVersion:0});expect(publish.status,await publish.clone().text()).toBe(200);
    expect(await publish.json()).toMatchObject({data:{publicationStatus:'published',version:1,participants:[{displayName:'Selected Singer'}],sources:[{source:{externalId:'PubVideo001'}}]}});
    const stale=await request('/api/play/admin/performances/publication-selected/withdraw','POST',{expectedVersion:0});expect(stale.status).toBe(409);
    const disabledCatalog=await request('/api/play/catalog','GET',undefined,'ordinary-member');expect(disabledCatalog.status).toBe(404);expect(await disabledCatalog.json()).toMatchObject({error:{code:'PLAY_PUBLIC_READ_DISABLED'}});
    const release=await request('/api/play/admin/release');expect(release.status).toBe(200);
    const {data:releaseState}=await release.json<{data:{publicReadEnabled:boolean;navigationVisible:boolean;updatedAt:number;readyForPublicRead:boolean}}>();
    expect(releaseState.readyForPublicRead).toBe(true);
    const opened=await request('/api/play/admin/release','PATCH',{expected:{publicReadEnabled:releaseState.publicReadEnabled,navigationVisible:releaseState.navigationVisible,updatedAt:releaseState.updatedAt},target:{publicReadEnabled:true,navigationVisible:false},confirmation:'direct_routes_verified'});expect(opened.status,await opened.clone().text()).toBe(200);
    const catalog=await request('/api/play/catalog','GET',undefined,'ordinary-member');expect(catalog.status,await catalog.clone().text()).toBe(200);expect(await catalog.text()).toContain('publication-selected');
    const {data:openedState}=await opened.json<{data:{updatedAt:number}}>();
    const navigation=await request('/api/play/admin/release','PATCH',{expected:{publicReadEnabled:true,navigationVisible:false,updatedAt:openedState.updatedAt},target:{publicReadEnabled:true,navigationVisible:true},confirmation:'public_canary_verified'});expect(navigation.status,await navigation.clone().text()).toBe(200);
    const notice=await request('/api/notices','POST',{content:'Independent launch community notice',related_member_uids:[1]});expect(notice.status,await notice.clone().text()).toBe(201);
    const notices=await request('/api/notices','GET',undefined,null);expect(notices.status).toBe(200);expect(await notices.text()).toContain('Independent launch community notice');
    const asset=await request('/profile/bing_hayu.webp','GET',undefined,null);expect(asset.status).toBe(200);expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const ai=await request('/api/play/admin/ai-reviews','POST',{target:{youtubeUrl:'https://www.youtube.com/watch?v=PubVideo001',candidateKind:'official_video'},range:null,idempotencyKey:'launch-disabled-ai'});expect(ai.status).toBe(503);
    const monitor=await request('/api/play/admin/channel-monitors','POST',{externalChannelId:`UC${'p'.repeat(22)}`});expect(monitor.status).toBe(409);expect(await monitor.text()).toContain('automation is paused');
    expect(fixture.send).not.toHaveBeenCalled();
    expect(await targetDb.prepare('SELECT count(*) n FROM content_transitions').first('n')).toBe(0);
    expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
    expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
    expect(await sourceDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(0);
    expect(await sourceDb.prepare('SELECT count(*) n FROM music_songs').first('n')).toBe(0);
    expect((await targetDb.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  }finally{fixture.close();publicationClock.mockRestore();}
},30000);

it('abort_restore preserves original access and hides abandoned target staging',async()=>{
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status,content_access) VALUES(701,1,'2026-10-15','Original normal','휴방','normal')"),
    sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status,content_access) VALUES(702,2,'2026-10-16','Original private archive','휴방','admin_archive')"),
  ]);
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'};
  const routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  const routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));
  await routeSource.stopMaintenance(plan.id,Date.now());await capturing(routeSource);await installInactiveBaseline(routeSource,routeTarget);
  await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'abort-readiness',Date.now()+60000),Date.now());
  const fence=await routeSource.freeze(plan.id,Date.now());await routeTarget.installFence(fence);await transferStaticProof();await routeTarget.installCommittedState(plan.id);
  const journal=await routeSource.readJournal(plan.id),images=(await sourceDb.prepare('SELECT * FROM content_transition_images ORDER BY row_table,row_key').all()).results;
  expect(await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).toEqual({resumed:false,reason:'target_not_aborted'});
  await sourceDb.prepare("CREATE TRIGGER task44_abort_archive_failure BEFORE UPDATE OF content_access ON schedules WHEN OLD.id=701 BEGIN SELECT RAISE(ABORT,'archive_atomic_failure'); END").run();
  try {
    await expect(routeSource.archiveSource(plan.id)).rejects.toThrow(/archive_atomic_failure/);
    expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_membership WHERE archive_previous_access IS NOT NULL').first('n')).toBe(0);
    expect(await sourceDb.prepare('SELECT archive_receipt_json FROM content_transitions').first('archive_receipt_json')).toBeNull();
    expect(await sourceDb.prepare('SELECT content_access FROM schedules WHERE id=701').first('content_access')).toBe('normal');
  } finally {await sourceDb.prepare('DROP TRIGGER task44_abort_archive_failure').run();}
  const archive=await routeSource.archiveSource(plan.id);expect(archive.restoreEvidence).toBe(1);expect(await routeSource.archiveSource(plan.id)).toEqual(archive);
  expect((await sourceDb.prepare("SELECT row_key,archive_previous_access FROM content_transition_membership WHERE root_table='schedules' AND root_table=row_table AND root_key=row_key ORDER BY row_key").all()).results).toEqual([{row_key:'[701]',archive_previous_access:'normal'},{row_key:'[702]',archive_previous_access:null}]);
  const racingTarget=new D1TransitionRepository(interleave(targetDb,'batch',()=>routeTarget.abortTargetBeforeActivation(plan.id,Date.now())),'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await expect(racingTarget.activate(plan.id)).rejects.toThrow(/activation_proof_conflict|malformed JSON/);
  const abort=await routeTarget.readTargetAbort(plan.id);expect(abort).toMatchObject({kind:'target_aborted',fence});
  expect(await routeTarget.abortTargetBeforeActivation(plan.id,Date.now())).toEqual(abort);
  expect(await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).toEqual({resumed:true});
  expect(await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).toEqual({resumed:true});
  expect((await sourceDb.prepare('SELECT id,content_access FROM schedules ORDER BY id').all()).results).toEqual([{id:701,content_access:'normal'},{id:702,content_access:'admin_archive'}]);
  expect(await routeSource.readSourceFence(plan.id)).toEqual(fence);expect(await routeSource.readJournal(plan.id)).toEqual(journal);
  expect((await sourceDb.prepare('SELECT * FROM content_transition_images ORDER BY row_table,row_key').all()).results).toEqual(images);
  await expect(routeTarget.activate(plan.id)).rejects.toThrow(/aborted/);
  await expect(routeSource.beginReplay(plan.id)).rejects.toThrow(/aborted/);
  await expect(sourceDb.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode) VALUES(1,?,'stale-executor',1,'business')").bind(plan.id).run()).rejects.toThrow(/aborted/);
  const fixture=await pendingAdminFixture('otw');fixture.runtime.CONTENT_TRANSITION_PEER=undefined;
  try {
    const saved=await sourceRouteSave({member_uid:1,date:'2026-10-15',title:'Own source restored',status:'휴방'});expect(saved.status,await saved.clone().text()).toBe(200);
    expect(await sourceDb.prepare("SELECT title FROM schedules WHERE member_uid=1 AND date='2026-10-15' AND content_access='normal'").first('title')).toBe('Own source restored');
    expect(await sourceDb.prepare('SELECT content_access FROM schedules WHERE id=702').first('content_access')).toBe('admin_archive');
    expect(await routeSource.readJournal(plan.id)).toEqual(journal);await recoverTransitionWork(fixture.runtime);
  } finally {fixture.close();}
  const targetFixture=await pendingAdminFixture('luvdia');targetFixture.runtime.CONTENT_TRANSITION_PEER=undefined;
  const targetPublicationClock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-18T15:00:00Z'));
  try {
    expect(await routeTarget.readInactiveTargetWorkspace()).toEqual({nativeReady:false});
    for(const actor of [null,'ordinary-member']) {
      const response=await handleWorkerFetch(new Request('http://localhost:5174/api/members',{headers:actor?{Authorization:`Bearer ${await targetFixture.token(actor)}`}:{}}),targetFixture.runtime);
      expect(response.status).toBe(403);expect(await response.json()).toMatchObject({error:{code:'CONTENT_PREPARING'}});
    }
    const denied=await handleWorkerFetch(new Request('http://localhost:5174/api/schedules/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({member_uid:1,date:'2026-10-15',title:'Must not open',status:'휴방'})}),targetFixture.runtime);
    expect(denied.status).toBe(503);expect(await denied.json()).toMatchObject({error:{code:'CONTENT_MAINTENANCE'}});
    expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
    expect(await targetDb.prepare('SELECT title FROM schedules WHERE id=701').first('title')).toBe('Original normal');
  } finally {targetFixture.close();targetPublicationClock.mockRestore();}
},30000);
it('maintenance stop preserves prepared writes and blocks real late execution before coherent protection',async()=>{
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'};
  const routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  const routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  const fixture=await pendingAdminFixture('otw');
  const native=env as typeof env & {NATIVE_SCHEDULED_WORKFLOW:Workflow<ScheduledOperationsWorkflowParams>};
  const inspector=await introspectWorkflow(native.NATIVE_SCHEDULED_WORKFLOW);
  await inspector.modifyAll(async modifier=>{await modifier.disableRetryDelays();});
  try {
    const original={member_uid:1,date:'2026-10-15',title:'Prepared source still serves',status:'방송'};
    const saved=await sourceRouteSave(original);expect(saved.status,await saved.clone().text()).toBe(200);
    expect(await sourceDb.prepare('SELECT title FROM schedules WHERE member_uid=1').first('title')).toBe(original.title);
    await expect(routeSource.protect(plan.id,{receiptId:'too-early',protocol:1,manifestDigest:plan.manifestDigest})).rejects.toThrow(/maintenance stop/);
    const peer=await relayBindings.TARGET_RELAY.describe(plan.id);
    await expect(routeSource.beginMaintenance(plan.id,Date.now(),{...peer,schemaDigest:'wrong-schema'})).rejects.toThrow(/preflight/);
    expect(await sourceDb.prepare('SELECT maintenance_state FROM content_transitions').first('maintenance_state')).toBe('open');
    const jobs=new D1ScheduledJobRepository(sourceDb);
    const run=await jobs.createRun({jobType:'schedule_auto_update',source:'manual',idempotencyKey:'maintenance-active-original'});
    const ids=await jobs.addItems(run.id,[{targetKey:'maintenance-original',phase:'finalize',lane:'auto-update',continuation:null}]);
    const claimed=(await jobs.claimItem(ids[0]))!;
    expect(claimed.lease_token).not.toBeNull();
    const bytes=new Uint8Array([1,2,3,4]);let puts=0;
    const bucket=new Proxy(bindings.ASSET_BUCKET,{get(actual,key){
      if(key==='put')return async(...args:Parameters<R2Bucket['put']>)=>{
        puts++;await routeSource.beginMaintenance(plan.id,Date.now(),peer);
        const blockers=await routeSource.readMaintenanceBlockers(plan.id);
        expect(blockers).toMatchObject({scheduledItems:1,fileEffects:1});
        await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/unresolved original work/);
        return actual.put(...args);
      };
      const value=Reflect.get(actual,key);return typeof value==='function'?value.bind(actual):value;
    }});
    const files=new D1R2FileStore(sourceDb,bucket,'otw','otw-bucket');
    const held=await files.begin({operationId:'maintenance-unissued-file',logicalKey:'notices/thumbnails/maintenance-held.png',contentType:'image/png',bytes});
    const committed=await files.put({operationId:'maintenance-issued-file',logicalKey:'profile/bing_hayu.webp',contentType:'image/webp',bytes});
    expect(puts).toBe(1);
    await expect(files.verifyPut(held,bytes)).rejects.toThrow(/maintenance_admission/);
    expect(puts).toBe(1);
    expect(await sourceDb.prepare('SELECT acknowledged_at FROM asset_file_versions WHERE operation_id=?').bind(committed.operationId).first('acknowledged_at')).not.toBeNull();
    expect((await routeSource.readMaintenanceBlockers(plan.id)).fileEffects).toBe(0);
    expect(await jobs.completeItem(claimed,{status:'succeeded',result:{originalResult:true}})).toBe(true);
    const before={runs:(await sourceDb.prepare('SELECT * FROM scheduled_job_runs ORDER BY id').all()).results,
      items:(await sourceDb.prepare('SELECT * FROM scheduled_job_items ORDER BY id').all()).results,
      settings:(await sourceDb.prepare('SELECT * FROM settings ORDER BY key').all()).results};
    const denied=await sourceRouteSave({...original,title:'Must remain unaccepted'});
    expect(denied.status).toBe(503);expect(await denied.json()).toMatchObject({error:{code:'CONTENT_MAINTENANCE'}});
    const message={body:{schemaVersion:1,jobId:'held-original',idempotencyKey:'held-original'},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'otw-play-ingestion',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
    expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalledWith({delaySeconds:60});
    fixture.runtime.SCHEDULED_OPERATIONS_WORKFLOW=native.NATIVE_SCHEDULED_WORKFLOW;
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.parse('2026-10-15T04:03:00Z')} as ScheduledController,fixture.runtime);
    expect(await inspector.get()).toHaveLength(0);
    // A genuinely bound Workflow already delivered after ingress closure still
    // runs its original durable step and every original retry hits the gate.
    await native.NATIVE_SCHEDULED_WORKFLOW.create({id:'maintenance-original-workflow',params:{jobType:'schedule_auto_update',scheduledFor:Date.now()}});
    const instances=await inspector.get();expect(instances).toHaveLength(1);
    await instances[0].waitForStatus('errored');
    expect((await sourceDb.prepare('SELECT * FROM scheduled_job_runs ORDER BY id').all()).results).toEqual(before.runs);
    expect((await sourceDb.prepare('SELECT * FROM scheduled_job_items ORDER BY id').all()).results).toEqual(before.items);
    expect((await sourceDb.prepare('SELECT * FROM settings ORDER BY key').all()).results).toEqual(before.settings);
    expect((await routeSource.readMaintenanceBlockers(plan.id)).scheduledDispatch).toBeGreaterThan(0);
    await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());
    const terminal={body:{schemaVersion:1,messageType:'scheduled_job_item',runId:run.id,itemId:claimed.id,phase:'finalize'},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'otw-ops-background',messages:[terminal]} as unknown as MessageBatch<unknown>,fixture.runtime);
    expect(terminal.ack).toHaveBeenCalledOnce();expect(terminal.retry).not.toHaveBeenCalled();
    const finalizedSettings=(await sourceDb.prepare('SELECT * FROM settings ORDER BY key').all()).results;
    await routeSource.beginMaintenance(plan.id,Date.now(),peer);
    const proof=await routeSource.stopMaintenance(plan.id,Date.now());
    const proofRaw=await sourceDb.prepare('SELECT maintenance_proof_json FROM content_transitions').first('maintenance_proof_json');
    expect(Object.values(proof.stop.blockers).every(value=>value===0)).toBe(true);
    expect(await routeSource.stopMaintenance(plan.id,Date.now())).toEqual(proof);
    await expect(sourceDb.batch([sourceDb.prepare("UPDATE schedules SET title='Late original callback' WHERE member_uid=1"),sourceDb.prepare("UPDATE settings SET value='0' WHERE key='auto_update_last_run'")])).rejects.toThrow(/maintenance_stopped/);
    expect(await sourceDb.prepare('SELECT title FROM schedules WHERE member_uid=1').first('title')).toBe(original.title);
    expect((await sourceDb.prepare('SELECT * FROM settings ORDER BY key').all()).results).toEqual(finalizedSettings);
    await expect(routeSource.admit(admission('maintenance-no-new-command'))).rejects.toThrow(/점검/);
    expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
    await routeSource.armFileInventory(plan.id,'maintenance-files');await sourceAvailability.observeArmedInventory(plan.id,'maintenance-files');
    await routeSource.protect(plan.id,{receiptId:'maintenance-protection',protocol:1,manifestDigest:plan.manifestDigest,inventoryId:'maintenance-files'});
    expect((await routeSource.readTransition(plan.id)).phase).toBe('protected');
    const image=await sourceDb.prepare("SELECT image_json FROM content_transition_images WHERE row_table='schedules' AND json_extract(image_json,'$.member_uid')=1").first<string>('image_json');
    expect(JSON.parse(image!).title).toBe(original.title);
    expect(await sourceDb.prepare('SELECT maintenance_proof_json FROM content_transitions').first('maintenance_proof_json')).toBe(proofRaw);
    expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(0);
  } finally {await inspector.dispose();fixture.close();}
},30000);

it("projects an approved absolute asset origin into target-relative references while preserving sealed source bytes",async()=>{
  await sourceDb.prepare("DELETE FROM content_transitions").run();await targetDb.prepare("DELETE FROM content_transitions").run();
  const raw="https://otw-schedule.info/profile/%62ing_hayu.webp?revision=1#image";
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(901,'origin reference','[1]',?)").bind(JSON.stringify([raw])).run();
  await expect(source.prepare(plan)).rejects.toThrow(/classification/);
  const ownPlan:TransitionPlan={...plan,fileOrigins:[{kind:"site",origin:"https://otw-schedule.info",site:"otw"}]};
  await source.prepare(ownPlan);await target.prepare(ownPlan);
  await ready();
  const header=await source.describeBaseline(plan.id);await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do {const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* normal bounded installer */ }
  await target.finalizeBaseline(plan.id);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe('["/profile/bing_hayu.webp"]');
  expect(await targetDb.prepare("SELECT raw_url FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[901]'").first("raw_url")).toBe("/profile/bing_hayu.webp");
  const sealed=await sourceDb.prepare("SELECT image_json FROM content_transition_images WHERE row_table='notices' AND row_key='[901]'").first<string>("image_json");
  expect(sealed).toContain(raw);
  expect(await sourceDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe(JSON.stringify([raw]));
  const beforeHeader=await source.describeBaseline(plan.id);
  await source.admit(admission("unknown-origin"));
  await source.commit(plan.id,"unknown-origin",1,[sourceDb.prepare("UPDATE notices SET image_urls=? WHERE id=901").bind('["https://new-origin.example/profile/bing_hayu.webp"]')]);
  expect(await sourceDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toContain("new-origin.example");
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  await expect(source.exportProjectedCommits(plan.id,header.boundary)).rejects.toThrow(/classification/);
  const parent={revision:0,digest:plan.manifestDigest},protection={receiptId:"origin-review",protocol:1,manifestDigest:"origin-v2"};
  const originAddition=[{kind:"external" as const,origin:"https://new-origin.example",reason:"Reviewed remote external-only reference"}];
  const revision=await source.appendClassifications(plan.id,parent,[],"origin-v2",protection,originAddition);
  expect(await source.appendClassifications(plan.id,parent,[],"origin-v2",protection,originAddition)).toEqual(revision);
  await expect(source.appendClassifications(plan.id,parent,[],"origin-v2",protection,[{...originAddition[0],reason:"different"}])).rejects.toThrow(/conflict/i);
  await target.acceptManifestRevision(revision);
  await expect(target.acceptManifestRevision({...revision,plan:{...revision.plan,fileOrigins:[{kind:"site",site:"otw",origin:"https://foreign.example"},...originAddition]}})).rejects.toThrow(/conflict/i);
  expect(await source.describeBaseline(plan.id)).toEqual(beforeHeader);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"origin-v2-ready",1000),now);
  const fence=await source.freeze(plan.id,now);await target.installFence(fence);
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) await target.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe('["https://new-origin.example/profile/bing_hayu.webp"]');
  await expect(source.appendClassifications(plan.id,{revision:1,digest:"origin-v2"},[],"origin-v3",{...protection,manifestDigest:"origin-v3"},[{kind:"external",origin:"https://later.example",reason:"late"}])).rejects.toThrow(/frozen/);
});

async function capturing(repository=source) {
  const state=await sourceDb.prepare('SELECT maintenance_state FROM content_transitions WHERE id=?').bind(plan.id).first<string>('maintenance_state');
  if(state!=='stopped') {
    const identity=await repository.readTransition(plan.id);
    const peer=new D1TransitionRepository(targetDb,'luvdia',identity.targetResource,'luvdia-bucket',targetAvailability,catalogImportProjection);
    if(state==='open') await repository.beginMaintenance(plan.id,now,await peer.describePeer(plan.id));
    await repository.stopMaintenance(plan.id,now);
  }
  await repository.armFileInventory(plan.id,"files");await sourceAvailability.observeArmedInventory(plan.id,"files");
  const cost=await repository.protect(plan.id, { receiptId: "protection", protocol: 1, manifestDigest: plan.manifestDigest,inventoryId:"files" });
  await repository.beginCopy(plan.id);
  await repository.beginReplay(plan.id);
  return cost;
}
it("task4.4 commits a pending approval with its complete original schedule audit and deletion batch",async()=>{
  await sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,start_time,title,status,action_type,vod_id) VALUES(801,1,'Source member','2026-10-15','20:00','Pending approval','방송','create','pending-vod-801')").run();
  await capturing();
  const writer=new D1PendingScheduleRepository(sourceDb,new D1PendingTransitionWriter(source,"otw"));
  const item=(await writer.findById(801))!;
  const result=await writer.approve(item,null,{actorId:"source-admin",actorName:"Source admin",actorIp:"127.0.0.1"});
  expect(result,JSON.stringify({result,schedules:(await sourceDb.prepare("SELECT * FROM schedules").all()).results,logs:(await sourceDb.prepare("SELECT * FROM update_logs").all()).results})).toMatchObject({success:true,action:"create"});
  if(!result.success) throw new Error("Expected actual pending approval");
  const schedule=await sourceDb.prepare("SELECT id,title FROM schedules WHERE member_uid=1").first<{id:number;title:string}>();
  expect(schedule).toEqual({id:result.scheduleId,title:"Pending approval"});
  expect(await sourceDb.prepare("SELECT schedule_id,actor_id,actor_name,actor_ip FROM update_logs WHERE action='approve'").first()).toEqual({schedule_id:schedule!.id,actor_id:"source-admin",actor_name:"Source admin",actor_ip:"127.0.0.1"});
  expect(await writer.findById(801)).toBeNull();
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='pending.local' AND json_extract(outcome_json,'$.outcome')='committed'").first("n")).toBe(1);
});
it("task4.4 captures live schedule creation and its audit in the same original owning batch",async()=>{
  await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${"a".repeat(32)}`).run();await capturing();
  const items=[{channelId:"a".repeat(32),content:{status:"OPEN" as const,liveTitle:"Actual live fill",openDate:"2026-10-15T13:10:00+09:00",concurrentUserCount:1,liveImageUrl:"",defaultThumbnailImageUrl:"",channelId:"a".repeat(32),channelName:"Selected",channelImageUrl:""}}];
  const result=await autoFillUndecidedLiveSchedules(getDb({otw_db:sourceDb} as Env),items,new D1LiveScheduleTransitionWriter(source,"otw"));
  expect(result.updated).toBe(1);
  const schedule=await sourceDb.prepare("SELECT id,title FROM schedules WHERE member_uid=1").first<{id:number;title:string}>();expect(schedule?.title).toBe("Actual live fill");
  expect(await sourceDb.prepare("SELECT schedule_id,actor_id,actor_name FROM update_logs WHERE action='schedule_auto_created'").first()).toEqual({schedule_id:schedule!.id,actor_id:null,actor_name:null});
});
async function pendingAdminFixture(site:"otw"|"luvdia",db=site==="otw"?sourceDb:targetDb,provider?:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>) {
  clearAuthCachesForTests();
  const issuer=`https://${site}.pending-clerk.example`,origin=site==="otw"?"http://localhost:5173":"http://localhost:5174";
  const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"pending-fixture",alg:"RS256",use:"sig"};
  const encode=(value:string|ArrayBuffer)=>btoa(String.fromCharCode(...(typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const token=async(sub:string,iss=issuer)=>{const content=`${encode(JSON.stringify({alg:"RS256",kid:jwk.kid}))}.${encode(JSON.stringify({iss,azp:origin,sub,exp:Math.floor(Date.now()/1000)+300}))}`;return `${content}.${encode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(content)))}`;};
  const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{if(String(input)===`${issuer}/.well-known/jwks.json`) return Response.json({keys:[jwk]});if(provider) return provider(input,init);throw new Error("Unexpected external fixture IO");});
  const send=vi.fn().mockRejectedValue(new Error("Lost first queue send"));
  const runtime={...bindings,...siteEnv(site),otw_db:db,SITE_ASSET_BUCKET_NAME:site==="otw"?"otw-bucket":"luvdia-bucket",CLERK_ISSUER:issuer,CLERK_AUTHORIZED_PARTIES:origin,CLERK_ADMIN_IDS:`${site}-pending-admin`,OTW_OPS_BACKGROUND_QUEUE:{send}} as unknown as Env;
  return {runtime,send,token,request:async(path:string,body:unknown={},sub=`${site}-pending-admin`,iss=issuer)=>handleWorkerFetch(new Request(`${origin}/api/settings/pending/${path}`,{method:"POST",headers:{Authorization:`Bearer ${await token(sub,iss)}`,"Content-Type":"application/json"},body:JSON.stringify(body)}),runtime),close:()=>{fetch.mockRestore();clearAuthCachesForTests();}};
}
const liveFixtureItem=(channelId:string)=>({channelId,content:{status:"OPEN" as const,liveTitle:`Live ${channelId[0]}`,openDate:"2026-10-15T13:10:00+09:00",concurrentUserCount:1,liveImageUrl:"",defaultThumbnailImageUrl:"",channelId,channelName:"Actual cached member",channelImageUrl:""}});
const chzzkScanAdmission=(operationId:string)=>({transitionId:plan.id,operationId,idempotencyKey:operationId,kind:"collection_due" as const,subject:{table:"schedule_broadcast_observations",key:JSON.stringify([operationId])},codec:{id:"schedules.chzzk_scan",version:1},expectedVersion:null,validation:{contract:1,validatedAt:now},admittedAt:now,payload:{members:[{uid:1,code:"bing_hayu",name:"Selected",channelId:"a".repeat(32)}],rangeDays:3,startedAt:now,startDate:"2026-10-13",today:"2026-10-15"}});
it("review corrections retain native CHZZK reads through real run-now children and finalizer, then prune within the cascade budget",async()=>{
  const started=Date.parse("2026-10-15T13:00:00+09:00"),day=86400000,channel="a".repeat(32),policy="native-chzzk-read-detail";
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=NULL"),sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`)]);
  const {routeSource,routeTarget}=await routeControls();
  await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);
  expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");
  const prior=await targetDb.prepare("SELECT value FROM settings WHERE key='auto_update_enabled'").first<string>("value");
  await targetDb.prepare("INSERT INTO settings(key,value) VALUES('auto_update_enabled','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  const fixture=await pendingAdminFixture("luvdia"),clock=vi.spyOn(Date,"now").mockReturnValue(started),messages:unknown[]=[];
  fixture.runtime.OTW_OPS_CONTROL_QUEUE={send:async(body:unknown)=>{messages.push(body);}} as unknown as Queue;
  fixture.runtime.OTW_OPS_BACKGROUND_QUEUE={send:async(body:unknown)=>{messages.push(body);}} as unknown as Queue;
  const video=vi.spyOn(chzzkVideoCatalog,"fetchVideosBatch").mockResolvedValue([{channelId:channel,content:{data:[{videoId:"retention-native",videoTitle:"Retained actual result",publishDateAt:started-day,duration:3600,thumbnailImageUrl:null}]}}] as never);
  const live=vi.spyOn(chzzkVideoCatalog,"fetchLiveStatus").mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}} as never);
  const consume=async(body:unknown)=>{const message={body,ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:(body as {messageType?:string}).messageType==="scheduled_job_control"?"luvdia-ops-control":"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry,JSON.stringify({body,items:(await targetDb.prepare("SELECT phase,status,last_error FROM scheduled_job_items WHERE run_id=?").bind((body as {runId?:string}).runId??"").all()).results})).not.toHaveBeenCalled();expect(message.ack).toHaveBeenCalledOnce();};
  const count=async()=>({requests:await targetDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests").first<number>("n"),attempts:await targetDb.prepare("SELECT count(*) n FROM content_transition_chzzk_attempts").first<number>("n")});
  const status=async()=>{
    const response=await handleWorkerFetch(new Request("http://localhost:5174/api/operations/data-retention/status",{headers:{Authorization:`Bearer ${await fixture.token("luvdia-pending-admin")}`}}),fixture.runtime);
    expect(response.status).toBe(200);
    return (await response.json() as Awaited<ReturnType<typeof getDataRetentionStatus>>).policies.find(row=>row.id===policy)!;
  };
  try {
    const response=await handleWorkerFetch(new Request("http://localhost:5174/api/settings/run-now",{method:"POST",headers:{Authorization:`Bearer ${await fixture.token("luvdia-pending-admin")}`,"Idempotency-Key":"correction-native-retention"}}),fixture.runtime);
    expect(response.status).toBe(202);const accepted=await response.json() as {runId:string};
    while(messages.length && (messages[0] as {phase?:string}).phase!=="match") await consume(messages.shift());
    expect(messages.length).toBeGreaterThan(0);
    const id=await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='schedules.chzzk_scan'").first<string>("operation_id");expect(id).not.toBeNull();
    const operationId=id!,operation=await routeTarget.exportOperation(plan.id,operationId);
    expect(operation.outcome).toBeNull();expect(await count()).toEqual({requests:4,attempts:2});
    clock.mockReturnValue(started+31*day);
    expect((await status()).prunableRows).toBe(0);expect(await readDueDataRetentionPolicyIds(fixture.runtime)).not.toContain(policy);
    expect(await runDataRetentionPolicyPrune(fixture.runtime,policy)).toMatchObject({deletedRows:0,hasMore:false});
    clock.mockReturnValue(started+1000);
    while(messages.length && (messages[0] as {phase?:string}).phase!=="finalize") await consume(messages.shift());
    expect(messages.length).toBeGreaterThan(0);expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
    clock.mockReturnValue(started+31*day);expect((await status()).prunableRows).toBe(0);
    clock.mockReturnValue(started+2000);
    while(messages.length) await consume(messages.shift());
    expect((await new D1ScheduledJobRepository(targetDb).readRun(accepted.runId))?.status).toBe("succeeded");
    const terminal=await routeTarget.exportOperation(plan.id,operationId);expect(terminal.outcome?.outcome).toBe("committed");
    const controls=await targetDb.prepare("SELECT parent_json,completion_json,finalizer_json FROM content_transition_chzzk_stages WHERE operation_id=?").bind(operationId).first();
    const rows=(await targetDb.prepare("SELECT request_key,request_hash,response_hash,settled_at FROM content_transition_chzzk_requests ORDER BY request_key").all<{request_key:string;request_hash:string;response_hash:string|null;settled_at:number|null}>()).results;
    expect(rows.every(row=>row.settled_at===started+2000)).toBe(true);
    for(const row of rows.filter(row=>row.response_hash)) expect(terminal.outcome?.chzzkScan?.reads).toContainEqual({requestKey:row.request_key,requestHash:row.request_hash,responseHash:row.response_hash});
    // Old native records have no trustworthy whole-completion timestamp. A real
    // terminal Queue reconciliation must establish a new one before 30 days.
    await targetDb.prepare("UPDATE content_transition_chzzk_requests SET settled_at=NULL,settled_outcome_digest=NULL,disposition=NULL").run();
    clock.mockReturnValue(started+40*day);expect((await status()).prunableRows).toBe(0);
    const retry={type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:terminal.payloadHash};
    await consume(retry);
    expect(await targetDb.prepare("SELECT min(settled_at) n FROM content_transition_chzzk_requests").first("n")).toBe(started+40*day);
    clock.mockReturnValue(started+70*day);expect((await status()).prunableRows).toBe(0);
    clock.mockReturnValue(started+70*day+1);expect((await status()).prunableRows).toBe(2);expect(await readDueDataRetentionPolicyIds(fixture.runtime)).toContain(policy);
    const writes:number[]=[];
    const measured=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,key){
      if(key==="bind") return (...values:unknown[])=>measured(target.bind(...values));
      if(key==="all") return async()=>{const result=await target.all();writes.push(result.meta.rows_written);return result;};
      const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
    }});
    const measuredDb=new Proxy(targetDb,{get(target,key){if(key==="prepare") return (sql:string)=>sql.includes("WITH candidates")?measured(target.prepare(sql)):target.prepare(sql);const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
    const before=await count(),first=await runDataRetentionPolicyPrune({...fixture.runtime,otw_db:measuredDb},policy,3),after=await count();
    expect(first.deletedRows).toBeGreaterThan(0);expect(first.hasMore).toBe(true);
    expect(before.requests!+before.attempts!-after.requests!-after.attempts!).toBeLessThanOrEqual(3);
    expect(writes).toHaveLength(1);expect(writes[0]).toBeLessThanOrEqual(3);
    console.info("correction native retention bounded readback",{before,after,deletedRows:first.deletedRows,hasMore:first.hasMore,rowsWritten:writes[0]});
    expect(first.deletedRows).toBe(before.requests!-after.requests!);
    const prune=await handleWorkerFetch(new Request("http://localhost:5174/api/operations/data-retention/prune?dryRun=false",{method:"POST",headers:{Authorization:`Bearer ${await fixture.token("luvdia-pending-admin")}`,"Idempotency-Key":"correction-actual-prune"}}),fixture.runtime);
    expect(prune.status).toBe(202);const pruning=await prune.json() as {runId:string};
    while(messages.length) await consume(messages.shift());
    expect((await new D1ScheduledJobRepository(targetDb).readRun(pruning.runId))?.status).toBe("succeeded");
    const policyResult=await targetDb.prepare("SELECT result_json FROM scheduled_job_items WHERE run_id=? AND target_key=?").bind(pruning.runId,policy).first<string>("result_json");
    expect(JSON.parse(policyResult!)).toMatchObject({deletedRows:2-first.deletedRows,hasMore:false});
    expect(await count()).toEqual({requests:2,attempts:0});expect((await status()).prunableRows).toBe(0);expect(await readDueDataRetentionPolicyIds(fixture.runtime)).not.toContain(policy);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests WHERE response_json IS NOT NULL OR attempt<>0").first("n")).toBe(0);
    expect(await runDataRetentionPolicyPrune(fixture.runtime,policy)).toMatchObject({deletedRows:0,hasMore:false});
    await consume(retry);
    await expect(routeTarget.readExecutableCommand(plan.id,operationId)).rejects.toThrow(/terminal disposition/);
    // The normal retention run also removed old scheduled items. A late direct
    // re-admission is rejected by the original parent guard without resurrection.
    await expect(routeTarget.admitChzzkScan({...chzzkScanAdmission(operationId),idempotencyKey:terminal.idempotencyKey,payload:terminal.payload})).rejects.toThrow(/malformed JSON/);
    const retainedCommand=parseChzzkScanCommand(terminal.payload);expect(retainedCommand).not.toBeNull();
    await targetDb.batch(await D1ChzzkReadJournal.registration(targetDb,terminal,retainedCommand!));
    expect(await count()).toEqual({requests:2,attempts:0});expect(video).toHaveBeenCalledOnce();expect(live).toHaveBeenCalledOnce();
    const journal=new D1ChzzkReadJournal(targetDb,"luvdia","luvdia-db"),used=rows.find(row=>row.response_hash)!;
    await expect(journal.claimLocal(plan.id,operationId,terminal.payloadHash,used.request_key,Date.now())).rejects.toThrow(/registered/);
    await expect(journal.complete(plan.id,operationId,terminal.payloadHash,used.request_key,used.request_hash,1,"late-original",{kind:"videos",videos:[]},Date.now())).rejects.toThrow(/registered/);
    expect(await routeTarget.exportOperation(plan.id,operationId)).toEqual(terminal);
    expect(await targetDb.prepare("SELECT parent_json,completion_json,finalizer_json FROM content_transition_chzzk_stages WHERE operation_id=?").bind(operationId).first()).toEqual(controls);
    expect(await targetDb.prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:retention-native'").first("n")).toBe(1);
  } finally {
    video.mockRestore();live.mockRestore();clock.mockRestore();fixture.close();
    if(prior===null) await targetDb.prepare("DELETE FROM settings WHERE key='auto_update_enabled'").run();else await targetDb.prepare("UPDATE settings SET value=? WHERE key='auto_update_enabled'").bind(prior).run();
    await targetDb.prepare("DELETE FROM auto_update_runs WHERE actor_id='luvdia-pending-admin' AND started_at=?").bind(started).run();
  }
});
it.each(["source-transfer","native-uncertain","native-pending"] as const)("review corrections hold original transfer and unresolved native CHZZK reads (%s)",async(scenario)=>{
  const started=Date.parse("2026-10-15T13:00:00+09:00"),channel="a".repeat(32),native=scenario!=="source-transfer",policy="native-chzzk-read-detail";
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=NULL"),sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`)]);
  const {routeSource,routeTarget}=await routeControls();
  if(native) {await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);}
  const db=native?targetDb:sourceDb,repository=native?routeTarget:routeSource,site=native?"luvdia":"otw",journal=new D1ChzzkReadJournal(db,site,`${site}-db`);
  const input=chzzkScanAdmission("chzzk-scan:held-read:move"),admitted=await repository.admitChzzkScan({...input,payload:{...input.payload,startedAt:started}});
  const key=`videos:${channel}:0`,claim=scenario==="source-transfer"?null:await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,started-30001);
  const provider:ChzzkVideoCatalog={fetchVideos:vi.fn(),fetchVideosBatch:vi.fn().mockResolvedValue([{channelId:channel,content:{data:[]}}]),fetchLiveStatus:vi.fn().mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}})};
  const writer=new D1ChzzkScanTransitionWriter(repository,journal,site,async()=>{throw new Error("Unexpected peer provider read");}),clock=vi.spyOn(Date,"now").mockReturnValue(started);
  try {
    if(scenario!=="native-pending") {
      await scanAndPersistRecentChzzkObservations(getDb({otw_db:db} as Env),3,[channel],db,provider,writer,"held-read");
      expect((await repository.exportOperation(plan.id,admitted.operationId)).outcome?.outcome).toBe("committed");
    }
    if(!native) {
      const baseline=await routeSource.describeBaseline(plan.id);
      await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,"held-read-fence",Date.now()+60000),Date.now());
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
      for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    }
    const snapshot=(await db.prepare("SELECT * FROM content_transition_chzzk_requests ORDER BY request_key").all()).results;
    clock.mockReturnValue(started+90*86400000);
    for(const owningDb of [sourceDb,targetDb]) {
      const runtime={...bindings,...siteEnv(owningDb===sourceDb?"otw":"luvdia"),otw_db:owningDb} as Env;
      expect((await getDataRetentionStatus(runtime)).policies.find(row=>row.id===policy)?.prunableRows).toBe(0);
      expect(await readDueDataRetentionPolicyIds(runtime)).not.toContain(policy);
      expect(await runDataRetentionPolicyPrune(runtime,policy)).toMatchObject({deletedRows:0,hasMore:false});
    }
    expect((await db.prepare("SELECT * FROM content_transition_chzzk_requests ORDER BY request_key").all()).results).toEqual(snapshot);
    if(scenario==="native-uncertain") {
      expect(await db.prepare("SELECT state FROM content_transition_chzzk_attempts WHERE attempt=1 AND request_key=?").bind(key).first("state")).toBe("uncertain");
      await repository.reconcileNativeChzzkRetention(plan.id,admitted.operationId);
      expect(await db.prepare("SELECT count(*) n FROM content_transition_chzzk_requests WHERE settled_at IS NOT NULL").first("n")).toBe(0);
      await journal.complete(plan.id,admitted.operationId,admitted.payloadHash,key,claim!.receipt.requestHash,1,claim!.receipt.claim!,{kind:"videos",videos:[]},Date.now());
      await repository.reconcileNativeChzzkRetention(plan.id,admitted.operationId);
      expect(await db.prepare("SELECT min(settled_at) n FROM content_transition_chzzk_requests").first("n")).toBe(Date.now());
    }
  } finally {clock.mockRestore();}
});
it.each(["local","after_scan","during_child","lost_reply","target_conflict","after_finalizer","partial_local","partial_transfer","failed_local","failed_transfer"] as const)("task4.4 executes the real manual run-now original scan children and once-only finalizer (%s)",async(scenario)=>{
  const transfer=!["local","partial_local","failed_local"].includes(scenario),partial=scenario.startsWith("partial_"),failed=scenario.startsWith("failed_"),incomplete=partial||failed;
  const started=Date.parse("2026-10-15T13:00:00+09:00"),channel="a".repeat(32);
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=NULL"),sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`)]);
  await sourceDb.batch([sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Private unrelated member')"),sourceDb.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,title,status,action_type,candidate_kind) VALUES(90,'Private unrelated member','2026-10-14','Obsolete unrelated holiday','휴방','create','holiday_suggestion')")]);
  if(partial) await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=90").bind(`https://chzzk.naver.com/${"b".repeat(32)}`).run();
  if(incomplete) await sourceDb.batch([
    sourceDb.prepare("INSERT INTO schedule_broadcast_observations(vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at) VALUES('chzzk:manual-original',1,?,'Retained valid original observation',?,?,3600,?,?)").bind(channel,started-86400000,started-86400000+3600000,started-90000000,started-90000000),
    sourceDb.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,title,status,action_type,candidate_kind) VALUES(1,'Selected','2026-10-14','Old selected holiday','휴방','create','holiday_suggestion')"),
  ]);
  const prior=await sourceDb.prepare("SELECT value FROM settings WHERE key='auto_update_enabled'").first<string>("value");
  const priorLastRun=await sourceDb.prepare("SELECT value FROM settings WHERE key='auto_update_last_run'").first<string>("value");
  await sourceDb.prepare("INSERT INTO settings(key,value) VALUES('auto_update_enabled','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  if(priorLastRun===null) await sourceDb.prepare("INSERT INTO settings(key,value) VALUES('auto_update_last_run','0')").run();
  const {routeSource,routeTarget}=await routeControls([
    ...(prior===null?[{table:"settings" as const,key:'["auto_update_enabled"]',disposition:"exclude" as const,reason:"Task-owned local manual-run setting"}]:[]),
    ...(priorLastRun===null?[{table:"settings" as const,key:'["auto_update_last_run"]',disposition:"exclude" as const,reason:"Task-owned local finalizer cadence setting"}]:[]),
  ]);
  const fixture=await pendingAdminFixture("otw"),clock=vi.spyOn(Date,"now").mockReturnValue(started);
  const messages:unknown[]=[];fixture.runtime.OTW_OPS_CONTROL_QUEUE={send:async(body:unknown)=>{messages.push(body);}} as unknown as Queue;
  fixture.runtime.OTW_OPS_BACKGROUND_QUEUE={send:async(body:unknown)=>{messages.push(body);}} as unknown as Queue;
  fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  let lostReply=false;
  if(scenario==="lost_reply") fixture.runtime.CONTENT_TRANSITION_PEER={
    describe:(id:string)=>relayBindings.TARGET_RELAY.describe(id),receiveOperation:(id:string,operationId:string,hash:string)=>relayBindings.TARGET_RELAY.receiveOperation(id,operationId,hash),
    finishChzzkParent:(id:string,operationId:string)=>relayBindings.TARGET_RELAY.finishChzzkParent(id,operationId),
    executeChzzkChild:async(id:string,operationId:string,childKey:string)=>{const result=await relayBindings.TARGET_RELAY.executeChzzkChild(id,operationId,childKey);if(!lostReply){lostReply=true;throw new Error("Lost committed original child reply");}return result;},
  } as unknown as Env["CONTENT_TRANSITION_PEER"];
  const createWorkflow=vi.fn();fixture.runtime.SCHEDULED_OPERATIONS_WORKFLOW={create:createWorkflow} as unknown as NonNullable<Env["SCHEDULED_OPERATIONS_WORKFLOW"]>;
  const video=vi.spyOn(chzzkVideoCatalog,"fetchVideosBatch").mockImplementation(async(requests)=>{
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_stages WHERE json_extract(parent_json,'$.kind')='scheduled'").first("n")).toBe(1);
    const requested=requests[0].channelId;
    return [{channelId:requested,content:{data:[{videoId:requested===channel?"manual-original":"ordinary-original",videoTitle:"Original manual candidate",publishDateAt:requested===channel&&incomplete?NaN:started-86400000,duration:3600,thumbnailImageUrl:null}]}}] as never;
  });
  const live=vi.spyOn(chzzkVideoCatalog,"fetchLiveStatus").mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}} as never);
  try {
    const request=()=>handleWorkerFetch(new Request("http://localhost:5173/api/settings/run-now",{method:"POST",headers:{Authorization:"", "Idempotency-Key":"actual-manual-original"}}),fixture.runtime);
    const token=await fixture.token("otw-pending-admin");
    const idempotencyKey=`actual-manual-original:${scenario}`;
    const sendRequest=()=>handleWorkerFetch(new Request("http://localhost:5173/api/settings/run-now",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Idempotency-Key":idempotencyKey}}),fixture.runtime);
    expect((await request()).status).toBe(401);
    const response=await sendRequest();expect(response.status).toBe(202);const accepted=await response.json() as {runId:string};
    let cutoverDone=false,recovered=false;
    const cutover=async()=>{
      cutoverDone=true;
      await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,"manual-fence-readiness",started+60000),started);
      const baseline=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
      for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      const operation=(await routeSource.exportFrozenOperations(plan.id))[0];await relayBindings.TARGET_RELAY.receiveChzzkStage(plan.id,operation.operationId,operation.payloadHash);
      if(scenario==="during_child") {
        const child=(await routeTarget.readChzzkScanStage(plan.id,operation.operationId))!.targets[0],original=await routeSource.exportChzzkChild(plan.id,operation.operationId,child.key);
        expect(original.batches).toHaveLength(1);
        const forged=structuredClone(original);(forged.input as {members:Array<{uid:number|null}>}).members[0].uid=null;
        await expect(routeTarget.receiveChzzkChild(forged)).rejects.toThrow(/input scope/);
        const privateRow=structuredClone(original);privateRow.batches[0].results[0].results[0].actor_id="unrelated-source-actor";
        await expect(routeTarget.receiveChzzkChild(privateRow)).rejects.toThrow(/returned row/);
        await expect(routeTarget.receiveChzzkChild({...original,payloadHash:"wrong-hash"})).rejects.toThrow(/receiver/);
        const wrongRole=await (async()=>{try {await relayBindings.SOURCE_RELAY.executeChzzkChild(plan.id,operation.operationId,child.key);return null;} catch(error) {return String(error);}})();
        expect(wrongRole).toContain("Wrong relay role");
        expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_chzzk_batches").first("n")).toBe(0);
        expect(await targetDb.prepare("SELECT input_json FROM content_transition_chzzk_children WHERE child_key=?").bind(child.key).first("input_json")).toBeNull();
      }
      if(scenario==="target_conflict") {
        const stage=(await routeTarget.readChzzkScanStage(plan.id,operation.operationId))!;
        await routeTarget.prepareChzzkMatchInput(plan.id,operation.operationId,stage.targets[0].key);
        const writer=new D1ScheduleWriteRepository(targetDb,new D1ScheduleTransitionWriter(routeTarget,"luvdia"));
        await writer.saveWithConflictResolution(parseScheduleInput({member_uid:1,date:"2026-10-14",start_time:"12:00",title:"Newer target decision",status:"방송"},{requireId:false})!,{actorId:"target-owning-fixture",actorName:null,actorIp:null});
      }
    };
    for(let attempts=0;messages.length && attempts<12;attempts++) {
      const body=messages.shift(),message={body,ack:vi.fn(),retry:vi.fn()};
      if(scenario==="lost_reply" && !lostReply && (body as {phase?:string}).phase==="match") await sourceDb.prepare("UPDATE scheduled_job_items SET attempts=3 WHERE id=?").bind((body as {itemId:string}).itemId).run();
      if(scenario==="during_child" && !cutoverDone && (body as {phase?:string}).phase==="match") fixture.runtime.otw_db=new Proxy(sourceDb,{get(target,key){
        if(key==="batch") return async(statements:D1PreparedStatement[])=>{const result=await target.batch(statements);if(!cutoverDone) await cutover();return result;};
        const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
      }});
      await handleWorkerQueue({queue:(body as {messageType?:string}).messageType==="scheduled_job_control"?"otw-ops-control":"otw-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
      expect(message.retry).not.toHaveBeenCalled();expect(message.ack).toHaveBeenCalledOnce();
      if(["after_scan","lost_reply","target_conflict","partial_transfer","failed_transfer"].includes(scenario) && (body as {phase?:string}).phase==="scan") await cutover();
      if((scenario==="during_child" && cutoverDone || scenario==="lost_reply" && lostReply) && !recovered) {
        recovered=true;fixture.runtime.otw_db=sourceDb;
        if(scenario==="lost_reply") {
          const dlq={body,ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:"otw-dead-letter",messages:[dlq]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(dlq.ack).toHaveBeenCalledOnce();
          expect(await sourceDb.prepare("SELECT status FROM scheduled_job_items WHERE id=?").bind((body as {itemId:string}).itemId).first("status")).toBe("queued");
        }
        clock.mockReturnValue(started+60001);await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.UTC(2026,9,15,4,3)} as ScheduledController,fixture.runtime);expect(createWorkflow).not.toHaveBeenCalled();
      }
    }
    expect(messages).toHaveLength(0);
    if(scenario==="after_finalizer") {
      await cutover();
      const targetRuntime={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY,SCHEDULED_OPERATIONS_WORKFLOW:{create:createWorkflow}} as unknown as Env;
      await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.UTC(2026,9,15,4,3)} as ScheduledController,targetRuntime);expect(createWorkflow).not.toHaveBeenCalled();
    }
    const jobs=new D1ScheduledJobRepository(sourceDb),run=await jobs.readRun(accepted.runId);expect(run,JSON.stringify({items:(await sourceDb.prepare("SELECT phase,status,last_error FROM scheduled_job_items WHERE run_id=?").bind(accepted.runId).all()).results,batches:(await targetDb.prepare("SELECT batch_key,result_json FROM content_transition_chzzk_batches").all()).results})).toMatchObject({source:"manual",status:failed?"failed":scenario==="target_conflict"||partial?"partial":"succeeded",idempotency_key:idempotencyKey});
    expect(await (transfer?targetDb:sourceDb).prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:manual-original'").first("n")).toBe(scenario==="target_conflict"||failed?0:1);
    if(incomplete) {
      expect(await (transfer?targetDb:sourceDb).prepare("SELECT count(*) n FROM pending_schedules WHERE member_uid=1 AND candidate_kind='holiday_suggestion'").first("n")).toBe(failed?1:0);
      expect(await sourceDb.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=? AND phase='match'").bind(run!.id).first("n")).toBe(failed?0:2);
      if(partial) expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules WHERE member_uid=90 AND vod_id='chzzk:ordinary-original'").first("n")).toBe(1);
    }
    if(scenario==="target_conflict") {
      expect(await targetDb.prepare("SELECT title FROM schedules WHERE member_uid=1").first("title")).toBe("Newer target decision");
      expect(await sourceDb.prepare("SELECT status FROM auto_update_runs WHERE actor_id='otw-pending-admin' AND started_at=?").bind(started).first("status")).toBe("failed");
    }
    expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules WHERE member_uid=90").first("n")).toBe(partial||failed?1:0);
    if(transfer) expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules WHERE member_uid=1").first("n")).toBe(incomplete||["during_child","after_finalizer"].includes(scenario)?1:0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM auto_update_runs WHERE actor_id='otw-pending-admin' AND source='manual' AND started_at=?").bind(started).first("n")).toBe(1);
    const finalizerId=await sourceDb.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND phase='finalize'").bind(run!.id).first<string>("id");
    await new ScheduledJobExecutor(fixture.runtime,jobs).execute((await jobs.readItem(finalizerId!))!);
    expect(await sourceDb.prepare("SELECT count(*) n FROM auto_update_runs WHERE actor_id='otw-pending-admin' AND started_at=?").bind(started).first("n")).toBe(1);
    expect((await sendRequest()).status).toBe(202);expect(video).toHaveBeenCalledTimes(partial?2:1);expect(live).toHaveBeenCalledTimes(partial?2:1);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE outcome_json IS NULL").first("n")).toBe(0);
    if(transfer) {
      const operation=(await routeSource.exportFrozenOperations(plan.id))[0],stage=(await routeTarget.readChzzkScanStage(plan.id,operation.operationId))!;
      const child=stage.targets[0],actual=(await routeTarget.readChzzkChildResult(plan.id,operation.operationId,child.key))!;
      const forged={...actual,result:{...actual.result,updated:actual.result.updated+1}};
      await expect(routeSource.receiveChzzkChildResult(plan.id,operation.operationId,child.key,forged)).rejects.toThrow(/Immutable|Invalid/);
      await expect(routeTarget.recordChzzkChildResult(plan.id,operation.operationId,child.key,forged)).rejects.toThrow(/Immutable|Invalid/);
      expect(await routeTarget.readChzzkChildResult(plan.id,operation.operationId,child.key)).toEqual(actual);
      await routeTarget.admit({...admission("manual-native-backlog"),subject:{table:"schedules",key:"[319]"},payload:{...admission("manual-native-backlog").payload,input:{...admission("manual-native-backlog").payload.input,id:319}}});
      await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);
      expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");
      expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE source_seq IS NULL AND outcome_json IS NULL").first("n")).toBe(1);
    }
  } finally {
    video.mockRestore();live.mockRestore();clock.mockRestore();fixture.close();
    if(prior===null) await sourceDb.prepare("DELETE FROM settings WHERE key='auto_update_enabled'").run();
    else await sourceDb.prepare("UPDATE settings SET value=? WHERE key='auto_update_enabled'").bind(prior).run();
    if(priorLastRun===null) await sourceDb.prepare("DELETE FROM settings WHERE key='auto_update_last_run'").run();
    else await sourceDb.prepare("UPDATE settings SET value=? WHERE key='auto_update_last_run'").bind(priorLastRun).run();
    await sourceDb.prepare("DELETE FROM auto_update_runs WHERE actor_id='otw-pending-admin' AND started_at=?").bind(started).run();
  }
});
it("task4.4 executes Cron admission through the original Workflow method and scheduled finalizer",async()=>{
  const started=Date.parse("2026-10-15T13:00:00+09:00"),scheduledFor=started+180000,channel="a".repeat(32),keys=["auto_update_enabled","auto_update_last_run","scheduled_v2_schedule_auto_update_enabled"];
  const previous=await Promise.all(keys.map(async key=>({key,value:await sourceDb.prepare("SELECT value FROM settings WHERE key=?").bind(key).first<string>("value")})));
  await sourceDb.batch(keys.map(key=>sourceDb.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,key==="auto_update_last_run"?"0":"true")));
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=NULL"),sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`)]);
  const {routeSource}=await routeControls(previous.filter(row=>row.value===null).map(row=>({table:"settings",key:JSON.stringify([row.key]),disposition:"exclude" as const,reason:"Task-owned isolated scheduled admission setting"})));
  const messages:unknown[]=[],runtime={...bindings,...siteEnv("otw"),otw_db:sourceDb,SITE_ASSET_BUCKET_NAME:"otw-bucket",OTW_OPS_BACKGROUND_QUEUE:{send:async(body:unknown)=>{messages.push(body);}}} as unknown as Env;
  const clock=vi.spyOn(Date,"now").mockReturnValue(started),video=vi.spyOn(chzzkVideoCatalog,"fetchVideosBatch").mockResolvedValue([{channelId:channel,content:{data:[{videoId:"scheduled-original",videoTitle:"Actual scheduled candidate",publishDateAt:started-86400000,duration:3600,thumbnailImageUrl:null}]}}] as never),live=vi.spyOn(chzzkVideoCatalog,"fetchLiveStatus").mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}} as never);
  const steps:string[]=[];
  // The isolated test runtime cannot construct the platform Workflow context.
  // Execute the real entry method with its actual environment and step callback;
  // this verifies orchestration, not Cloudflare's persisted Workflow engine.
  const create=vi.fn(async({params}:{params:ScheduledOperationsWorkflowParams})=>ScheduledOperationsWorkflow.prototype.run.call({env:runtime} as unknown as ScheduledOperationsWorkflow,{payload:params} as WorkflowEvent<ScheduledOperationsWorkflowParams>,{do:async(name:string,_options:unknown,execute:()=>Promise<unknown>)=>{steps.push(name);return execute();}} as unknown as WorkflowStep));
  runtime.SCHEDULED_OPERATIONS_WORKFLOW={create} as unknown as NonNullable<Env["SCHEDULED_OPERATIONS_WORKFLOW"]>;
  try {
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:scheduledFor} as ScheduledController,runtime);
    expect(create).toHaveBeenCalledExactlyOnceWith({params:{jobType:"schedule_auto_update",scheduledFor}});expect(steps).toEqual(["coordinate-schedule_auto_update"]);
    for(let n=0;messages.length && n<8;n++) {const message={body:messages.shift(),ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:"otw-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,runtime);expect(message.retry).not.toHaveBeenCalled();expect(message.ack).toHaveBeenCalledOnce();}
    expect(messages).toHaveLength(0);
    const run=await sourceDb.prepare("SELECT id,source,status,actor_id FROM scheduled_job_runs WHERE job_type='schedule_auto_update' AND source='scheduled' AND scheduled_for=?").bind(scheduledFor).first<{id:string;source:string;status:string;actor_id:string|null}>();
    expect(run).toMatchObject({source:"scheduled",status:"succeeded",actor_id:null});
    expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:scheduled-original'").first("n")).toBe(1);
    expect(await sourceDb.prepare("SELECT count(*) n FROM auto_update_runs WHERE source='scheduled' AND actor_id IS NULL AND started_at=?").bind(started).first("n")).toBe(1);
    const original=(await routeSource.chzzkRunContinuations(run!.id))[0];expect((await routeSource.exportOperation(original.transitionId,original.operationId)).outcome?.outcome).toBe("committed");
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:scheduledFor} as ScheduledController,runtime);expect(create).toHaveBeenCalledOnce();expect(video).toHaveBeenCalledOnce();expect(live).toHaveBeenCalledOnce();
  } finally {
    clock.mockRestore();video.mockRestore();live.mockRestore();
    for(const row of previous) if(row.value===null) await sourceDb.prepare("DELETE FROM settings WHERE key=?").bind(row.key).run();else await sourceDb.prepare("UPDATE settings SET value=? WHERE key=?").bind(row.value,row.key).run();
    await sourceDb.prepare("DELETE FROM auto_update_runs WHERE source='scheduled' AND actor_id IS NULL AND started_at=?").bind(started).run();
  }
});
it("task4.4 executes the bound native Workflow engine and native Queue through original whole completion",async()=>{
  const native=env as typeof env & {NATIVE_SCHEDULED_WORKFLOW:Workflow<ScheduledOperationsWorkflowParams>;NATIVE_WORKFLOW_PROVIDER:Fetcher};
  const introspector=await introspectWorkflow(native.NATIVE_SCHEDULED_WORKFLOW);
  const started=Date.now(),scheduledFor=Math.floor(started/3600000)*3600000+180000,channel="e".repeat(32);
  const cacheKey=`vods:${WORKER_CACHE_POLICY.chzzk.vods.version}:${channel}:0:5`;
  expect(await sourceDb.prepare("SELECT key FROM chzzk_api_cache WHERE key=?").bind(cacheKey).first()).toBeNull();
  const keys=["auto_update_enabled","auto_update_last_run","scheduled_v2_schedule_auto_update_enabled"];
  const previous=await Promise.all(keys.map(async key=>({key,value:await sourceDb.prepare("SELECT value FROM settings WHERE key=?").bind(key).first<string>("value")})));
  await sourceDb.batch(keys.map(key=>sourceDb.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,key==="auto_update_last_run"?"0":"true")));
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=NULL"),sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`)]);
  const {routeSource}=await routeControls(previous.filter(row=>row.value===null).map(row=>({table:"settings",key:JSON.stringify([row.key]),disposition:"exclude" as const,reason:"Task-owned native Workflow fixture admission setting"})));
  const runtime={...bindings,...siteEnv("otw"),otw_db:sourceDb,SITE_ASSET_BUCKET_NAME:"otw-bucket",SCHEDULED_OPERATIONS_WORKFLOW:native.NATIVE_SCHEDULED_WORKFLOW} as unknown as Env;
  try {
    // Original Cron admission uses the real binding. The bound original Worker
    // creates its durable step, sends its native Queue, and consumes it itself.
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:scheduledFor} as ScheduledController,runtime);
    const instances=await introspector.get();expect(instances).toHaveLength(1);
    await instances[0].waitForStatus("complete");
    const output=await instances[0].getOutput() as {id:string;source:string};
    expect(output).toMatchObject({source:"scheduled"});
    await expect.poll(()=>sourceDb.prepare("SELECT status FROM scheduled_job_runs WHERE id=?").bind(output.id).first("status"),{timeout:20000,interval:100}).toBe("succeeded");
    expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:native-workflow-original'").first("n")).toBe(1);
    const items=(await sourceDb.prepare("SELECT phase,status,result_json FROM scheduled_job_items WHERE run_id=? ORDER BY phase").bind(output.id).all()).results;
    expect(items.length).toBeGreaterThanOrEqual(3);expect(items.every(item=>item.status==="succeeded" && item.result_json!==null)).toBe(true);
    expect(await sourceDb.prepare("SELECT count(*) n FROM auto_update_runs WHERE source='scheduled' AND started_at>=?").bind(started).first("n")).toBe(1);
    const original=(await routeSource.chzzkRunContinuations(output.id))[0];
    const terminal=await routeSource.exportOperation(original.transitionId,original.operationId);
    expect(terminal.outcome?.outcome).toBe("committed");
    const calls=await (await native.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    // The actual engine clock is not mocked. Original holiday assessment calls
    // live only at/after 09:00 KST; earlier Cron runs legitimately read VOD only.
    const scanStarted=Number(terminal.payload.startedAt);
    expect(calls).toHaveLength(new Date(scanStarted+9*3600000).getUTCHours()>=9?2:1);
    expect(calls[0]).toBe(`GET https://api.chzzk.naver.com/service/v1/channels/${channel}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=5`);
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:scheduledFor} as ScheduledController,runtime);
    expect(await introspector.get()).toHaveLength(1);
    expect(await (await native.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json()).toEqual(calls);
  } finally {
    await introspector.dispose();
    // The real adapter writes its own D1 response cache. Remove only this
    // fixture's exact request key; it is not a manifest classification for the
    // next independent transition and cannot be silently excluded there.
    await sourceDb.prepare("DELETE FROM chzzk_api_cache WHERE key=?").bind(cacheKey).run();
    for(const row of previous) if(row.value===null) await sourceDb.prepare("DELETE FROM settings WHERE key=?").bind(row.key).run();else await sourceDb.prepare("UPDATE settings SET value=? WHERE key=?").bind(row.value,row.key).run();
    await sourceDb.prepare("DELETE FROM auto_update_runs WHERE source='scheduled' AND started_at>=?").bind(started).run();
  }
},60000);
it.each(["source","source_shared","source_dictionary","source_fence_race","batch_failure","audit_failure","native","native_conflict","native_inline","native_inline_phantom","native_archived_artist","native_invalid_artist","native_stale"] as const)("task4.4 preserves original catalog song update authority and batch (%s)",async scenario=>{
  const native=scenario.startsWith("native"),shared=scenario==="source_shared";
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('owning-song','owning-song','Original','original','owning-song',0,1,1)"),
    sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('song-owner',1,'person','Selected Singer','selected singer','song-owner',1,1),('song-other',NULL,'person','Other Singer','other singer','song-other',1,1)"),
    sourceDb.prepare("INSERT INTO music_song_original_artists(song_id,entity_id,credit_order,is_primary) VALUES('owning-song','song-owner',0,1)"),
    sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('song-selected','owning-song','song-selected','cover','official_video','solo',1,1)"),
    sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('song-selected','song-owner','vocal',0,'Selected Singer')"),
    ...(shared?[
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('song-unrelated','owning-song','song-unrelated','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('song-unrelated','song-other','vocal',0,'Other Singer')"),
    ]:[]),
  ]);
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture(native?"luvdia":"otw");
  fixture.runtime.YOUTUBE_API_KEY=""; // Pure D1 song edit never calls metadata/provider IO.
  const db=native?targetDb:sourceDb,key="actual-song-editor-request-001";
  const inline=scenario.startsWith("native_inline");
  const body={id:"owning-song",expectedVersion:scenario==="native_stale"?1:0,slug:"owning-song",title:"Saved song",isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:"unknown",aliases:[{alias:"Saved alias",locale:null,aliasKind:null}],originalArtists:[{subject:inline?{kind:"member",memberUid:2}:{kind:"entity",entityId:scenario==="native_invalid_artist"?"missing-artist":"song-owner"},creditOrder:0,isPrimary:true}],tags:["Saved tag"]};
  const request=async(value=body,requestKey=key,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`${native?"http://localhost:5174":"http://localhost:5173"}/api/play/admin/songs`,{method:"PUT",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":requestKey},body:JSON.stringify(value)}),runtime);
  const snapshot=async(database:D1Database)=>JSON.stringify(await Promise.all(["music_songs","music_song_aliases","music_song_original_artists","music_song_tags","music_catalog_meta","music_public_read_model_meta","music_public_performance_sort_keys","music_search_terms","music_search_grams","music_search_gram_stats"].map(table=>database.prepare(`SELECT * FROM ${table}`).all().then(result=>result.results))));
  try {
    const before=await snapshot(db);
    const previousEvents=Number(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id='owning-song' AND event_type='song.updated'").first("n"));
    if(scenario==="batch_failure") await sourceDb.prepare("CREATE TRIGGER task44_song_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='song.updated' BEGIN SELECT RAISE(ABORT,'Injected original song event failure'); END").run();
    if(scenario==="audit_failure") await sourceDb.prepare("CREATE TRIGGER task44_song_audit_abort BEFORE INSERT ON admin_audit_logs BEGIN SELECT RAISE(ABORT,'Injected optional global audit failure'); END").run();
    if(scenario==="source_shared" || scenario==="source_dictionary" || scenario==="source_fence_race") {
      let racedResponse:Response|undefined;
      if(scenario==="source_fence_race") racedResponse=await request(body,key,{...fixture.runtime,otw_db:interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now()))});
      await routeTarget.installFence(scenario==="source_fence_race"?await routeSource.readSourceFence(plan.id):await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      const frozen=await routeSource.readJournal(plan.id),images=(await sourceDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results;
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_selected_roots WHERE transition_id=? AND root_table='music_songs'").bind(plan.id).first("n")).toBe(0);
      expect(images.some(row=>row.row_table==="music_songs" && row.row_key==='["owning-song"]')).toBe(true);
      expect((racedResponse??await request()).status).toBe(200);
      expect(await sourceDb.prepare("SELECT title FROM music_songs WHERE id='owning-song'").first("title")).toBe("Saved song");
      expect(await targetDb.prepare("SELECT title FROM music_songs WHERE id='owning-song'").first("title")).toBe("Original");
      expect(await routeSource.readJournal(plan.id)).toEqual(frozen);expect((await sourceDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results).toEqual(images);
      await expect(sourceDb.prepare("UPDATE music_performances SET internal_note='Forbidden selected edit' WHERE id='song-selected'").run()).rejects.toThrow(/source_root_fenced/);
      await expect(sourceDb.prepare("UPDATE music_performance_participants SET credit_name_snapshot='Forbidden selected credit' WHERE performance_id='song-selected'").run()).rejects.toThrow(/source_root_fenced/);
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;
    }
    const response=await request();
    if(scenario==="native_invalid_artist" || scenario==="native_stale") {
      expect(response.status).toBe(scenario==="native_invalid_artist"?404:409);expect(await snapshot(db)).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;
    }
    if(scenario==="batch_failure") {
      expect(response.status).toBe(422);expect(await snapshot(db)).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;
    }
    expect(response.status,await response.clone().text()).toBe(native?409:200);
    let originalResult:unknown=native?null:await response.json();
    if(native) {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});expect(await snapshot(db)).toBe(before);
      const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();expect(await snapshot(db)).toBe(before);
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      if(scenario==="native_conflict") expect((await request({...body,title:"Newer owner song"},"actual-newer-song-request-002")).status).toBe(200);
      if(scenario==="native_inline_phantom" || scenario==="native_archived_artist") {
        const create=scenario==="native_inline_phantom";
        const entityBody=create?{memberUid:2,entityKind:"person",displayName:"Newer member identity",slug:"new-member-entity"}:{id:"song-owner",expectedVersion:0,memberUid:1,entityKind:"person",displayName:"Selected Singer",slug:"song-owner",archived:true};
        const newer=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/entities",{method:create?"POST":"PUT",headers:{Authorization:`Bearer ${await fixture.token("luvdia-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":"actual-entity-concurrent-request-001"},body:JSON.stringify(entityBody)}),fixture.runtime);
        expect(newer.status,await newer.clone().text()).toBe(create?201:200);
        expect(await newer.json()).toMatchObject({data:create?{memberUid:2,displayName:"Newer member identity",version:0}:{id:"song-owner",version:1,archivedAt:expect.any(Number)}});
      }
      message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      if(scenario==="native_conflict" || scenario==="native_inline_phantom" || scenario==="native_archived_artist") {expect(await db.prepare("SELECT title FROM music_songs WHERE id='owning-song'").first("title")).toBe(scenario==="native_conflict"?"Newer owner song":"Original");expect((await routeTarget.exportOperation(plan.id,operationId)).outcome?.outcome).toBe("conflicted");return;}
      originalResult=await (await request()).json();
      expect(await sourceDb.prepare("SELECT title FROM music_songs WHERE id='owning-song'").first("title")).toBe("Original");
    }
    expect(originalResult).toMatchObject({data:{id:"owning-song",title:"Saved song",version:1,tags:["Saved tag"],aliases:[{alias:"Saved alias"}],originalArtists:[{displayName:inline?"u_lili":"Selected Singer"}]}});
    const originalOperation=(await db.prepare("SELECT operation_id FROM content_transition_operations LIMIT 1").first<string>("operation_id"))!;
    expect(JSON.stringify(await (native?routeTarget:routeSource).exportOperation(plan.id,originalOperation))).not.toContain("pending-admin");
    const eventCount=await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id='owning-song' AND event_type='song.updated'").first("n"),saved=await snapshot(db);
    expect(eventCount).toBe(previousEvents+1);expect(await (await request()).json()).toEqual(originalResult);expect(await snapshot(db)).toBe(saved);
    const conflict=await request({...body,title:"Different body"});expect(conflict.status).toBe(409);expect(await conflict.json()).toMatchObject({error:{code:"CONTENT_CONFLICT"}});
    expect((await request({...body,expectedVersion:1,title:"Later successful edit"},"actual-later-song-request-003")).status).toBe(200);
    expect(await (await request()).json()).toEqual(originalResult);
    expect(await db.prepare("SELECT title,version FROM music_songs WHERE id='owning-song'").first()).toEqual({title:"Later successful edit",version:2});
  } finally {await sourceDb.batch([sourceDb.prepare("DROP TRIGGER IF EXISTS task44_song_abort"),sourceDb.prepare("DROP TRIGGER IF EXISTS task44_song_audit_abort")]);fixture.close();}
},20000);
it.each(["source_create","source_update","source_dictionary","source_fence_race","batch_failure","native_create","native_update","native_conflict","native_constraint_create","native_transient_create"] as const)("task4.4 preserves original entity API batch and ownership (%s)",async scenario=>{
  const native=scenario.startsWith("native"),create=scenario.endsWith("create");
  await sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('entity-owner',1,'person','Original identity','original identity','entity-owner',1,1)").run();
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture(native?"luvdia":"otw");fixture.runtime.YOUTUBE_API_KEY="";
  const db=native?targetDb:sourceDb,key="actual-entity-editor-request-001";
  const body=create?{memberUid:2,entityKind:"person",displayName:"New identity",slug:"new-identity"}:{id:"entity-owner",expectedVersion:0,memberUid:1,entityKind:"person",displayName:"Saved identity",slug:"entity-owner",archived:false};
  const request=async(value:unknown=body,requestKey=key,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/entities`,{method:create?"POST":"PUT",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":requestKey},body:JSON.stringify(value)}),runtime);
  const snapshot=async(database:D1Database)=>JSON.stringify(await Promise.all(["music_entities","music_entity_aliases","music_catalog_meta","music_public_read_model_meta","music_search_terms","music_search_grams","music_search_gram_stats"].map(table=>database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results))));
  try {
    const before=await snapshot(db),previousEvents=Number(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_type='entity'").first("n"));
    if(scenario==="batch_failure") await db.prepare("CREATE TRIGGER task44_entity_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='entity.updated' BEGIN SELECT RAISE(ABORT,'Injected original entity event failure'); END").run();
    if(scenario==="source_dictionary" || scenario==="source_fence_race") {
      let result:Response|undefined;
      if(scenario==="source_fence_race") result=await request(body,key,{...fixture.runtime,otw_db:interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now()))});
      await routeTarget.installFence(scenario==="source_fence_race"?await routeSource.readSourceFence(plan.id):await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      const journal=await routeSource.readJournal(plan.id),images=(await db.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results;
      expect((result??await request()).status).toBe(200);
      expect(await db.prepare("SELECT display_name FROM music_entities WHERE id='entity-owner'").first("display_name")).toBe("Saved identity");
      expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='entity-owner'").first("display_name")).toBe("Original identity");
      expect(await routeSource.readJournal(plan.id)).toEqual(journal);expect((await db.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results).toEqual(images);return;
    }
    const response=await request();
    if(scenario==="batch_failure") {expect(response.status).toBe(422);expect(await snapshot(db)).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;}
    expect(response.status,await response.clone().text()).toBe(native?409:create?201:200);
    let result:unknown=native?null:await response.json();
    if(native) {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});expect(await snapshot(db)).toBe(before);
      const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();expect(await snapshot(db)).toBe(before);
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      if(scenario==="native_conflict") expect((await request({...body,displayName:"Newer identity"},"actual-newer-entity-request-002")).status).toBe(200);
      if(scenario==="native_constraint_create") {
        const other=await request({memberUid:null,entityKind:"person",displayName:"Independent identity",slug:"new-identity"},"actual-independent-entity-002");
        expect(other.status,await other.clone().text()).toBe(201);
        const unchanged=await snapshot(db),journal=await routeTarget.readJournal(plan.id);
        message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
        expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
        expect(await snapshot(db)).toBe(unchanged);expect(await routeTarget.readJournal(plan.id)).toEqual(journal);
        const failure=await routeTarget.readEntityReceipt(operationId);
        expect(failure?.operation.outcome).toMatchObject({outcome:"failed",sideEffectReconciled:true});
        expect(failure?.failure?.message).toContain("UNIQUE constraint failed: music_entities.slug");expect(failure?.result).toBeNull();
        expect(await db.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id=?").bind(operationId).first("n")).toBe(0);
        const retry=await request();expect(retry.status).toBe(422);expect(await retry.json()).toMatchObject({error:{code:"PLAY_ADMIN_VALIDATION_FAILED",message:"Catalog command violates an identity or relationship constraint"}});
        await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledTimes(2);
        expect(await snapshot(db)).toBe(unchanged);return;
      }
      if(scenario==="native_transient_create") {
        for(let attempt=0;attempt<3;attempt++) {
          const runtime={...fixture.runtime,otw_db:interleave(db,"batch",async()=>{throw new Error("Injected transient database runtime failure");})};
          message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,runtime);
          expect(message.retry).toHaveBeenCalledOnce();expect(message.ack).not.toHaveBeenCalled();
          expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(await snapshot(db)).toBe(before);
        }
      }
      message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      if(scenario==="native_conflict") {expect((await routeTarget.exportOperation(plan.id,operationId)).outcome?.outcome).toBe("conflicted");expect(await db.prepare("SELECT display_name FROM music_entities WHERE id='entity-owner'").first("display_name")).toBe("Newer identity");return;}
      result=await (await request()).json();
      expect(await sourceDb.prepare("SELECT display_name FROM music_entities WHERE id='entity-owner'").first("display_name")).toBe("Original identity");
    }
    expect(result).toMatchObject({data:{id:expect.any(String),memberUid:create?2:1,displayName:create?"New identity":"Saved identity",version:create?0:1}});
    expect(Number(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_type='entity'").first("n"))).toBe(previousEvents+1);
    const saved=await snapshot(db);expect(await (await request()).json()).toEqual(result);expect(await snapshot(db)).toBe(saved);
    if(create && native) {
      const actualId=await db.prepare("SELECT id FROM music_entities WHERE member_uid=2").first("id");
      const audits=(await db.prepare("SELECT resource_id FROM admin_audit_logs WHERE event_type='otw_play.entity.created'").all<{resource_id:string}>()).results;
      expect(audits.length).toBeGreaterThan(0);expect(audits.every(audit=>audit.resource_id===actualId)).toBe(true);
    }
    const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations LIMIT 1").first<string>("operation_id"))!;
    expect(JSON.stringify(await (native?routeTarget:routeSource).exportOperation(plan.id,operationId))).not.toContain("pending-admin");
    if(!native) {
      const header=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
      for(const commit of await routeSource.exportProjectedCommits(plan.id,header.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE member_uid=?").bind(create?2:1).first("display_name")).toBe(create?"New identity":"Saved identity");
    }
  } finally {await db.prepare("DROP TRIGGER IF EXISTS task44_entity_abort").run();fixture.close();}
},20000);
async function seedPublicationCatalog(initial="draft",invalid=false,db=sourceDb) {
  await db.batch([
    db.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('publication-song','publication-song','Publication song','publication song','publication-song',0,1,1)"),
    db.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('publication-singer',1,'person','Selected Singer','selected singer','publication-singer',1,1),('publication-other',NULL,'person','Other Singer','other singer','publication-other',1,1)"),
    db.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,created_at,updated_at) VALUES('publication-channel','youtube',?,'Approved music','member_music','approved',1,1,1)").bind(`UC${"p".repeat(22)}`),
    db.prepare("INSERT INTO music_media_sources(id,provider,external_id,channel_id,title,duration_seconds,availability_status,created_at,updated_at) VALUES('publication-source','youtube','PubVideo001','publication-channel','Approved video',300,'playable',1,1)"),
    ...["selected","other"].flatMap(id=>[
      db.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,publication_status,created_at,updated_at) VALUES(?,'publication-song',?,'cover','official_video','solo',?,1,1)").bind(`publication-${id}`,`publication-${id}`,initial),
      db.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES(?,?,'vocal',0,?)").bind(`publication-${id}`,id==="selected"?"publication-singer":"publication-other",id),
      ...(invalid?[]:[db.prepare("INSERT INTO music_performance_sources(performance_id,source_id,start_seconds,source_role,priority,is_primary) VALUES(?,'publication-source',?,'official',0,1)").bind(`publication-${id}`,id==="selected"?0:10)]),
    ]),
  ]);
}
it("task4.4 imports actual catalog projections and fixes the first owner revision anchor",async()=>{
  await seedPublicationCatalog();
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('import-second','import-second','Second song','second song','import-second',0,1,1)"),
    sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,publication_status,created_at,updated_at) VALUES('import-second-performance','import-second','import-second-performance','cover','official_video','solo','draft',1,1)"),
    sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('import-second-performance','publication-singer','vocal',0,'Shared singer')"),
    sourceDb.prepare("INSERT INTO music_performance_sources(performance_id,source_id,start_seconds,source_role,priority,is_primary) VALUES('import-second-performance','publication-source',20,'official',0,1)"),
    sourceDb.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,created_at,updated_at) VALUES('import-proposal','source-member','import-proposal','https://youtu.be/ImportVid01','ImportVid01','Original proposal',1,1)"),
    sourceDb.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_name_snapshot,participant_role) VALUES('import-proposal',0,'publication-singer','Singer','vocal')"),
  ]);
  const {routeSource,routeTarget}=await routeControls();
  const revision=()=>targetDb.prepare("SELECT c.revision,r.revision readModel FROM music_catalog_meta c JOIN music_public_read_model_meta r ON r.id=c.id WHERE c.id=1").first<{revision:number;readModel:number}>();
  const original=(await revision())!;expect(original.revision).toBeGreaterThan(0);expect(original.readModel).toBe(original.revision);
  expect(await targetDb.prepare("SELECT count(*) n FROM music_public_performance_sort_keys").first("n")).toBe(2);
  const boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const sourceFixture=await pendingAdminFixture("otw");sourceFixture.runtime.YOUTUBE_API_KEY="";
  try {
    const response=await handleWorkerFetch(new Request("http://localhost:5173/api/play/admin/entities",{method:"PUT",headers:{Authorization:`Bearer ${await sourceFixture.token("otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":"import-shared-entity-change"},body:JSON.stringify({id:"publication-singer",expectedVersion:0,memberUid:1,entityKind:"person",displayName:"Renamed Singer",slug:"publication-singer",archived:false})}),sourceFixture.runtime);
    expect(response.status,await response.clone().text()).toBe(200);
  } finally {sourceFixture.close();}
  const commits=await routeSource.exportProjectedCommits(plan.id,boundary);
  expect(commits.length).toBeGreaterThan(0);
  await targetDb.prepare("CREATE TRIGGER task44_import_projection_abort BEFORE INSERT ON music_search_terms WHEN NEW.normalized_term='renamed singer' BEGIN SELECT RAISE(ABORT,'import_projection_atomic'); END").run();
  try {
    await expect(routeTarget.installProjectedCommit(commits[0])).rejects.toThrow(/import_projection_atomic/);
    expect(await revision()).toEqual(original);
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='publication-singer'").first("display_name")).toBe("Selected Singer");
  } finally {await targetDb.prepare("DROP TRIGGER task44_import_projection_abort").run();}
  for(const commit of commits) await routeTarget.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT count(DISTINCT song_id) n FROM music_search_terms WHERE normalized_term='renamed singer'").first("n")).toBe(2);
  expect(await targetDb.prepare("SELECT count(*) n FROM music_search_gram_stats s WHERE song_count<>(SELECT count(*) FROM music_search_grams g WHERE g.gram_size=s.gram_size AND g.normalized_gram=s.normalized_gram)").first("n")).toBe(0);
  const installed=(await revision())!;expect(installed.revision).toBeGreaterThan(original.revision);expect(installed.readModel).toBe(installed.revision);
  for(const commit of commits) await routeTarget.installProjectedCommit(commit);
  expect(await routeTarget.materializeBaselinePage(plan.id)).toBe(0);expect(await revision()).toEqual(installed);
  const fence=await routeSource.freeze(plan.id,Date.now());expect(fence.sourceCatalogRevision).toBe(await sourceDb.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision"));
  await routeTarget.installFence(fence);
  for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
  await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  const anchor=()=>targetDb.prepare("SELECT json_extract(installation_json,'$.catalogRevisionAnchor') anchor FROM content_transitions WHERE id=?").bind(plan.id).first<number>("anchor");
  expect(await anchor()).toBe(installed.revision);
  const fixture=await pendingAdminFixture("luvdia");fixture.runtime.YOUTUBE_API_KEY="";
  try {
    const headers={Authorization:`Bearer ${await fixture.token("luvdia-pending-admin")}`,"Content-Type":"application/json"};
    const stale=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/submissions/import-proposal/approve",{method:"POST",headers,body:JSON.stringify({expectedVersion:0,expectedCatalogRevision:original.revision,song:{kind:"existing",songId:"publication-song"},channel:{kind:"existing",channelId:"publication-channel"},participants:[{subject:{kind:"member",memberUid:1},participantRole:"vocal",creditOrder:0}],releaseType:"official_video",participationType:"solo",startSeconds:0,endSeconds:30,performanceTags:[],singingCreditConfirmed:true,publish:true})}),fixture.runtime);
    expect(stale.status,await stale.clone().text()).toBe(409);expect(await stale.json()).toMatchObject({error:{code:"PLAY_ADMIN_STALE_WRITE"}});
    const newer=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/entities",{method:"PUT",headers:{...headers,"Idempotency-Key":"import-target-newer-entity"},body:JSON.stringify({id:"publication-singer",expectedVersion:1,memberUid:1,entityKind:"person",displayName:"Target Singer",slug:"publication-singer",archived:false})}),fixture.runtime);
    expect(newer.status,await newer.clone().text()).toBe(200);
    expect((await revision())!.revision).toBe(installed.revision+1);await routeTarget.activate(plan.id);expect(await anchor()).toBe(installed.revision);
  } finally {fixture.close();}
},20000);
it("task4.4 imports original performance removal with canonical projection parity",async()=>{
  await seedPublicationCatalog();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const revision=()=>targetDb.prepare("SELECT c.revision,r.revision readModel FROM music_catalog_meta c JOIN music_public_read_model_meta r ON r.id=c.id WHERE c.id=1").first<{revision:number;readModel:number}>();
  const before=(await revision())!;
  expect(await targetDb.prepare("SELECT count(*) n FROM music_search_terms WHERE normalized_term='selected singer'").first('n')).toBeGreaterThan(0);
  const fixture=await pendingAdminFixture('otw');fixture.runtime.YOUTUBE_API_KEY='';
  try {
    const removed=await handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/performances/publication-selected',{method:'DELETE',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'import-original-removal'},body:JSON.stringify({expectedVersion:0})}),fixture.runtime);
    expect(removed.status,await removed.clone().text()).toBe(200);
  } finally {fixture.close();}
  const commits=await routeSource.exportProjectedCommits(plan.id,boundary);expect(commits.length).toBeGreaterThan(0);
  for(const commit of commits) await routeTarget.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT id FROM music_performances WHERE id='publication-selected'").first('id')).toBeNull();
  expect(await targetDb.prepare("SELECT count(*) n FROM music_public_performance_sort_keys WHERE performance_id='publication-selected'").first('n')).toBe(0);
  expect(await targetDb.prepare("SELECT count(*) n FROM music_search_terms WHERE normalized_term='selected singer'").first('n')).toBe(0);
  expect(await targetDb.prepare("SELECT count(*) n FROM music_search_gram_stats s WHERE song_count<>(SELECT count(*) FROM music_search_grams g WHERE g.gram_size=s.gram_size AND g.normalized_gram=s.normalized_gram)").first('n')).toBe(0);
  const after=(await revision())!;expect(after.revision).toBeGreaterThan(before.revision);expect(after.readModel).toBe(after.revision);
  for(const commit of commits) await routeTarget.installProjectedCommit(commit);expect(await revision()).toEqual(after);
  expect(await sourceDb.prepare("SELECT id FROM music_performances WHERE id='publication-other'").first('id')).toBe('publication-other');
},20000);
async function seedVideoProposal() {
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,created_at,updated_at) VALUES('video-proposal','source-member','video-proposal','https://youtu.be/NewVideo001','NewVideo001','Original proposal',1,1)"),
    sourceDb.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_name_snapshot,participant_role) VALUES('video-proposal',0,'publication-singer','Singer','vocal')"),
  ]);
}
it.each(['known_performance','response_channel','known_update','known_approval'] as const)('task4.4 transfers the original video owning boundary (%s)',async scenario=>{
  await seedPublicationCatalog();
  const channelId=scenario!=='response_channel'?`UC${'p'.repeat(22)}`:`UC${'q'.repeat(22)}`;
  if(scenario==='known_approval') await seedVideoProposal();
  if(scenario==='response_channel') await sourceDb.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,created_at,updated_at) VALUES('video-matched','youtube',?,'Existing unmatched prerequisite','member_music','approved',1,1,1)").bind(channelId).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const sourceRevision=(await sourceDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first<number>('revision'))!;
  let gets=0,activated=false;
  const activate=async()=>{
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);activated=true;
  };
  const resolve=D1TransitionRepository.prototype.resolveVideoDependency;
  const stage=vi.spyOn(D1TransitionRepository.prototype,'resolveVideoDependency').mockImplementation(async function(this:D1TransitionRepository,...args){const result=await resolve.apply(this,args);if(scenario==='response_channel'&&!activated&&result) await activate();return result;});
  const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{
    const url=new URL(String(input));expect(url.origin+url.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');gets++;
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first('n')).toBe(1);
    if(scenario!=='response_channel') await activate();
    else {
      await expect(routeSource.freeze(plan.id,Date.now())).rejects.toThrow(/Fence/);
      expect((await routeSource.readTransition(plan.id)).phase).toBe('target_ingress_ready');
      const sourceSave=await sourceRouteSave({member_uid:1,date:'2026-10-17',title:'Source continues during unknown dependency',status:'방송'});expect(sourceSave.status,await sourceSave.clone().text()).toBe(200);
      const targetFixture=await pendingAdminFixture('luvdia');targetFixture.runtime.YOUTUBE_API_KEY='';
      try {
        const targetSave=await handleWorkerFetch(new Request('http://localhost:5174/api/schedules/save',{method:'POST',headers:{Authorization:`Bearer ${await targetFixture.token('luvdia-pending-admin')}`,'Content-Type':'application/json'},body:JSON.stringify({member_uid:2,date:'2026-10-18',title:'Target accepted during unknown dependency',status:'방송'})}),targetFixture.runtime);
        expect(targetSave.status,await targetSave.clone().text()).toBe(409);expect(await targetSave.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});
      } finally {targetFixture.close();}
      expect(await targetDb.prepare("SELECT id FROM music_channels WHERE id='video-matched'").first('id')).toBeNull();
    }
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId,channelTitle:'Source channel',title:'Frozen video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});
  });fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const createBody=scenario==='known_performance'?{songId:'publication-song',relationType:'cover',releaseType:'official_video',participationType:'solo',qualityStatus:'ok',releasedAt:null,participants:[{entityId:'publication-singer',participantRole:'vocal',creditOrder:0,creditNameSnapshot:'Selected Singer'}],sources:[{youtubeUrl:'https://youtu.be/NewVideo001',channelId:'publication-channel',startSeconds:30,endSeconds:90,sourceRole:'official',priority:0,isPrimary:true}]}:{expectedCatalogRevision:sourceRevision,youtubeUrl:'https://youtu.be/NewVideo001',startSeconds:30,endSeconds:90,song:{kind:'existing',songId:'publication-song'},channel:{kind:'confirm',channelRole:'member_music',owners:[{kind:'entity',entityId:'publication-singer'}]},participants:[{subject:{kind:'entity',entityId:'publication-singer'},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',publicationTarget:'draft'};
  const participants=[{subject:{kind:'entity',entityId:'publication-singer'},participantRole:'vocal',creditOrder:0}];
  const body=scenario==='known_update'?{id:'publication-selected',expectedVersion:0,songId:'publication-song',relationType:'cover',releaseType:'official_video',participationType:'solo',qualityStatus:'ok',releasedAt:null,participants,sources:[{youtubeUrl:'https://youtu.be/NewVideo001',channelId:'publication-channel',startSeconds:30,endSeconds:90,sourceRole:'official',priority:0,isPrimary:true}]}:scenario==='known_approval'?{expectedVersion:0,expectedCatalogRevision:sourceRevision,song:{kind:'existing',songId:'publication-song'},channel:{kind:'existing',channelId:'publication-channel'},participants,releaseType:'official_video',participationType:'solo',startSeconds:30,endSeconds:90,performanceTags:[],singingCreditConfirmed:true,publish:true}:createBody;
  const path=scenario==='known_approval'?'submissions/video-proposal/approve':scenario==='response_channel'?'catalog-entries':'performances';
  try {
    const response=await handleWorkerFetch(new Request(`http://localhost:5173/api/play/admin/${path}`,{method:scenario==='known_update'?'PUT':'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`source-video-${scenario}`},body:JSON.stringify(body)}),fixture.runtime);
    expect(response.status,await response.clone().text()).toBe(409);expect(await response.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(activated).toBe(true);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    const original=(await routeTarget.readVideoReceipt(operationId))!.command;expect(original.actor).toBeNull();
    if(scenario==='response_channel') {
      expect(await targetDb.prepare("SELECT display_name FROM music_channels WHERE id='video-matched'").first('display_name')).toBe('Existing unmatched prerequisite');
      const native=await targetDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations WHERE source_seq IS NULL AND json_extract(envelope_json,'$.codec.id')='schedules.mutate'").first<{operation_id:string;payload_hash:string}>();expect(native).toBeTruthy();
      const nativeMessage={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:native!.operation_id,payloadHash:native!.payload_hash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[nativeMessage]} as unknown as MessageBatch<unknown>,{...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});
      expect(nativeMessage.ack).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
      expect(await targetDb.prepare("SELECT title FROM schedules WHERE member_uid=2 AND date='2026-10-18'").first('title')).toBe('Target accepted during unknown dependency');
      expect((await routeTarget.videoExecutionCommand(plan.id,operationId)).sourceRevisionValid).toBe(true);
      expect((await routeTarget.videoExecutionCommand(plan.id,operationId)).command.input).toHaveProperty('expectedCatalogRevision',await targetDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision'));
    }
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const runtime={...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,runtime);};
    const performanceId=original.action==='performance_update'?original.input.id:original.ids.performanceId;
    await targetDb.prepare("CREATE TRIGGER task44_video_event_abort BEFORE INSERT ON content_historical_records WHEN NEW.source_table='music_catalog_events' AND json_extract(NEW.record_json,'$.values.aggregate_type')='performance' BEGIN SELECT RAISE(ABORT,'video_event_atomic'); END").run();
    await consume();expect(message.retry).toHaveBeenCalledOnce();expect(await targetDb.prepare('SELECT version FROM music_performances WHERE id=?').bind(performanceId).first('version')).toBe(scenario==='known_update'?0:null);expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
    await targetDb.prepare('DROP TRIGGER task44_video_event_abort').run();await consume();
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(1);
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toMatchObject({outcome:'committed',sideEffectReconciled:true});
    expect(await targetDb.prepare('SELECT id FROM music_performances WHERE id=?').bind(performanceId).first('id')).toBe(performanceId);
    expect(await sourceDb.prepare('SELECT version FROM music_performances WHERE id=?').bind(performanceId).first('version')).toBe(scenario==='known_update'?0:null);
    if(scenario==='known_approval') {expect(await targetDb.prepare("SELECT status,reviewed_by_user_id,historical_review,version FROM music_cover_proposals WHERE id='video-proposal'").first()).toEqual({status:'approved',reviewed_by_user_id:null,historical_review:1,version:1});expect(JSON.stringify(await routeSource.exportOperation(plan.id,operationId))).not.toContain('luvdia-pending-admin');}
    expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.aggregate_id')=?").bind(performanceId).first('n')).toBe(1);
    expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
    await consume();expect(gets).toBe(1);
  } finally {stage.mockRestore();fixture.close();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_video_event_abort').run();}
},20000);
it.each(['review_source_tail','source_race','native','native_newer'] as const)('task4.4 deletes original review inbox items through their owning batch (%s)',async scenario=>{
  await seedPublicationCatalog();await seedVideoProposal();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:'Original private note'};
  await sourceDb.batch([
    sourceDb.prepare("UPDATE music_cover_proposals SET status='rejected',reviewed_by_user_id='original-source-admin',reviewed_at=1 WHERE id='video-proposal'"),
    sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-delete-candidate','DeleteVid01','needs_input','eligible',?,1,1,999,1,1,?)").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review)),
  ]);
  for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM music_catalog_events WHERE aggregate_id IN ('review-delete-candidate','video-proposal') AND event_type='review_item.deleted'").run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary,native=scenario.startsWith('native'),site=native?'luvdia':'otw',db=native?targetDb:sourceDb;
  const fixture=await pendingAdminFixture(site);fixture.runtime.YOUTUBE_API_KEY='';fixture.runtime.CLERK_ADMIN_IDS=`${site}-pending-admin,${site}-new-admin`;
  const request=async(kind:'candidate'|'proposal',actor=`${site}-pending-admin`,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/review-items/${kind==='candidate'?'review-delete-candidate':'video-proposal'}`,{method:'DELETE',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},body:JSON.stringify({kind,expectedVersion:0})}),runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    if(scenario==='source_race') {
      const response=await request('candidate',undefined,{...fixture.runtime,otw_db:interleave(sourceDb,'batch',()=>routeSource.freeze(plan.id,Date.now()))});
      expect(response.status,await response.clone().text()).toBe(409);expect(await response.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});
      expect(await sourceDb.prepare("SELECT version,status FROM music_ingestion_candidates WHERE id='review-delete-candidate'").first()).toEqual({version:0,status:'needs_input'});
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.review.delete_local'").first('n')).toBe(0);return;
    }
    if(scenario==='review_source_tail') {
      await db.prepare("CREATE TRIGGER task44_review_delete_abort BEFORE UPDATE ON music_ingestion_candidates WHEN NEW.id='review-delete-candidate' BEGIN SELECT RAISE(ABORT,'review_delete_atomic'); END").run();
      const rejected=await request('candidate');expect(rejected.status).toBe(503);
      expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id='review-delete-candidate' AND event_type='review_item.deleted'").first('n')).toBe(0);
      expect(await db.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.review.delete_local'").first('n')).toBe(0);
      await db.prepare('DROP TRIGGER task44_review_delete_abort').run();
    }
    for(const kind of ['candidate','proposal'] as const) {
      const response=await request(kind);expect(response.status,await response.clone().text()).toBe(native?409:200);
      if(native) expect(await response.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});
    }
    if(native) {
      expect(await db.prepare("SELECT version FROM music_ingestion_candidates WHERE id='review-delete-candidate'").first('version')).toBe(0);await activate();
      if(scenario==='native_newer') {const winner=await request('candidate',`${site}-new-admin`);expect(winner.status,await winner.clone().text()).toBe(200);}
      else await db.prepare("CREATE TRIGGER task44_review_delete_abort BEFORE UPDATE ON music_ingestion_candidates WHEN NEW.id='review-delete-candidate' BEGIN SELECT RAISE(ABORT,'review_delete_atomic'); END").run();
      const operations=(await db.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.review.delete' AND json_extract(envelope_json,'$.nativeReceipt.actorId')=? ORDER BY operation_id").bind(`${site}-pending-admin`).all<{operation_id:string}>()).results;
      for(const {operation_id} of operations) {
        const operation=await routeTarget.exportOperation(plan.id,operation_id),message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:operation_id,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
        await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
        if(scenario==='native'&&operation.payload.kind==='candidate') {
          expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operation_id)).outcome).toBeNull();expect(await db.prepare("SELECT version FROM music_ingestion_candidates WHERE id='review-delete-candidate'").first('version')).toBe(0);
          await db.prepare('DROP TRIGGER task44_review_delete_abort').run();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
        }
        expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
        expect((await routeTarget.exportOperation(plan.id,operation_id)).outcome?.outcome).toBe(scenario==='native_newer'&&operation.payload.kind==='candidate'?'conflicted':'committed');
      }
    }
    expect(await db.prepare("SELECT version,status FROM music_ingestion_candidates WHERE id='review-delete-candidate'").first()).toEqual({version:1,status:'ignored'});
    expect(await db.prepare("SELECT version,status FROM music_cover_proposals WHERE id='video-proposal'").first()).toEqual({version:1,status:'rejected'});
    expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id IN ('review-delete-candidate','video-proposal') AND event_type='review_item.deleted'").first('n')).toBe(2);
    for(const kind of ['candidate','proposal'] as const) expect((await request(kind)).status).toBe(scenario==='native_newer'&&kind==='candidate'?409:200);
    if(scenario==='review_source_tail') {
      await activate();
      expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.event_type')='review_item.deleted'").first('n')).toBe(2);
      expect(await targetDb.prepare("SELECT count(*) n FROM music_catalog_events WHERE event_type='review_item.deleted' AND aggregate_id IN ('review-delete-candidate','video-proposal')").first('n')).toBe(0);
      const moved=await request('candidate');expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});
    }
    const readback=await handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/review-items?status=completed`,{headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`}}),fixture.runtime);
    expect(readback.status).toBe(200);expect(JSON.stringify(await readback.json())).not.toContain('review-delete-candidate');
  } finally {await db.prepare('DROP TRIGGER IF EXISTS task44_review_delete_abort').run();fixture.close();}
},20000);
it.each(['source','candidate_native'] as const)('task4.4 preserves candidate review materialization and original edits (%s)',async scenario=>{
  await seedPublicationCatalog();
  const originalReview={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  for(const [id,video,version] of [['review-save','ReviewVid01',0],['review-next','ReviewVid02',1],['review-newer','ReviewVid03',0]] as const) await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,made_for_kids,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json,version) VALUES(?,?,'needs_input','eligible',?,'playable',0,1,1,999,1,1,?,?)").bind(id,video,`UC${'p'.repeat(22)}`,JSON.stringify(originalReview),version).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary,native=scenario==='candidate_native',db=native?targetDb:sourceDb,site=native?'luvdia':'otw';
  const fixture=await pendingAdminFixture(site);fixture.runtime.YOUTUBE_API_KEY='';fixture.runtime.CLERK_ADMIN_IDS=`${site}-pending-admin,${site}-new-admin`;
  const request=async(id:string,body:unknown,actor=`${site}-pending-admin`)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/import-candidates/${id}`,{method:'PATCH',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),fixture.runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  const input={...originalReview,song:{kind:'create',title:'Candidate Ready Song',isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:'unknown',aliases:[{alias:'준비 후보 곡',locale:'ko',aliasKind:null}],originalArtists:[{subject:{kind:'new_external',clientKey:'candidate-ready-artist',displayName:'Candidate Ready Artist',entityKind:'person'},creditOrder:0,isPrimary:true}],tags:['Pop']}};
  const save={action:'save',expectedVersion:0,input};
  const snapshot=async()=>JSON.stringify(await Promise.all(['music_songs','music_entities','music_catalog_meta','music_public_read_model_meta','music_search_terms'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results))));
  try {
    if(native) {
      const accepted=await request('review-save',save);expect(accepted.status,await accepted.clone().text()).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});
      const second=await request('review-newer',{action:'save',expectedVersion:0,input:originalReview});expect(second.status,await second.clone().text()).toBe(409);
      expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Candidate Ready Song'").first('n')).toBe(0);await activate();
      const winner=await request('review-newer',{action:'ignore',expectedVersion:0},`${site}-new-admin`);expect(winner.status,await winner.clone().text()).toBe(200);
    }
    const before=await snapshot();
    await db.prepare("CREATE TRIGGER task44_candidate_review_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.candidate_id='review-save' AND NEW.event_type='candidate.review_saved' BEGIN SELECT RAISE(ABORT,'candidate_review_atomic'); END").run();
    if(native) {
      const rows=(await db.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.mutate' AND json_extract(envelope_json,'$.payload.action')='save' ORDER BY operation_id").all<{operation_id:string}>()).results;
      for(const {operation_id} of rows) {
        const operation=await routeTarget.exportOperation(plan.id,operation_id),message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:operation_id,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
        await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
        if(operation.payload.candidateId==='review-save') {
          expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operation_id)).outcome).toBeNull();expect(await snapshot()).toBe(before);
          await db.prepare('DROP TRIGGER task44_candidate_review_abort').run();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
        }
        expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
        expect((await routeTarget.exportOperation(plan.id,operation_id)).outcome?.outcome).toBe(operation.payload.candidateId==='review-save'?'committed':'conflicted');
      }
    } else {
      const failed=await request('review-save',save);expect(failed.status).toBe(503);expect(await snapshot()).toBe(before);
      expect(await db.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.local'").first('n')).toBe(0);
      await db.prepare('DROP TRIGGER task44_candidate_review_abort').run();
    }
    const saved=await request('review-save',save);expect(saved.status,await saved.clone().text()).toBe(200);
    const result=await saved.json() as {data:import('@contracts/otw-play').OtwPlayIngestionReviewCandidateDto};
    expect(result.data).toMatchObject({version:1,status:'ready',catalogChanges:{songs:[{title:'Candidate Ready Song',tags:['Pop']}],entities:[{displayName:'Candidate Ready Artist'}]}});
    const songId=result.data.catalogChanges!.songs[0].id;
    expect(await db.prepare('SELECT count(*) n FROM music_search_terms WHERE song_id=?').bind(songId).first('n')).toBeGreaterThan(0);
    expect(await db.prepare('SELECT c.revision=r.revision parity FROM music_catalog_meta c JOIN music_public_read_model_meta r USING(id) WHERE c.id=1').first('parity')).toBe(1);
    // Original review-state fallback permits metadata-only version advancement.
    const reused=await request('review-next',{action:'save',expectedVersion:0,expectedReviewInput:originalReview,expectedReviewStatus:'needs_input',input:result.data.reviewInput});
    expect(reused.status,await reused.clone().text()).toBe(200);expect(await reused.json()).toMatchObject({data:{version:2,status:'ready',reviewInput:{song:{kind:'existing',songId}}}});
    expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Candidate Ready Song'").first('n')).toBe(1);
    const changed=await request('review-save',{action:'change_kind',expectedVersion:1,candidateKind:'singing_clip'});expect(changed.status,await changed.clone().text()).toBe(200);
    expect(await changed.json()).toMatchObject({data:{version:2,candidateKind:'singing_clip',status:'needs_input',reviewInput:{releaseType:'broadcast',relationType:'singing_clip'}}});
    const noop=await request('review-save',{action:'change_kind',expectedVersion:2,candidateKind:'singing_clip'});expect(noop.status,await noop.clone().text()).toBe(200);expect(await noop.json()).toMatchObject({data:{version:2}});
    const ignored=await request('review-save',{action:'ignore',expectedVersion:2});expect(ignored.status,await ignored.clone().text()).toBe(200);expect(await ignored.json()).toMatchObject({data:{version:3,status:'ignored',reviewInput:null}});
    expect(await (await request('review-save',save)).json()).toEqual(result);
    expect(await db.prepare("SELECT count(*) n FROM music_ingestion_events WHERE candidate_id='review-save' AND event_type='candidate.review_saved'").first('n')).toBe(1);
    if(native) {
      const duplicate={action:'save',expectedVersion:1,input};
      const first=await request('review-newer',duplicate);expect(first.status,await first.clone().text()).toBe(422);
      const repeated=await request('review-newer',duplicate);expect(repeated.status).toBe(422);expect((await repeated.json() as {error:{message:string}}).error.message).toBe((await first.json() as {error:{message:string}}).error.message);
      expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Candidate Ready Song'").first('n')).toBe(1);
    }
    if(!native) {
      await activate();expect(await targetDb.prepare('SELECT title FROM music_songs WHERE id=?').bind(songId).first('title')).toBe('Candidate Ready Song');
      expect(await targetDb.prepare("SELECT version,status,reviewed_by_user_id FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:3,status:'ignored',reviewed_by_user_id:null});
      const moved=await request('review-save',save);expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});
    }
  } finally {await db.prepare('DROP TRIGGER IF EXISTS task44_candidate_review_abort').run();fixture.close();}
},25000);
it.each(['channel_parent_source','channel_parent_native','channel_parent_newer','channel_parent_constraint'] as const)('task4.4 original channel approval parent (%s)',async scenario=>{
  await seedPublicationCatalog();
  const transferred=scenario==='channel_parent_source',newer=scenario==='channel_parent_newer',constraint=scenario==='channel_parent_constraint',videoId='NewVideo001',channelId=`UC${'q'.repeat(22)}`;
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save',?,'needs_input','channel_review',?,'playable',1,1,999,1,1,?)").bind(videoId,channelId,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  let activated=false,gets=0,lostChild=false,winner=false,sourceFixture:Awaited<ReturnType<typeof pendingAdminFixture>>|null=null,targetFixture:Awaited<ReturnType<typeof pendingAdminFixture>>|null=null;
  const body={action:'approve_channel',expectedVersion:0,channel:{ownershipKind:'member',channelRole:'member_music',entityIds:['publication-singer']}};
  const request=async(fixture:Awaited<ReturnType<typeof pendingAdminFixture>>,site:'otw'|'luvdia',input:unknown=body)=>handleWorkerFetch(new Request(`http://localhost:${site==='otw'?5173:5174}/api/play/admin/import-candidates/review-save`,{method:'PATCH',headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`,'Content-Type':'application/json'},body:JSON.stringify(input)}),fixture.runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const op of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(op);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);activated=true;};
  const provider=async(input:RequestInfo|URL)=>{
    const url=new URL(String(input));gets++;
    const db=activated?targetDb:sourceDb;
    expect(await db.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.channel_approve'").first('n')).toBe(1);
    if(!activated){await expect(routeSource.freeze(plan.id,Date.now())).rejects.toThrow(/Fence/);expect((await sourceRouteSave({member_uid:1,date:'2026-10-15',title:'Serving during channel snapshot',status:'휴방'})).status).toBe(200);}
    if(url.pathname==='/youtube/v3/channels'){expect(url.searchParams.get('id')).toBe(channelId);if(constraint&&!winner){winner=true;const changed=await handleWorkerFetch(new Request('http://localhost:5174/api/play/admin/channels',{method:'POST',headers:{Authorization:`Bearer ${await targetFixture!.token('luvdia-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'parent-independent-channel-winner'},body:JSON.stringify({externalChannelId:channelId,displayName:'Independent channel',channelRole:'member_music',entityIds:['publication-singer']})}),targetFixture!.runtime);expect(changed.status,await changed.clone().text()).toBe(201);}return Response.json({items:[{id:channelId,snippet:{title:'Original approved channel'}}]});}
    expect(url.pathname).toBe('/youtube/v3/videos');expect(url.searchParams.get('id')).toBe(videoId);
    return Response.json({items:[{id:videoId,snippet:{channelId,channelTitle:'Original approved channel',title:'Original candidate video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  };
  const failures:string[]=[];
  const originalUpdate=IngestionService.prototype.updateCandidate,originalResume=IngestionService.prototype.resumeCandidateChannel;
  const updateDiagnostic=vi.spyOn(IngestionService.prototype,'updateCandidate').mockImplementation(async function(this:IngestionService,...args){try{return await originalUpdate.apply(this,args);}catch(error){failures.push(error instanceof Error?`${error.stack} cause=${String(error.cause)}`:String(error));throw error;}});
  const resumeDiagnostic=vi.spyOn(IngestionService.prototype,'resumeCandidateChannel').mockImplementation(async function(this:IngestionService,...args){try{return await originalResume.apply(this,args);}catch(error){failures.push(error instanceof Error?`${error.stack} cause=${String(error.cause)}`:String(error));throw error;}});
  const originalSnapshot=D1TransitionRepository.prototype.sealCandidateChannelSnapshot;
  const snapshot=vi.spyOn(D1TransitionRepository.prototype,'sealCandidateChannelSnapshot').mockImplementation(async function(this:D1TransitionRepository,...args){const value=await originalSnapshot.apply(this,args);if(transferred&&!activated) await activate();return value;});
  const originalChild=D1TransitionRepository.prototype.commitCandidateChannelChild;
  const child=vi.spyOn(D1TransitionRepository.prototype,'commitCandidateChannelChild').mockImplementation(async function(this:D1TransitionRepository,...args){const value=await originalChild.apply(this,args);if(transferred&&args[3]==='create'&&!lostChild){lostChild=true;throw new Error('Lost original child acknowledgement after sealed commit');}if(newer&&args[3]==='update'&&!winner){winner=true;const saved=await request(targetFixture!,'luvdia',{action:'ignore',expectedVersion:0});expect(saved.status,await saved.clone().text()).toBe(200);}return value;});
  try {
    if(transferred){sourceFixture=await pendingAdminFixture('otw',sourceDb,provider);sourceFixture.runtime.YOUTUBE_API_KEY='local-fixture-only';sourceFixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;const admitted=await request(sourceFixture,'otw');expect(admitted.status,`${await admitted.clone().text()} ${failures.join('\n')}`).toBe(409);expect(await admitted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(activated).toBe(true);expect(gets).toBe(1);sourceFixture.close();sourceFixture=null;}
    targetFixture=await pendingAdminFixture('luvdia',targetDb,provider);targetFixture.runtime.YOUTUBE_API_KEY='local-fixture-only';targetFixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.SOURCE_RELAY;
    if(!transferred){const admitted=await request(targetFixture,'luvdia');expect(admitted.status,`${await admitted.clone().text()} ${failures.join('\n')}`).toBe(409);expect(await admitted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(gets).toBe(0);await activate();}
    const operationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.channel_approve'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()},consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,targetFixture!.runtime);};
    if(!newer&&!constraint){
      await targetDb.prepare(transferred?"CREATE TRIGGER task44_parent_abort BEFORE INSERT ON content_historical_records WHEN NEW.source_table='music_catalog_events' AND json_extract(NEW.record_json,'$.values.event_type')='channel.updated' BEGIN SELECT RAISE(ABORT,'parent_required_child_event'); END":"CREATE TRIGGER task44_parent_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='channel.created' BEGIN SELECT RAISE(ABORT,'parent_required_child_event'); END").run();
      await consume();expect(message.retry).toHaveBeenCalledOnce();expect(message.ack).not.toHaveBeenCalled();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(gets).toBe(2);
      expect(await targetDb.prepare('SELECT count(*) n FROM music_channels WHERE external_channel_id=?').bind(channelId).first('n')).toBe(transferred?1:0);
      if(transferred){await consume();expect(message.retry).toHaveBeenCalledOnce();expect(gets).toBe(3);expect(await sourceDb.prepare("SELECT json_type(envelope_json,'$.sourceReceipt.channelApproval.create.result') result FROM content_transition_operations WHERE operation_id=?").bind(operationId).first('result')).toBe('object');}
      const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);try{expect((await runDataRetentionPolicyPrune(targetFixture.runtime,'native-chzzk-read-detail',250)).deletedRows).toBe(0);}finally{clock.mockRestore();}
      await targetDb.prepare('DROP TRIGGER task44_parent_abort').run();
    }
    await consume();expect(message.ack,failures.join('\n')).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(newer||constraint?3:4);
    const saved=(await routeTarget.readCandidateChannelReceipt(operationId))!;
    if(constraint){
      expect(saved.operation.outcome).toMatchObject({outcome:'failed',sideEffectReconciled:true,youtubeVideo:{flow:'candidate_channel_approve',reads:[{disposition:'consumed'},{disposition:'consumed'},{disposition:'not_issued'},{disposition:'not_issued'}]}});
      expect(saved.failure).toMatchObject({kind:'repository',code:'validation_failed',sqlError:expect.stringMatching(/^D1_ERROR: UNIQUE constraint failed: music_channels/)});
      expect(saved.stages?.create?.result).toBeNull();expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_commits WHERE operation_id IN (?,?,?)').bind(operationId,`${operationId}:channel:create`,`${operationId}:channel:update`).first('n')).toBe(0);
      expect(await targetDb.prepare('SELECT verification_status,version FROM music_channels WHERE external_channel_id=?').bind(channelId).first()).toEqual({verification_status:'pending',version:0});
      expect(await targetDb.prepare("SELECT status,version FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({status:'needs_input',version:0});
      const replay=await request(targetFixture,'luvdia');expect(replay.status).toBe(422);expect(await replay.json()).toMatchObject({error:{code:'PLAY_ADMIN_VALIDATION_FAILED'}});await consume();expect(message.ack,failures.join('\n')).toHaveBeenCalledOnce();expect(gets).toBe(3);return;
    }
    expect(saved.operation.outcome).toMatchObject({outcome:newer?'conflicted':'committed',sideEffectReconciled:true,youtubeVideo:{flow:'candidate_channel_approve',reads:[{disposition:'consumed'},{disposition:'consumed'},{disposition:'consumed'},{disposition:newer?'not_issued':'consumed'}]}});
    expect(await targetDb.prepare('SELECT verification_status,version FROM music_channels WHERE external_channel_id=?').bind(channelId).first()).toEqual({verification_status:'approved',version:1});
    expect(await targetDb.prepare("SELECT version,status,reviewed_by_user_id FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:1,status:newer?'ignored':'ready',reviewed_by_user_id:transferred?null:'luvdia-pending-admin'});
    if(transferred){expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.event_type') IN ('channel.created','channel.updated')").first('n')).toBe(2);}
    else {const replay=await request(targetFixture,'luvdia');expect(replay.status,await replay.clone().text()).toBe(newer?409:200);if(!newer){expect(await replay.json()).toEqual({data:saved.result});const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);try{expect((await runDataRetentionPolicyPrune(targetFixture.runtime,'native-chzzk-read-detail',250)).deletedRows).toBe(4);}finally{clock.mockRestore();}expect((await request(targetFixture,'luvdia')).status).toBe(200);}}
    await consume();expect(message.ack,failures.join('\n')).toHaveBeenCalledOnce();expect(gets).toBe(newer?3:4);
  } finally {updateDiagnostic.mockRestore();resumeDiagnostic.mockRestore();snapshot.mockRestore();child.mockRestore();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_parent_abort').run();sourceFixture?.close();targetFixture?.close();}
},25000);
it('task4.4 channel_parent_local preserves skipped channel children and original source terminal capture',async()=>{
  await seedPublicationCatalog();
  await sourceDb.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('publication-channel','publication-singer')").run();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save','NewVideo001','needs_input','eligible',?,'playable',1,1,999,1,1,?)").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  let gets=0;
  const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{
    const url=new URL(String(input));expect(url.pathname).toBe('/youtube/v3/videos');gets++;
    await expect(routeSource.freeze(plan.id,Date.now())).rejects.toThrow(/Fence/);
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Approved music',title:'Original source candidate',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const request=async()=>handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/import-candidates/review-save',{method:'PATCH',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json'},body:JSON.stringify({action:'approve_channel',expectedVersion:0,channel:{ownershipKind:'member',channelRole:'member_music',entityIds:['publication-singer']}})}),fixture.runtime);
  try {
    const result=await request();expect(result.status,await result.clone().text()).toBe(200);const dto=await result.json();expect(dto).toMatchObject({data:{status:'ready',version:1}});expect(gets).toBe(2);expect(await(await request()).json()).toEqual(dto);expect(gets).toBe(2);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.channel_approve'").first<string>('operation_id'))!,receipt=(await routeSource.readCandidateChannelReceipt(operationId))!;
    expect(receipt.stages?.create).toBeNull();expect(receipt.stages?.update).toBeNull();expect(receipt.operation.outcome).toMatchObject({outcome:'committed',youtubeVideo:{reads:[{disposition:'consumed'},{disposition:'not_issued'},{disposition:'not_issued'},{disposition:'consumed'}]}});
    expect(await sourceDb.prepare("SELECT actor_user_id FROM music_ingestion_events WHERE candidate_id='review-save'").first('actor_user_id')).toBe('otw-pending-admin');
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const op of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(op);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    expect(await targetDb.prepare("SELECT version,status,reviewed_by_user_id FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:1,status:'ready',reviewed_by_user_id:null});
    const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});expect(gets).toBe(2);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:receipt.operation.payloadHash},ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,{...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(2);
  } finally {fixture.close();}
},25000);
it.each(['r94_local_confirmation','r94_source_abort','r94_local_retry','r94_local_unknown'] as const)('preserves accepted unissued AI through %s',async scenario=>{
  await seedPublicationCatalog();const candidateId='youtube:NewVideo001';
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES(?,'NewVideo001','needs_input','eligible',?,'playable',1,1,999,1,1,?)").bind(candidateId,`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  let gets=0,posts=0;
  const retrying=scenario==='r94_local_retry',uncertain=scenario==='r94_local_unknown';
  let releasePost!:(response:Response)=>void,enteredPost!:()=>void;
  const issued=new Promise<void>(resolve=>{enteredPost=resolve;}),response=new Promise<Response>(resolve=>{releasePost=resolve;});
  let activeQueue:ReturnType<typeof consume>|null=null;
  const provider=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.hostname==='generativelanguage.googleapis.com'){expect(init?.method).toBe('POST');posts++;if(retrying)return Response.json({error:{message:'Original rate limit'}},{status:429});if(uncertain){enteredPost();return response;}return Response.json({status:'completed',outputs:[{type:'text',text:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:'Original analysed song',alternateTitles:[],originalArtists:[{name:'Original artist',sourceNames:[],entityKind:'person'}],tags:[]}},evidence:{song:[{source:'video',text:'Original video',timecode:'00:05'}]},warnings:[]}]})}],usage:{total_input_tokens:20,total_output_tokens:30}});}
    expect(url.pathname).toBe('/youtube/v3/videos');gets++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  };
  let fixture=await pendingAdminFixture('otw',sourceDb,provider);
  const configure=()=>Object.assign(fixture.runtime,{YOUTUBE_API_KEY:'fixture-only',GEMINI_API_KEY:'fixture-only',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_DAILY_LIMIT:'1',OTW_PLAY_AI_REVIEW_QUEUE:{send:vi.fn().mockResolvedValue(undefined)},CONTENT_TRANSITION_PEER:undefined});configure();
  const api=async(site:'otw'|'luvdia',path:string,body?:unknown,actor=`${site}-pending-admin`)=>handleWorkerFetch(new Request(`http://localhost:${site==='otw'?5173:5174}/api/play/admin/ai-reviews${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  const consume=async(reviewId:string)=>{const message={body:{kind:'otw_play_ai_review',schemaVersion:1,reviewId},ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:fixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);return message;};
  try {
    const accepted=await api('otw','',{target:{candidateId},range:null,idempotencyKey:'legacy-unknown-review'});expect(accepted.status,await accepted.clone().text()).toBe(202);const originalId=(await accepted.json() as {data:{id:string}}).data.id;
    expect(posts).toBe(0);
    if(retrying) {
      fixture.runtime.OTW_PLAY_AI_REVIEW_DAILY_LIMIT='3';
      const started=Date.now()-300000,clock=vi.spyOn(Date,'now').mockReturnValue(started);
      try {expect((await consume(originalId)).retry).toHaveBeenCalledOnce();clock.mockReturnValue(started+31000);expect((await consume(originalId)).retry).toHaveBeenCalledOnce();} finally {clock.mockRestore();}
      expect(await sourceDb.prepare('SELECT status,attempts,error_code FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual({status:'retry_wait',attempts:2,error_code:'provider_rate_limit'});
    }
    const original=await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first();
    const {routeSource,routeTarget}=await routeControls([],true);
    const row=(await sourceDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.ai.resume'").first<{operation_id:string;payload_hash:string}>())!;expect(row).not.toBeNull();
    expect((await routeSource.exportOperation(plan.id,row.operation_id)).attempt).toBeNull();
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id))await routeTarget.receiveOperation(operation);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);
    await expect(routeTarget.activate(plan.id)).rejects.toThrow();
    expect((await relayBindings.TARGET_RELAY.receiveOperation(plan.id,row.operation_id,row.payload_hash)).accepted).toBe(true);
    expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual(original);
    if(scenario==='r94_source_abort') {
      await routeSource.archiveSource(plan.id);
      await routeTarget.abortTargetBeforeActivation(plan.id,Date.now());
      expect((await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).resumed).toBe(true);
      expect(fixture.runtime.CONTENT_TRANSITION_PEER).toBeUndefined();
      const message=await consume(originalId);expect(message.retry).not.toHaveBeenCalled();expect(message.ack).toHaveBeenCalledOnce();
      expect(await sourceDb.prepare('SELECT status,attempts FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual({status:'succeeded',attempts:1});
      expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);expect(gets).toBe(1);expect(posts).toBe(1);return;
    }
    await routeTarget.activate(plan.id);fixture.close();fixture=await pendingAdminFixture('luvdia',targetDb,provider);configure();
    const latest=await api('luvdia',`?candidateId=${encodeURIComponent(candidateId)}`);expect(latest.status,await latest.clone().text()).toBe(200);
    const pending=(await latest.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;expect(pending.continuation?.state).toBe('confirmation_required');expect(pending.recovery).toBeUndefined();
    expect((await consume(originalId)).retry).toHaveBeenCalledOnce();expect(posts).toBe(retrying?2:0);expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
    const {state:_state,...identity}=pending.continuation!;void _state;const input={...identity,decision:'resume_unissued',idempotencyKey:'resume-original-confirm'};
    if(scenario==='r94_local_confirmation') {
    expect((await api('luvdia',`/${originalId}/resume-unissued`,input,'ordinary-member')).status).toBe(403);
    expect((await api('luvdia',`/${originalId}/resume-unissued`,{...input,requestHash:'0'.repeat(64)})).status).toBe(409);
    await targetDb.prepare("CREATE TRIGGER task44_ai_resume_abort BEFORE INSERT ON music_ai_reviews BEGIN SELECT RAISE(ABORT,'task44_ai_resume_abort'); END").run();
    expect((await api('luvdia',`/${originalId}/resume-unissued`,input)).status).toBe(409);
    expect(await targetDb.prepare("SELECT json_type(envelope_json,'$.nativeReceipt.aiResume.confirmation') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBeNull();
    await targetDb.prepare('DROP TRIGGER task44_ai_resume_abort').run();
    }
    const confirmed=await api('luvdia',`/${originalId}/resume-unissued`,input);expect(confirmed.status,await confirmed.clone().text()).toBe(202);const executionId=(await confirmed.json() as {data:{id:string}}).data.id;expect(executionId).not.toBe(originalId);expect(posts).toBe(retrying?2:0);
    expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
    if(uncertain) {
      const started=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(started);
      try {
      activeQueue=consume(executionId);
      await Promise.race([issued,activeQueue.then(()=>{throw new Error('Confirmed AI exited before POST');})]);clock.mockReturnValue(started+300001);
      const raw=await targetDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(executionId).first();
      const attempts=(await targetDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(executionId).all()).results;
      const unknown=await api('luvdia',`?candidateId=${encodeURIComponent(candidateId)}`);expect(unknown.status,await unknown.clone().text()).toBe(200);
      const dto=(await unknown.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;expect(dto.id).toBe(executionId);expect(dto.recovery?.state).toBe('outcome_unknown');
      const {state:_unknownState,...evidence}=dto.recovery!;void _unknownState;const decision={...evidence,decision:'close_unknown',idempotencyKey:'close-confirmed-unknown'};
      const closed=await api('luvdia',`/${executionId}/close-unknown`,decision);expect(closed.status,await closed.clone().text()).toBe(200);expect(await closed.json()).toMatchObject({data:{status:'running',recovery:{state:'closed_by_admin'}}});
      expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toMatchObject({outcome:'administratively_closed',aiReview:{attemptId:evidence.attemptId,issuance:'issued'}});
      releasePost(Response.json({status:'completed',outputs:[{type:'text',text:JSON.stringify({videoAnalyzed:false,warnings:['late original response'],songs:[]})}]}));
      const late=await activeQueue;activeQueue=null;expect(late.ack).toHaveBeenCalledOnce();expect(late.retry).not.toHaveBeenCalled();
      expect(await targetDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(executionId).first()).toEqual(raw);expect((await targetDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(executionId).all()).results).toEqual(attempts);
      expect(await targetDb.prepare("SELECT json_type(envelope_json,'$.nativeReceipt.aiResume.attempts[0].lateResponse') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBe('object');
      expect((await api('luvdia',`/${executionId}/close-unknown`,decision)).status).toBe(200);expect((await consume(executionId)).ack).toHaveBeenCalledOnce();expect(posts).toBe(1);expect(gets).toBe(1);
      expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual(original);return;
      } finally {clock.mockRestore();}
    }
    const finalStatus=retrying?'failed':'succeeded';
    await targetDb.prepare(`CREATE TRIGGER task44_ai_finish_abort BEFORE UPDATE OF status ON music_ai_reviews WHEN NEW.status='${finalStatus}' BEGIN SELECT RAISE(ABORT,'task44_ai_finish_abort'); END`).run();
    expect((await consume(executionId)).retry).toHaveBeenCalledOnce();expect(posts).toBe(retrying?3:1);
    expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
    expect(await targetDb.prepare("SELECT json_type(envelope_json,'$.nativeReceipt.aiResume.attempts[0].response') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBe('object');
    await targetDb.prepare('DROP TRIGGER task44_ai_finish_abort').run();
    const final=await consume(executionId);expect(final.retry).not.toHaveBeenCalled();expect(final.ack).toHaveBeenCalledOnce();
    expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toMatchObject({outcome:retrying?'failed':'committed',sideEffectReconciled:true,aiResume:{executionId,status:finalStatus}});
    const retry=await api('luvdia',`/${originalId}/resume-unissued`,input);expect(retry.status,await retry.clone().text()).toBe(200);expect(await retry.json()).toMatchObject({data:{id:executionId,status:finalStatus,attempts:retrying?3:1}});
    expect((await consume(executionId)).ack).toHaveBeenCalledOnce();expect(gets).toBe(1);expect(posts).toBe(retrying?3:1);
    expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual(original);
    expect(await sourceDb.prepare('SELECT count(*) n FROM music_ai_review_attempts').first('n')).toBe(retrying?2:0);expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_review_attempts').first('n')).toBe(1);
    expect(JSON.stringify(await routeTarget.exportOperation(plan.id,row.operation_id))).not.toContain('luvdia-pending-admin');
  } finally {releasePost(Response.json({error:{message:'fixture cleanup'}},{status:503}));await activeQueue;await targetDb.prepare('DROP TRIGGER IF EXISTS task44_ai_resume_abort').run();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_ai_finish_abort').run();fixture.close();}
},25000);
it.each(['batch_native_owner','batch_source_drain'] as const)('%s preserves original AI parent results and stop cancellation',async scenario=>{
  const native=scenario==='batch_native_owner',site=native?'luvdia':'otw',db=native?targetDb:sourceDb;
  await seedPublicationCatalog();
  const ingestion=new D1IngestionRepository(sourceDb),candidateId='youtube:NewVideo001';
  const preflight:import('@contracts/otw-play').OtwPlayPlaylistPreflightDto={playlistId:'PL1234567890',canonicalUrl:'https://www.youtube.com/playlist?list=PL1234567890',title:'Original batch prerequisite',ownerChannelId:'UCowner',ownerChannelTitle:'Owner',itemCount:1,privacyStatus:'public',rangeStartPosition:0,rangeEndExclusive:1,nextRangeStart:null,requestedItemCount:1,estimatedPageCount:1,estimatedVideoBatchCount:1,hardCap:5000,requiresSplit:false,previousImport:null};
  const job=await ingestion.createJob({jobId:'review-bulk-job',actorUserId:'otw-pending-admin',input:{playlistUrl:preflight.canonicalUrl,mode:'all_new',idempotencyKey:'batch-source-fixture'},preflight,now:1});
  const children=await ingestion.recordPlaylistPage(await ingestion.readMessage(job.message.idempotencyKey),{items:[{playlistItemId:'batch-video',videoId:'NewVideo001',position:0}],nextPageToken:null},2);
  await ingestion.recordVideoBatch(await ingestion.readMessage(children[0]!.idempotencyKey),[{videoId:'NewVideo001',availabilityStatus:'playable',video:{videoId:'NewVideo001',channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original video',thumbnailUrl:null,durationSeconds:300,publishedAt:1,availabilityStatus:'playable',madeForKids:false}}],3);
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("UPDATE music_ingestion_candidates SET status='needs_input',classification='eligible',review_input_json=? WHERE id=?").bind(JSON.stringify(review),candidateId).run();
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'};
  const routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  const routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  if(native){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());await capturing(routeSource);await installInactiveBaseline(routeSource,routeTarget);await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'batch-ready',Date.now()+60000),Date.now());await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);}
  let gets=0,posts=0,releasePost!:(response:Response)=>void,enteredPost!:()=>void;
  const entered=new Promise<void>(resolve=>{enteredPost=resolve;}),waiting=new Promise<Response>(resolve=>{releasePost=resolve;});
  const originalResponse=()=>Response.json({status:'completed',outputs:[{type:'text',text:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:'Original analysed song',alternateTitles:[],originalArtists:[{name:'Original artist',sourceNames:[],entityKind:'person'}],tags:[]}},evidence:{song:[{source:'video',text:'Original video',timecode:'00:05'}]},warnings:[]}]})}],usage:{total_input_tokens:20,total_output_tokens:30}});
  const fixture=await pendingAdminFixture(site,db,async(input,init)=>{const url=new URL(String(input));if(url.hostname==='generativelanguage.googleapis.com'){expect(init?.method).toBe('POST');posts++;enteredPost();return native?originalResponse():waiting;}expect(url.pathname).toBe('/youtube/v3/videos');gets++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});});
  const send=vi.fn().mockResolvedValue(undefined);Object.assign(fixture.runtime,{YOUTUBE_API_KEY:'fixture-only',GEMINI_API_KEY:'fixture-only',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_DAILY_LIMIT:'2',OTW_PLAY_AI_REVIEW_QUEUE:{send},CONTENT_TRANSITION_PEER:undefined});
  const api=async(path:string,body?:unknown,actor=`${site}-pending-admin`)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  let active:Promise<void>|null=null;
  try {
    let originalId:string|null=null;
    if(!native){const first=await api('ai-reviews',{target:{candidateId},range:null,idempotencyKey:'maintenance-cancel-ai'});expect(first.status,await first.clone().text()).toBe(202);originalId=(await first.json() as {data:{id:string}}).data.id;}
    const candidateVersion=(await db.prepare('SELECT version FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first<number>('version'))!;
    const input={selection:{candidates:[{id:candidateId,version:candidateVersion}]},idempotencyKey:'maintenance-native-batch'};
    expect((await api('ai-review-batches',input,'ordinary-user')).status).toBe(403);
    const accepted=await api('ai-review-batches',input);expect(accepted.status,await accepted.clone().text()).toBe(202);
    const batch=(await accepted.json() as {data:{id:string;total:number}}).data;expect(batch.total).toBe(1);
    const item=(await db.prepare('SELECT * FROM music_ai_review_batch_items WHERE batch_id=?').bind(batch.id).first<{id:string;generation:number}>())!;
    const consume=()=>{const message={body:{kind:'otw_play_ai_batch',schemaVersion:1,itemId:item.id,generation:item.generation},ack:vi.fn(),retry:vi.fn()};return {message,run:handleWorkerQueue({queue:fixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime)};};
    if(!native){
      const raw=await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first();
      await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));
      await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/aiBatchItems/);
      expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
      expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(originalId).first()).toEqual(raw);
      const held=consume();await held.run;expect(held.message.retry).toHaveBeenCalledOnce();expect(posts).toBe(0);
      expect(await sourceDb.prepare('SELECT * FROM music_ai_review_batch_items WHERE batch_id=?').bind(batch.id).first()).toEqual(item);
      await expect(routeSource.cancelMaintenance(plan.id,routePlan.generation+1,Date.now())).rejects.toThrow(/unfenced prepared source/);
      await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());
      expect(await sourceDb.prepare('SELECT maintenance_state FROM content_transitions').first('maintenance_state')).toBe('open');
    }
    await db.prepare("CREATE TRIGGER task44_batch_finish_abort BEFORE UPDATE OF status ON music_ai_review_batch_items WHEN NEW.status IN ('saved','needs_selection') BEGIN SELECT RAISE(ABORT,'batch_finish_atomic'); END").run();
    const first=consume();active=first.run;
    if(!native){await entered;await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/aiBatchItems/);expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);releasePost(originalResponse());}
    await active;active=null;expect(first.message.ack).not.toHaveBeenCalled();expect(first.message.retry).toHaveBeenCalledOnce();expect(posts).toBe(1);
    expect(await db.prepare('SELECT status,lease_token,lease_until,result_json IS NOT NULL result FROM music_ai_review_batch_items WHERE id=?').bind(item.id).first()).toEqual({status:'saving',lease_token:null,lease_until:null,result:1});
    expect(await db.prepare('SELECT status FROM music_ai_reviews WHERE id=(SELECT review_id FROM music_ai_review_batch_items WHERE id=?)').bind(item.id).first('status')).toBe('succeeded');
    const saved=await db.prepare('SELECT result_json FROM music_ai_review_batch_items WHERE id=?').bind(item.id).first('result_json'),getCount=gets;
    await db.prepare('DROP TRIGGER task44_batch_finish_abort').run();const completed=consume();await completed.run;expect(completed.message.ack).toHaveBeenCalledOnce();expect(completed.message.retry).not.toHaveBeenCalled();expect(posts).toBe(1);expect(gets).toBe(getCount);
    const draft=await api(`ai-review-drafts/${encodeURIComponent(candidateId)}`);expect(draft.status,await draft.clone().text()).toBe(200);expect(await draft.json()).toMatchObject({data:{status:'needs_selection',result:{songs:[{values:{song:{title:'Original analysed song'}}}]}}});
    expect(await db.prepare('SELECT result_json FROM music_ai_review_batch_items WHERE id=?').bind(item.id).first('result_json')).toBe(saved);
    const retry=consume();await retry.run;expect(retry.message.ack).toHaveBeenCalledOnce();expect(posts).toBe(1);expect(gets).toBe(getCount);
    if(!native){await routeSource.stopMaintenance(plan.id,Date.now());expect(await sourceDb.prepare('SELECT maintenance_state FROM content_transitions').first('maintenance_state')).toBe('stopped');expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);await expect(routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now())).rejects.toThrow(/final stop/);}
    else {expect(await sourceDb.prepare('SELECT count(*) n FROM music_ai_review_batches').first('n')).toBe(0);const replay=await api('ai-review-batches',input);expect(await replay.json()).toMatchObject({data:{id:batch.id,total:1,counts:{needs_selection:1}}});expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_review_batch_items').first('n')).toBe(1);}
  } finally {releasePost(originalResponse());await active;await db.prepare('DROP TRIGGER IF EXISTS task44_batch_finish_abort').run();fixture.close();}
},30000);
it.each(['ingestion_source_stop','ingestion_native_owner'] as const)('%s preserves original pages and final response ownership',async scenario=>{
  const native=scenario==='ingestion_native_owner',site=native?'luvdia':'otw',db=native?targetDb:sourceDb,candidateId='youtube:NewVideo001';
  await seedPublicationCatalog();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,provider,external_video_id,candidate_kind,status,classification,availability_status,review_input_json,first_discovered_at,last_discovered_at,retention_expires_at,version,created_at,updated_at) VALUES(?,'youtube','NewVideo001','official_video','needs_input','eligible','unknown',?,1,1,9999999999999,0,1,1)").bind(candidateId,JSON.stringify(review)).run();
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'};
  const routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  const routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  if(native){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());await capturing(routeSource);await installInactiveBaseline(routeSource,routeTarget);await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'ingestion-ready',Date.now()+60000),Date.now());await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);}
  let pages=0,videos=0,releaseFirst!:(response:Response)=>void,releaseLate!:(response:Response)=>void,enteredFirst!:()=>void,enteredLate!:()=>void;
  const firstPage=new Promise<Response>(resolve=>{releaseFirst=resolve;}),latePage=new Promise<Response>(resolve=>{releaseLate=resolve;}),entered=new Promise<void>(resolve=>{enteredFirst=resolve;}),lateEntered=new Promise<void>(resolve=>{enteredLate=resolve;});
  const page=(late=false)=>Response.json({items:[{id:'original-playlist-item',contentDetails:{videoId:'NewVideo001'},snippet:{position:0}}],pageInfo:{totalResults:2},nextPageToken:late?'late-unaccepted-token':undefined});
  const fixture=await pendingAdminFixture(site,db,async input=>{
    const url=new URL(String(input));
    if(url.pathname==='/youtube/v3/playlists')return Response.json({items:[{id:'PL1234567890',snippet:{title:'Original playlist',channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music'},contentDetails:{itemCount:2},status:{privacyStatus:'public'}}]});
    if(url.pathname==='/youtube/v3/playlistItems'){pages++;if(native)return page();if(pages===1){enteredFirst();return firstPage;}enteredLate();return latePage;}
    expect(url.pathname).toBe('/youtube/v3/videos');videos++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original collected video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });
  const messages:unknown[]=[];Object.assign(fixture.runtime,{YOUTUBE_API_KEY:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'',CLOUDFLARE_D1_TOKEN:'',CONTENT_TRANSITION_PEER:undefined,OTW_PLAY_INGESTION_QUEUE:{send:async(message:unknown)=>{messages.push(message);}}});
  const api=async(path:string,body?:unknown)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  const consume=(body:unknown)=>{const message={body,ack:vi.fn(),retry:vi.fn()};return {message,run:handleWorkerQueue({queue:fixture.runtime.SITE_INGESTION_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime)};};
  const snapshot=async()=>({jobs:(await db.prepare("SELECT * FROM music_ingestion_jobs WHERE idempotency_key='maintenance-ingestion-owner'").all()).results,messages:(await db.prepare("SELECT * FROM music_ingestion_messages WHERE job_id IN(SELECT id FROM music_ingestion_jobs WHERE idempotency_key='maintenance-ingestion-owner') ORDER BY idempotency_key").all()).results,candidate:await db.prepare('SELECT * FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first()});
  let running:Promise<void>|null=null,lateRunning:Promise<void>|null=null;
  try {
    const input={playlistUrl:'PL1234567890',mode:'all_new',idempotencyKey:'maintenance-ingestion-owner'};
    const accepted=await api('imports/playlist',input);expect(accepted.status,await accepted.clone().text()).toBe(202);
    const job=(await accepted.json() as {data:{id:string}}).data;expect(messages).toHaveLength(1);
    const initial=await snapshot(),firstMessage=messages[0];
    if(!native){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/ingestionIssuanceUnknown/);expect(await snapshot()).toEqual(initial);const held=consume(firstMessage);await held.run;expect(held.message.retry).toHaveBeenCalledOnce();expect(pages).toBe(0);expect((await api('imports/playlist',{...input,idempotencyKey:'blocked-ingestion-owner'})).status).toBe(503);await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());}
    const first=consume(firstMessage);running=first.run;
    if(!native){await entered;const late=consume(firstMessage);lateRunning=late.run;await lateEntered;await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/ingestionIssuanceUnknown/);releaseFirst(page());}
    await running;running=null;expect(first.message.ack).toHaveBeenCalledOnce();expect(messages).toHaveLength(2);
    if(!native){const committed=await snapshot();releaseLate(page(true));await lateRunning;lateRunning=null;expect(await snapshot()).toEqual(committed);expect(messages).toHaveLength(2);const held=consume(messages[1]);await held.run;expect(held.message.retry).toHaveBeenCalledOnce();expect(videos).toBe(0);await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/ingestionIssuanceUnknown/);await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());}
    const beforeVideo=await db.prepare('SELECT * FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first();
    if(native)await db.prepare("CREATE TRIGGER task44_ingestion_finish_abort BEFORE UPDATE OF status ON music_ingestion_messages WHEN NEW.message_kind='video_batch' AND NEW.status='completed' BEGIN SELECT RAISE(ABORT,'ingestion_finish_atomic'); END").run();
    const video=consume(messages[1]);await video.run;
    if(native){expect(video.message.retry).toHaveBeenCalledOnce();expect(video.message.ack).not.toHaveBeenCalled();expect(await db.prepare('SELECT * FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first()).toEqual(beforeVideo);expect(await db.prepare("SELECT status FROM music_ingestion_messages WHERE job_id=? AND message_kind='video_batch'").bind(job.id).first('status')).toBe('pending');await db.prepare('DROP TRIGGER task44_ingestion_finish_abort').run();const retried=consume(messages[1]);await retried.run;expect(retried.message.ack).toHaveBeenCalledOnce();}
    else expect(video.message.ack).toHaveBeenCalledOnce();
    const completed=await api(`imports/${job.id}`);expect(completed.status,await completed.clone().text()).toBe(200);expect(await completed.json()).toMatchObject({data:{id:job.id,status:'completed'}});
    expect(await db.prepare('SELECT title,status,version FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first()).toEqual({title:'Original collected video',status:'ready',version:1});
    const final=await snapshot(),counts={pages,videos};for(const body of messages){const duplicate=consume(body);await duplicate.run;expect(duplicate.message.ack).toHaveBeenCalledOnce();}expect({pages,videos}).toEqual(counts);expect(await snapshot()).toEqual(final);
    if(!native){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());expect(await snapshot()).toEqual(final);await expect(routeSource.commitIngestionBatch('failure','late',[sourceDb.prepare("UPDATE music_ingestion_messages SET attempts=attempts+1 WHERE job_id=?").bind(job.id),sourceDb.prepare('UPDATE music_ingestion_jobs SET updated_at=updated_at+1 WHERE id=?').bind(job.id)])).rejects.toThrow();expect(await snapshot()).toEqual(final);}
    else {expect(await sourceDb.prepare("SELECT count(*) n FROM music_ingestion_jobs WHERE idempotency_key='maintenance-ingestion-owner'").first('n')).toBe(0);expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id GLOB 'ingestion-*' AND sealed=1").first<number>('n')).toBeGreaterThan(0);}
  }finally{releaseFirst(page());releaseLate(page(true));await running;await lateRunning;await db.prepare('DROP TRIGGER IF EXISTS task44_ingestion_finish_abort').run();fixture.close();}
},30000);
it('scheduled_finalization_stop keeps terminal followup recoverable through actual run-now Queue and retention',async()=>{
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  await sourceDb.prepare("UPDATE members SET url_twitter=CASE WHEN uid=1 THEN 'https://x.com/maint_owner' ELSE NULL END").run();
  const keys=['x_collection_enabled','x_collection_last_run','x_collection_last_success'];
  const previous=await Promise.all(keys.map(async key=>({key,value:await sourceDb.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<string>('value')})));
  await sourceDb.prepare("INSERT INTO settings(key,value) VALUES('x_collection_enabled','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db',classifications:[...plan.classifications,...previous.filter(row=>row.key==='x_collection_enabled'&&row.value===null).map(row=>({table:'settings',key:JSON.stringify([row.key]),disposition:'exclude' as const,reason:'Task-owned local X collection setting'}))]},routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb)),routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  const fixture=await pendingAdminFixture('otw');fixture.runtime.CONTENT_TRANSITION_PEER=undefined;fixture.runtime.X_BEARER_TOKEN='';
  const messages:unknown[]=[];let failSend=true;
  fixture.runtime.OTW_OPS_CONTROL_QUEUE={send:async(body:unknown)=>{messages.push(body);}} as unknown as Queue;
  fixture.runtime.OTW_OPS_BACKGROUND_QUEUE={send:async(body:unknown)=>{messages.push(body);if(failSend)throw new Error('task-owned lost send');}} as unknown as Queue;
  const consume=async(body:unknown)=>{const message={body,ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:(body as {messageType:string}).messageType==='scheduled_job_control'?'otw-ops-control':'otw-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);return message;};
  const held=async(key:'scheduledRuns'|'scheduledDispatch',body:unknown)=>{const before=(await sourceDb.prepare('SELECT * FROM scheduled_job_items ORDER BY id').all()).results;await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));expect((await routeSource.readMaintenanceBlockers(plan.id))[key]).toBeGreaterThan(0);await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(/unresolved original work/);const message=await consume(body);expect(message.retry).toHaveBeenCalled();expect(message.ack).not.toHaveBeenCalled();expect((await sourceDb.prepare('SELECT * FROM scheduled_job_items ORDER BY id').all()).results).toEqual(before);await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());};
  let clock:ReturnType<typeof vi.spyOn>|undefined;
  try {
    const accepted=await handleWorkerFetch(new Request('http://localhost:5173/api/settings/x-collection/run-now',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Idempotency-Key':'maintenance-scheduled-finalizer'}}),fixture.runtime);
    expect(accepted.status,await accepted.clone().text()).toBe(202);const {runId,statusUrl}=await accepted.json() as {runId:string;statusUrl:string};
    await held('scheduledRuns',messages[0]);expect((await consume(messages[0])).ack).toHaveBeenCalledOnce();expect(messages).toHaveLength(2);
    expect(await sourceDb.prepare("SELECT status FROM scheduled_outbox WHERE run_id=? AND event_type='execute'").bind(runId).first('status')).toBe('failed');
    await held('scheduledDispatch',messages[1]);failSend=false;
    await sourceDb.prepare("CREATE TRIGGER task44_scheduled_finalize_abort BEFORE INSERT ON settings WHEN NEW.key='x_collection_last_run' BEGIN SELECT RAISE(ABORT,'original_finalize_failure'); END").run();
    const failed=await consume(messages[1]);expect(failed.retry).toHaveBeenCalled();expect(failed.ack).not.toHaveBeenCalled();
    const repository=new D1ScheduledJobRepository(sourceDb),run=(await repository.readRun(runId))!,item=(await sourceDb.prepare('SELECT * FROM scheduled_job_items WHERE run_id=?').bind(runId).first())!;
    expect(run.status).toBe('failed');expect(item.attempts).toBe(1);expect(item.result_json).not.toBeNull();
    expect(await sourceDb.prepare("SELECT reconciled_at FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile'").bind(runId).first('reconciled_at')).toBeNull();
    await held('scheduledDispatch',messages[1]);
    clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+100*86400000);
    for(const policy of ['scheduled-outbox','scheduled-job-items','scheduled-job-runs'])await runDataRetentionPolicyPrune(fixture.runtime,policy);
    expect(await sourceDb.prepare('SELECT result_json FROM scheduled_job_items WHERE id=?').bind(item.id).first('result_json')).toBe(item.result_json);
    expect(await sourceDb.prepare("SELECT count(*) n FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile' AND reconciled_at IS NULL").bind(runId).first('n')).toBe(1);
    await sourceDb.prepare('DROP TRIGGER task44_scheduled_finalize_abort').run();
    const newer=Date.now();await sourceDb.prepare("INSERT INTO settings(key,value) VALUES('x_collection_last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(newer)).run();
    const dispatched=await new ScheduledJobCoordinator(fixture.runtime).dispatchPending();expect(dispatched.dispatched).toBe(1);
    // Sending the original terminal follow-up does not itself discharge it.
    expect(await sourceDb.prepare("SELECT status,reconciled_at FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile'").bind(runId).first()).toEqual({status:'dispatched',reconciled_at:null});
    const recovered=await consume(messages.at(-1));expect(recovered.ack).toHaveBeenCalledOnce();expect(recovered.retry).not.toHaveBeenCalled();
    expect(await sourceDb.prepare('SELECT attempts,result_json FROM scheduled_job_items WHERE id=?').bind(item.id).first()).toEqual({attempts:1,result_json:item.result_json});
    expect((await repository.readRun(runId))!.finished_at).toBe(run.finished_at);
    expect(await sourceDb.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first('value')).toBe(String(newer));
    expect(await sourceDb.prepare("SELECT reconciled_at FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile'").bind(runId).first('reconciled_at')).not.toBeNull();
    const result=await handleWorkerFetch(new Request(new URL(statusUrl,'http://localhost:5173'),{headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`}}),fixture.runtime);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({status:'failed'});
    await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());
    await expect(repository.createRun({jobType:'x_collection',source:'manual',idempotencyKey:'late-after-stop'})).rejects.toThrow(/maintenance/);
  }finally{clock?.mockRestore();await sourceDb.prepare('DROP TRIGGER IF EXISTS task44_scheduled_finalize_abort').run();await sourceDb.prepare('DELETE FROM content_transitions').run();for(const row of previous)if(row.value===null)await sourceDb.prepare('DELETE FROM settings WHERE key=?').bind(row.key).run();else await sourceDb.prepare('UPDATE settings SET value=? WHERE key=?').bind(row.value,row.key).run();fixture.close();}
},30000);
it.each(['playlist_source_stop','playlist_native_owner'] as const)('%s preserves original work completion and pending continuation',async scenario=>{
  const native=scenario==='playlist_native_owner',site=native?'luvdia':'otw',db=native?targetDb:sourceDb,candidateId='youtube:NewVideo001';
  await seedPublicationCatalog();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,provider,external_video_id,candidate_kind,status,classification,availability_status,review_input_json,first_discovered_at,last_discovered_at,retention_expires_at,version,created_at,updated_at) VALUES(?,'youtube','NewVideo001','official_video','needs_input','eligible','unknown',?,1,1,9999999999999,0,1,1)").bind(candidateId,JSON.stringify(review)).run();
  await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
  const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'},routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb)),routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  if(native){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());await capturing(routeSource);await installInactiveBaseline(routeSource,routeTarget);await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'playlist-ready',Date.now()+60000),Date.now());await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);}
  let gets=0;
  const fixture=await pendingAdminFixture(site,db,async input=>{gets++;const url=new URL(String(input));
    if(url.pathname==='/youtube/v3/playlists')return Response.json({items:[{id:'PL1234567891',snippet:{title:'Original work queue',channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music'},contentDetails:{itemCount:1},status:{privacyStatus:'public'}}]});
    if(url.pathname==='/youtube/v3/playlistItems')return Response.json({items:[{id:'original-work-item',contentDetails:{videoId:'NewVideo001'},snippet:{position:0}}],pageInfo:{totalResults:1}});
    expect(url.pathname).toBe('/youtube/v3/videos');return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original collected work video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });
  const messages:unknown[]=[];Object.assign(fixture.runtime,{YOUTUBE_API_KEY:'fixture-only',GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false',CLOUDFLARE_ACCOUNT_ID:'',CLOUDFLARE_D1_TOKEN:'',CONTENT_TRANSITION_PEER:undefined,OTW_PLAY_INGESTION_QUEUE:{send:async(body:unknown)=>{messages.push(body);}}});
  const api=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/${path}`,{method,headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  const consume=async(body:unknown)=>{const message={body,ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:fixture.runtime.SITE_INGESTION_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);return message;};
  const snapshot=async()=>({queues:(await db.prepare("SELECT * FROM music_playlist_work_queues WHERE playlist_id='PL1234567891'").all()).results,batches:(await db.prepare("SELECT b.* FROM music_playlist_work_batches b JOIN music_playlist_work_queues q ON q.id=b.queue_id WHERE q.playlist_id='PL1234567891'").all()).results});
  const held=async(body:unknown,key:'playlistQueues'|'playlistBatches')=>{const before=await snapshot(),count=gets;await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await expect(routeSource.stopMaintenance(plan.id,Date.now())).rejects.toThrow(new RegExp(key));expect(await snapshot()).toEqual(before);const delivery=await consume(body);expect(delivery.retry).toHaveBeenCalledOnce();expect(gets).toBe(count);await routeSource.cancelMaintenance(plan.id,routePlan.generation,Date.now());};
  try {
    const added=await api('work-queues',{urls:['PL1234567891']});expect(added.status,await added.clone().text()).toBe(202);const queueId=(await added.json() as {data:Array<{queueId:string}>}).data[0]!.queueId;
    if(!native)await held(messages[0],'playlistQueues');
    expect((await consume(messages[0])).ack).toHaveBeenCalledOnce();
    const queue=(await api('work-queues').then(r=>r.json()) as {data:{queues:Array<{id:string;version:number}>}}).data.queues.find(q=>q.id===queueId)!;
    const started=await api(`work-queues/${queueId}/command`,{action:'start',expectedVersion:queue.version,idempotencyKey:'maintenance-work-start'});expect(started.status,await started.clone().text()).toBe(202);const batch=(await started.json() as {data:{id:string}}).data;
    const batchMessage=messages.at(-1);if(!native)await held(batchMessage,'playlistBatches');
    expect((await consume(batchMessage)).ack).toHaveBeenCalledOnce();expect(messages).toHaveLength(3);
    expect((await consume(messages[2])).ack).toHaveBeenCalledOnce();
    const read=await api(`work-batches/${batch.id}`);expect(read.status,await read.clone().text()).toBe(200);const current=(await read.json() as {data:{status:string;version:number;items:Array<{id:string;version:number;candidateId:string}>}}).data;
    expect(current.status).toBe('review');expect(current.items).toHaveLength(1);expect(current.items[0]!.candidateId).toBe(candidateId);
    const excluded=await api(`work-items/${encodeURIComponent(current.items[0]!.id)}`,{expectedVersion:current.items[0]!.version,disposition:'excluded',reason:'Original explicit review decision'},'PATCH');expect(excluded.status,await excluded.clone().text()).toBe(200);
    const completed=await api(`work-batches/${batch.id}/command`,{action:'complete',expectedVersion:current.version,idempotencyKey:'maintenance-work-complete',startNext:true});expect(completed.status,await completed.clone().text()).toBe(202);const finishMessage=messages.at(-1);
    if(!native)await held(finishMessage,'playlistBatches');
    await db.prepare("CREATE TRIGGER task44_work_link_abort BEFORE UPDATE OF next_batch_id ON music_playlist_work_batches WHEN NEW.next_batch_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'work_next_atomic'); END").run();
    expect((await consume(finishMessage)).ack).toHaveBeenCalledOnce();
    expect(await db.prepare('SELECT status,start_next,next_batch_id,lease_token,lease_until FROM music_playlist_work_batches WHERE id=?').bind(batch.id).first()).toEqual({status:'completed',start_next:1,next_batch_id:null,lease_token:null,lease_until:null});
    const finishedGets=gets;
    if(!native)await held(finishMessage,'playlistBatches');
    await db.prepare('DROP TRIGGER task44_work_link_abort').run();expect((await consume(finishMessage)).ack).toHaveBeenCalledOnce();expect(gets).toBe(finishedGets);
    const final=await api(`work-batches/${batch.id}`);expect(await final.json()).toMatchObject({data:{status:'completed',continuation:{requested:true,nextBatchId:'done'},progress:{total:1,excluded:1}}});
    expect(await db.prepare('SELECT status,page_token,scan_item_count FROM music_playlist_work_queues WHERE id=?').bind(queueId).first()).toEqual({status:'exhausted',page_token:null,scan_item_count:1});
    expect(await db.prepare('SELECT count(*) n FROM music_ai_review_batch_items WHERE candidate_id=?').bind(candidateId).first('n')).toBe(0);
    if(!native){const before=await snapshot();await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());expect(await snapshot()).toEqual(before);}
    else expect(await sourceDb.prepare("SELECT count(*) n FROM music_playlist_work_queues WHERE playlist_id='PL1234567891'").first('n')).toBe(0);
  }finally{await db.prepare('DROP TRIGGER IF EXISTS task44_work_link_abort').run();fixture.close();}
},30000);
it('ai_native_owning_batch preserves actual admission claim rollback result and daily budget without peer',async()=>{
  await seedPublicationCatalog();
  const candidateId='youtube:NewVideo001';
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES(?,'NewVideo001','needs_input','eligible',?,'playable',1,1,999,1,1,?)").bind(candidateId,`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls([],true);
  await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  let gets=0,posts=0;
  const fixture=await pendingAdminFixture('luvdia',targetDb,async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='generativelanguage.googleapis.com') {
      expect(init?.method).toBe('POST');posts++;
      return Response.json({status:'completed',outputs:[{type:'text',text:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:'Original analysed song',alternateTitles:[],originalArtists:[{name:'Original artist',sourceNames:[],entityKind:'person'}],tags:[]}},evidence:{song:[{source:'video',text:'Original video',timecode:'00:05'}]},warnings:[]}]})}],usage:{total_input_tokens:20,total_output_tokens:30}});
    }
    expect(url.pathname).toBe('/youtube/v3/videos');gets++;
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });
  const send=vi.fn().mockResolvedValue(undefined);
  Object.assign(fixture.runtime,{YOUTUBE_API_KEY:'fixture-only',GEMINI_API_KEY:'fixture-only',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_DAILY_LIMIT:'1',OTW_PLAY_AI_REVIEW_QUEUE:{send},CONTENT_TRANSITION_PEER:undefined});
  const api=async(path:string,body?:unknown,actor='luvdia-pending-admin')=>handleWorkerFetch(new Request(`http://localhost:5174/api/play/admin/ai-reviews${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),fixture.runtime);
  const consume=async(reviewId:string)=>{
    const message={body:{kind:'otw_play_ai_review',schemaVersion:1,reviewId},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:fixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
    return message;
  };
  try {
    const input={target:{candidateId},range:null,idempotencyKey:'native-original-review'};
    expect((await api('',input,'ordinary-member')).status).toBe(403);expect(gets).toBe(0);
    const accepted=await api('',input);expect(accepted.status,await accepted.clone().text()).toBe(202);
    const {data:{id}}=await accepted.json() as {data:{id:string}};
    expect(send).toHaveBeenCalledWith({kind:'otw_play_ai_review',schemaVersion:1,reviewId:id});expect(gets).toBe(1);expect(posts).toBe(0);
    await targetDb.prepare("CREATE TRIGGER task44_ai_claim_abort BEFORE INSERT ON music_ai_review_attempts BEGIN SELECT RAISE(ABORT,'task44_ai_claim_abort'); END").run();
    const failed=await consume(id);expect(failed.retry).toHaveBeenCalledOnce();expect(failed.ack).not.toHaveBeenCalled();
    expect(await targetDb.prepare('SELECT status,attempts,lease_token FROM music_ai_reviews WHERE id=?').bind(id).first()).toEqual({status:'queued',attempts:0,lease_token:null});
    expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_review_attempts WHERE review_id=?').bind(id).first('n')).toBe(0);expect(posts).toBe(0);
    await targetDb.prepare('DROP TRIGGER task44_ai_claim_abort').run();
    const done=await consume(id);expect(done.retry).not.toHaveBeenCalled();expect(done.ack).toHaveBeenCalledOnce();
    const result=await api(`/${id}`);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({data:{id,status:'succeeded',attempts:1,result:{videoAnalyzed:true}}});
    expect(await targetDb.prepare('SELECT outcome,finished_at IS NOT NULL finished FROM music_ai_review_attempts WHERE review_id=?').bind(id).first()).toEqual({outcome:'succeeded',finished:1});
    expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_permits').first('n')).toBe(0);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id GLOB 'ai-*' AND sealed=0").first('n')).toBe(0);
    const retry=await api('',input);expect(retry.status).toBe(200);expect(await retry.json()).toMatchObject({data:{id,status:'succeeded'}});
    expect((await consume(id)).ack).toHaveBeenCalledOnce();expect(gets).toBe(1);expect(posts).toBe(1);
    const budget=await api('',{...input,idempotencyKey:'native-budget-review',force:true});expect(budget.status,await budget.clone().text()).toBe(202);
    const budgetId=(await budget.json() as {data:{id:string}}).data.id;expect(budgetId).not.toBe(id);
    const denied=await consume(budgetId);expect(denied.retry).toHaveBeenCalledOnce();expect(denied.ack).not.toHaveBeenCalled();
    expect(await targetDb.prepare('SELECT status,error_code,attempts FROM music_ai_reviews WHERE id=?').bind(budgetId).first()).toEqual({status:'retry_wait',error_code:'daily_limit',attempts:0});
    expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_review_attempts').first('n')).toBe(1);expect(posts).toBe(1);
    expect(fixture.runtime.CONTENT_TRANSITION_PEER).toBeUndefined();
    expect(await sourceDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
  } finally {await targetDb.prepare('DROP TRIGGER IF EXISTS task44_ai_claim_abort').run();fixture.close();}
},25000);
it.each(['ai_unknown_legacy','ai_response_recorded','ai_source_response','maintenance_prepared_ai','ai_local_unknown','ai_local_response','ai_local_source_resume','ai_local_abort','ai_local_known_retry','ai_local_retry_abort'] as const)('task4.4 preserves original running AI responsibility %s',async scenario=>{
  const recorded=scenario==='ai_response_recorded',knownRetry=scenario==='ai_local_known_retry'||scenario==='ai_local_retry_abort';
  const sourceCurrent=scenario==='ai_source_response',local=scenario.startsWith('ai_local_'),localResponse=scenario==='ai_local_response'||knownRetry,candidateId=sourceCurrent||scenario==='maintenance_prepared_ai'||local?'youtube:NewVideo001':'review-save';
  await seedPublicationCatalog();
  if(scenario==='ai_local_source_resume')await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Unrelated')").run();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES(?,'NewVideo001','needs_input','eligible',?,'playable',1,1,999,1,1,?)").bind(candidateId,`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  let issued!:()=>void,interrupt!:(reason:Error)=>void,complete!:(response:Response)=>void,posts=0,gets=0;
  const entered=new Promise<void>(resolve=>{issued=resolve;}),response=new Promise<Response>((resolve,reject)=>{interrupt=reject;complete=resolve;});
  const sourceFixture=await pendingAdminFixture('otw',sourceDb,async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='generativelanguage.googleapis.com'){expect(init?.method).toBe('POST');posts++;if(scenario==='ai_local_retry_abort'&&posts>1)return originalResponse();issued();return response;}
    expect(url.pathname).toBe('/youtube/v3/videos');gets++;
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Selected music',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });
  Object.assign(sourceFixture.runtime,{YOUTUBE_API_KEY:'fixture-only',GEMINI_API_KEY:'fixture-only',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_QUEUE:{send:vi.fn().mockResolvedValue(undefined)},CONTENT_TRANSITION_PEER:relayBindings.TARGET_RELAY});
  const api=async(f:typeof sourceFixture,site:'otw'|'luvdia',path:string,body?:unknown,sub=`${site}-pending-admin`)=>handleWorkerFetch(new Request(`http://localhost:${site==='otw'?5173:5174}/api/play/admin/ai-reviews${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await f.token(sub)}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.runtime);
  let targetFixture:typeof sourceFixture|null=null,queue:Promise<void>|null=null;
  const originalResponse=()=>Response.json({status:'completed',outputs:[{type:'text',text:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:'Original analysed song',alternateTitles:[],originalArtists:[{name:'Original artist',sourceNames:[],entityKind:'person'}],tags:[]}},evidence:{song:[{source:'video',text:'Original video',timecode:'00:05'}]},warnings:[]}]})}],usage:{total_input_tokens:20,total_output_tokens:30}});
  try {
    const started=await api(sourceFixture,'otw','',{target:{candidateId},range:null,idempotencyKey:'legacy-unknown-review'});expect(started.status,await started.clone().text()).toBe(202);
    const {data:accepted}=await started.json() as {data:{id:string}};expect(gets).toBe(1);
    const message={body:{kind:'otw_play_ai_review',schemaVersion:1,reviewId:accepted.id},ack:vi.fn(),retry:vi.fn()};
    // The original claim really uses this clock. The bound peer uses its actual
    // clock, so an expired original claim is valid across both local Workers.
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()-300000);
    queue=handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
    try {await Promise.race([entered,queue.then(()=>{throw new Error('Original AI Queue exited before issuing its POST');})]);} finally {clock.mockRestore();}expect(posts).toBe(1);
    if(scenario==='maintenance_prepared_ai'||local) {
      await sourceDb.prepare('DELETE FROM content_transitions').run();await targetDb.prepare('DELETE FROM content_transitions').run();
      const routePlan={...plan,sourceResource:'otw-db',targetResource:'luvdia-db'};
      const routeSource=new D1TransitionRepository(sourceDb,'otw','otw-db','otw-bucket',sourceAvailability,catalogImportProjection,new D1AiReviewAdoption(sourceDb));
      const routeTarget=new D1TransitionRepository(targetDb,'luvdia','luvdia-db','luvdia-bucket',targetAvailability,catalogImportProjection);
      await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
      const original=await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(accepted.id).first();
      const attempts=(await sourceDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).all()).results;
      expect((await routeSource.readMaintenanceBlockers(plan.id)).aiReviews).toBe(1);
      await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));
      const proof=await routeSource.stopMaintenance(plan.id,Date.now());
      expect(proof.stop.blockers.aiReviews).toBe(0);
      expect((await routeSource.readTransition(plan.id)).phase).toBe('prepared');
      const row=(await sourceDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.ai.unknown'").first<{operation_id:string;payload_hash:string}>())!;
      const adopted=await routeSource.exportOperation(plan.id,row.operation_id);
      expect(adopted.attempt).toMatchObject({status:'unknown'});expect(adopted.outcome).toBeNull();
      expect(adopted.payload).toMatchObject({reviewId:accepted.id,issuance:'issuance_unknown'});
      await capturing(routeSource);
      if(local) {
        await installInactiveBaseline(routeSource,routeTarget);
        await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'stopped-ai-readiness',Date.now()+60000),Date.now());
        if(localResponse){complete(knownRetry?Response.json({error:{message:'Original known rate limit'}},{status:429}):originalResponse());await queue;queue=null;}
        const fence=await routeSource.freeze(plan.id,Date.now());await routeTarget.installFence(fence);
        for(const op of await routeSource.exportFrozenOperations(plan.id))await routeTarget.receiveOperation(op);
        await transferStaticProof();await routeTarget.installCommittedState(plan.id);
        if(scenario==='ai_local_abort'||scenario==='ai_local_retry_abort') {
          if(!knownRetry){interrupt(new Error('Original POST result remains unknown during abort'));await queue;queue=null;}
          const frozen=await routeSource.readJournal(plan.id);
          await routeSource.archiveSource(plan.id);expect(await routeTarget.abortTargetBeforeActivation(plan.id,Date.now())).not.toBeNull();
          expect(await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).toEqual({resumed:true});
          if(knownRetry) {
            sourceFixture.runtime.CONTENT_TRANSITION_PEER=undefined;
            message.ack.mockClear();message.retry.mockClear();
            const consumed=(await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview.response') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first<string>('value'))!;
            await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
            expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalledOnce();expect(posts).toBe(1);
            expect(await sourceDb.prepare('SELECT status,attempts,error_code FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual({status:'retry_wait',attempts:1,error_code:'provider_rate_limit'});
            expect((await routeSource.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
            const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31000);message.retry.mockClear();
            try{await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);}finally{clock.mockRestore();}
            expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(posts).toBe(2);expect(gets).toBe(1);
            expect(await sourceDb.prepare('SELECT status,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual({status:'succeeded',attempts:2});
            expect(await sourceDb.prepare('SELECT count(*) n FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).first('n')).toBe(2);
            expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
            expect(await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview.response') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBe(consumed);
            expect(await routeSource.readJournal(plan.id)).toEqual(frozen);expect(await routeSource.readSourceFence(plan.id)).toEqual(fence);return;
          }
          Object.assign(sourceFixture.runtime,{CONTENT_TRANSITION_PEER:undefined,GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false'});
          const latest=await api(sourceFixture,'otw',`?candidateId=${candidateId}`);expect(latest.status,await latest.clone().text()).toBe(200);
          const dto=(await latest.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;
          expect(dto).toMatchObject({status:'running',result:null,recovery:{state:'outcome_unknown',issuance:'issuance_unknown'}});
          const {state:_state,...evidence}=dto.recovery!;void _state;
          const decision={...evidence,decision:'close_unknown',idempotencyKey:'source-abort-close'};
          expect((await api(sourceFixture,'otw',`/${accepted.id}/close-unknown`,decision,'ordinary-user')).status).toBe(403);
          const closed=await api(sourceFixture,'otw',`/${accepted.id}/close-unknown`,decision);expect(closed.status,await closed.clone().text()).toBe(200);
          expect(await closed.json()).toMatchObject({data:{status:'running',result:null,recovery:{state:'closed_by_admin'}}});
          expect((await api(sourceFixture,'otw',`/${accepted.id}/close-unknown`,decision)).status).toBe(200);
          message.ack.mockClear();message.retry.mockClear();
          await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
          expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
          expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(original);
          expect((await sourceDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).all()).results).toEqual(attempts);
          expect(await routeSource.readJournal(plan.id)).toEqual(frozen);expect(await routeSource.readSourceFence(plan.id)).toEqual(fence);
          expect((await routeSource.exportOperation(plan.id,row.operation_id)).outcome).toMatchObject({outcome:'administratively_closed',sideEffectReconciled:true});
          expect(posts).toBe(1);expect(gets).toBe(1);return;
        }
        await expect(routeTarget.activate(plan.id)).rejects.toThrow(/target_activation_proof_conflict|malformed JSON/);
        expect((await routeTarget.readTransition(plan.id)).phase).toBe('source_fenced');
        // The real configured relay pulls the original control; no caller-built
        // proof can authorize this installation. Activation was still closed.
        expect(await relayBindings.TARGET_RELAY.receiveOperation(plan.id,row.operation_id,row.payload_hash)).toMatchObject({accepted:true});
        const control=new D1AiUnknownControl(targetDb,'luvdia','luvdia-db');
        await expect(control.localStage(plan.id,row.operation_id,row.payload_hash)).rejects.toThrow(/not activated/);
        await routeTarget.activate(plan.id);
        const installed=(await control.localStage(plan.id,row.operation_id,row.payload_hash))!;
        expect(installed.handoff?.maintenanceDigest).toBe(fence.maintenanceDigest);
        if(!localResponse){complete(originalResponse());await queue;queue=null;}
        expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalled();
        expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(original);
        expect((await sourceDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).all()).results).toEqual(attempts);
        const sealed=(await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first<string>('value'))!;
        if(!localResponse){expect(JSON.parse(sealed).lateResponse).toMatchObject({hash:expect.any(String)});expect(JSON.parse(sealed).response).toBeNull();}
        expect(await control.localStage(plan.id,row.operation_id,row.payload_hash)).toEqual(installed);
        if(scenario==='ai_local_source_resume') {
          expect(await relayBindings.SOURCE_RELAY.resumeRemainingSource(plan.id)).toEqual({resumed:false,reason:'target_not_activated_or_archived'});
          expect(await sourceDb.prepare('SELECT maintenance_state FROM content_transitions').first('maintenance_state')).toBe('stopped');
          const journal=await routeSource.readJournal(plan.id),sourceFence=await routeSource.readSourceFence(plan.id);
          await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));
          expect(await relayBindings.SOURCE_RELAY.resumeRemainingSource(plan.id)).toEqual({resumed:true});
          expect(await sourceDb.prepare('SELECT maintenance_state FROM content_transitions').first('maintenance_state')).toBe('open');
          sourceFixture.runtime.CONTENT_TRANSITION_PEER=undefined;
          const unrelated=await sourceRouteSave({member_uid:90,date:'2026-10-15',title:'Independent source resumed',status:'휴방'});
          expect(unrelated.status,await unrelated.clone().text()).toBe(200);
          expect(await sourceDb.prepare('SELECT title FROM schedules WHERE member_uid=90').first('title')).toBe('Independent source resumed');
          const moved=await sourceRouteSave({member_uid:1,date:'2026-10-15',title:'Selected source must stay fenced',status:'휴방'});
          expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});
          message.ack.mockClear();message.retry.mockClear();
          await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
          expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
          expect(await createOtwPlayAiReviewService(sourceFixture.runtime).transitionState(accepted.id)).toBe('transferred');
          expect(await routeSource.recoveryPage(plan.id,'operation')).toEqual([]);
          await recoverTransitionWork(sourceFixture.runtime);
          expect(await routeSource.readJournal(plan.id)).toEqual(journal);expect(await routeSource.readSourceFence(plan.id)).toEqual(sourceFence);
          expect((await routeSource.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
          expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(row.operation_id).first('outcome_acknowledged')).toBe(0);
        }
        sourceFixture.close();targetFixture=await pendingAdminFixture('luvdia',targetDb,knownRetry?async(input,init)=>{expect(new URL(String(input)).hostname).toBe('generativelanguage.googleapis.com');expect(init?.method).toBe('POST');posts++;return originalResponse();}:undefined);
        Object.assign(targetFixture.runtime,{YOUTUBE_API_KEY:'',GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false',CONTENT_TRANSITION_PEER:undefined});
        const delivery={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:row.operation_id,payloadHash:row.payload_hash},ack:vi.fn(),retry:vi.fn()};
        if(knownRetry) {
          const latest=await api(targetFixture,'luvdia',`?candidateId=${candidateId}`);expect(latest.status,await latest.clone().text()).toBe(200);
          const pending=(await latest.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;expect(pending).toMatchObject({status:'retry_wait',attempts:1,continuation:{state:'confirmation_required'}});expect(pending.recovery).toBeUndefined();
          await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(delivery.retry).toHaveBeenCalledOnce();expect(posts).toBe(1);expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
          Object.assign(targetFixture.runtime,{GEMINI_API_KEY:'fixture-only',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_DAILY_LIMIT:'1',OTW_PLAY_AI_REVIEW_QUEUE:{send:vi.fn().mockResolvedValue(undefined)}});
          const {state:_state,...identity}=pending.continuation!;void _state;
          const confirmed=await api(targetFixture,'luvdia',`/${accepted.id}/resume-unissued`,{...identity,decision:'resume_unissued',idempotencyKey:'resume-recorded-retry'});expect(confirmed.status,await confirmed.clone().text()).toBe(202);
          const execution=(await confirmed.json() as {data:{id:string}}).data.id;expect(execution).not.toBe(accepted.id);expect(posts).toBe(1);
          delivery.retry.mockClear();const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now+31000);
          try{await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);}finally{clock.mockRestore();}
          expect(delivery.ack).toHaveBeenCalledOnce();expect(delivery.retry).not.toHaveBeenCalled();
          expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toMatchObject({outcome:'committed',aiResume:{executionId:execution,status:'succeeded'}});
          expect(await targetDb.prepare('SELECT status,attempts FROM music_ai_reviews WHERE id=?').bind(execution).first()).toEqual({status:'succeeded',attempts:2});expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_review_attempts').first('n')).toBe(1);
          await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(delivery.ack).toHaveBeenCalledTimes(2);expect(posts).toBe(2);expect(gets).toBe(1);
          expect(await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBe(sealed);expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(original);return;
        }
        if(!localResponse) {
          const latest=await api(targetFixture,'luvdia',`?candidateId=${candidateId}`);expect(latest.status,await latest.clone().text()).toBe(200);
          const dto=(await latest.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;
          expect(dto).toMatchObject({status:'running',recovery:{state:'outcome_unknown'}});
          const {state:_state,...evidence}=dto.recovery!;void _state;
          const input={...evidence,decision:'close_unknown',idempotencyKey:'local-close-original'};
          expect((await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,input,'ordinary-user')).status).toBe(403);
          expect((await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,{...input,evidenceHash:'0'.repeat(64)})).status).toBe(409);
          const failed=vi.spyOn(D1AiUnknownControl.prototype,'finishDecision').mockRejectedValueOnce(new Error('Interrupted after own durable administrator decision'));
          try{expect((await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,input)).status).toBe(409);}finally{failed.mockRestore();}
          expect((await routeTarget.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
          await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);
          expect(delivery.ack).toHaveBeenCalledOnce();expect(delivery.retry).not.toHaveBeenCalled();
          const result=await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,input);expect(result.status,await result.clone().text()).toBe(200);
          const body=await result.json();expect(body).toMatchObject({data:{status:'running',recovery:{state:'closed_by_admin'}}});
          expect(await(await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,input)).json()).toEqual(body);
          expect(await targetDb.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.aiDecision.actorId') FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first("json_extract(envelope_json,'$.nativeReceipt.aiDecision.actorId')")).toBe('luvdia-pending-admin');
        } else {
          await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);
          expect(delivery.ack).toHaveBeenCalledOnce();expect(delivery.retry).not.toHaveBeenCalled();
          const read=await api(targetFixture,'luvdia',`/${accepted.id}`);expect(read.status,await read.clone().text()).toBe(200);
          expect(await read.json()).toMatchObject({data:{status:'succeeded',result:{songs:[{values:{song:{title:'Original analysed song'}}}]}}});
        }
        expect(await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview') value FROM content_transition_operations WHERE operation_id=?").bind(row.operation_id).first('value')).toBe(sealed);
        expect(sealed).not.toContain('luvdia-pending-admin');expect((await routeSource.exportOperation(plan.id,row.operation_id)).outcome).toBeNull();
        expect(await targetDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(row.operation_id).first('outcome_acknowledged')).toBe(1);
        await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);
        expect(delivery.ack).toHaveBeenCalledTimes(2);expect(delivery.retry).not.toHaveBeenCalled();
        expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);expect(posts).toBe(1);expect(gets).toBe(1);return;
      }
      interrupt(new Error('Original POST response remained unknown at final maintenance stop'));await queue;queue=null;
      expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalled();
      expect(await sourceDb.prepare('SELECT * FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(original);
      expect((await sourceDb.prepare('SELECT * FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).all()).results).toEqual(attempts);
      await expect(sourceDb.prepare("UPDATE music_ai_reviews SET status='failed',lease_token=NULL,lease_until=NULL WHERE id=?").bind(accepted.id).run()).rejects.toThrow(/maintenance_stopped/);
      const readback=await api(sourceFixture,'otw',`/${accepted.id}`);expect(readback.status,await readback.clone().text()).toBe(200);
      expect(await readback.json()).toMatchObject({data:{recovery:{state:'outcome_unknown',issuance:'issuance_unknown',operationId:row.operation_id}}});
      const rejected=await api(sourceFixture,'otw','',{target:{candidateId},range:null,idempotencyKey:'maintenance-new-analysis'});
      expect(rejected.status).toBe(503);expect(await rejected.json()).toMatchObject({error:{code:'CONTENT_MAINTENANCE'}});
      message.ack.mockClear();message.retry.mockClear();
      await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
      expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalledOnce();
      expect(await routeSource.exportOperation(plan.id,row.operation_id)).toEqual(adopted);
      expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);expect(posts).toBe(1);expect(gets).toBe(1);return;
    }
    const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
    if(sourceCurrent) {
      await routeSource.adoptPendingAiReview(plan.id,accepted.id);
      const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.ai.unknown'").first<string>('operation_id'))!;
      complete(originalResponse());await queue;queue=null;expect(message.retry).toHaveBeenCalled();expect(message.ack).not.toHaveBeenCalled();
      expect(await routeSource.recoveryTransitions()).toContain(plan.id);
      expect(await routeSource.recoveryPage(plan.id,'operation')).toEqual(expect.arrayContaining([expect.objectContaining({recordId:operationId})]));
      const original=await sourceDb.prepare('SELECT status,lease_token,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first();
      await sourceDb.prepare("CREATE TRIGGER task44_ai_source_abort BEFORE UPDATE ON music_ai_reviews WHEN NEW.status='succeeded' BEGIN SELECT RAISE(ABORT,'ai_source_result_atomic'); END").run();
      message.retry.mockClear();sourceFixture.runtime.OTW_PLAY_AI_REVIEW_ENABLED='false';
      await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);
      expect(message.retry).toHaveBeenCalledOnce();expect(message.ack).not.toHaveBeenCalled();expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toBeNull();
      expect(await sourceDb.prepare('SELECT status,lease_token,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(original);
      expect(await sourceDb.prepare('SELECT outcome,finished_at FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).first()).toEqual({outcome:'running',finished_at:null});
      await sourceDb.prepare('DROP TRIGGER task44_ai_source_abort').run();message.retry.mockClear();
      const resume=AiReviewService.prototype.resumeOriginalResponse,failures:string[]=[];
      const diagnosis=vi.spyOn(AiReviewService.prototype,'resumeOriginalResponse').mockImplementation(async function(this:AiReviewService,...args){try{return await resume.apply(this,args);}catch(error){failures.push(error instanceof Error?`${error.message}\n${error.stack}\n${String(error.cause)}`:String(error));throw error;}});
      try {await handleWorkerQueue({queue:sourceFixture.runtime.SITE_AI_REVIEW_QUEUE_NAME,messages:[message]} as unknown as MessageBatch<unknown>,sourceFixture.runtime);}finally{diagnosis.mockRestore();}
      expect(message.ack,failures.join('\n')).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      const local=await api(sourceFixture,'otw',`/${accepted.id}`);expect(local.status,await local.clone().text()).toBe(200);expect(await local.json()).toMatchObject({data:{status:'succeeded',result:{songs:[{values:{song:{title:'Original analysed song'}}}]}}});
      expect(await sourceDb.prepare('SELECT status,lease_token,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual({status:'succeeded',lease_token:null,attempts:1});
      expect(await sourceDb.prepare('SELECT outcome FROM music_ai_review_attempts WHERE review_id=?').bind(accepted.id).first('outcome')).toBe('succeeded');
      expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toMatchObject({outcome:'committed',sideEffectReconciled:true,aiReviewResult:{disposition:'response_consumed'}});
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const op of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(op);
      for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);sourceFixture.close();
      targetFixture=await pendingAdminFixture('luvdia',targetDb);Object.assign(targetFixture.runtime,{YOUTUBE_API_KEY:'',GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});
      const operation=await routeTarget.exportOperation(plan.id,operationId),delivery={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(delivery.ack).toHaveBeenCalledOnce();expect(delivery.retry).not.toHaveBeenCalled();
      const transferred=await api(targetFixture,'luvdia',`/${accepted.id}`);expect(transferred.status,await transferred.clone().text()).toBe(200);expect(await transferred.json()).toMatchObject({data:{status:'succeeded',result:{songs:[{values:{song:{title:'Original analysed song'}}}]}}});
      expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);expect(posts).toBe(1);expect(gets).toBe(1);return;
    }
    const frozen=await routeSource.freeze(plan.id,Date.now());await routeTarget.installFence(frozen);
    const operations=await routeSource.exportFrozenOperations(plan.id),operation=operations.find(o=>o.codec.id==='otw-play.ai.unknown')!;
    expect(operation.payload).toMatchObject({action:'adopt_unknown',reviewId:accepted.id,issuance:'issuance_unknown'});expect(operation.attempt).toMatchObject({status:'unknown'});
    const sourceEvidence=await sourceDb.prepare('SELECT input_hash,lease_token,status,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first();
    for(const op of operations) await routeTarget.receiveOperation(op);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    if(recorded) complete(originalResponse());
    else interrupt(new Error('Original response was lost'));
    await queue;queue=null;expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalled();sourceFixture.close();
    targetFixture=await pendingAdminFixture('luvdia',targetDb);Object.assign(targetFixture.runtime,{YOUTUBE_API_KEY:'',GEMINI_API_KEY:'',OTW_PLAY_AI_REVIEW_ENABLED:'false',OTW_PLAY_AI_REVIEW_QUEUE:{send:vi.fn().mockResolvedValue(undefined)},CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});
    if(recorded) {
      expect((await api(targetFixture,'luvdia',`/${accepted.id}`)).status).toBe(409);
      const {attemptId,requestHash,evidenceHash,issuance}=operation.payload;
      expect((await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,{operationId:operation.operationId,attemptId,requestHash,evidenceHash,issuance,decision:'close_unknown',idempotencyKey:'response-already-won'})).status).toBe(409);
      await targetDb.prepare("CREATE TRIGGER task44_ai_result_abort BEFORE UPDATE ON content_historical_records WHEN NEW.source_table='music_ai_reviews' BEGIN SELECT RAISE(ABORT,'ai_required_history_atomic'); END").run();
      const delivery={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:operation.operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);
      expect(delivery.retry).toHaveBeenCalledOnce();expect(delivery.ack).not.toHaveBeenCalled();expect((await routeTarget.exportOperation(plan.id,operation.operationId)).outcome).toBeNull();
      expect(await targetDb.prepare("SELECT json_extract(record_json,'$.values.status') status FROM content_historical_records WHERE source_table='music_ai_reviews'").first('status')).toBe('running');
      await targetDb.prepare('DROP TRIGGER task44_ai_result_abort').run();delivery.retry.mockClear();
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(delivery.ack).toHaveBeenCalledOnce();expect(delivery.retry).not.toHaveBeenCalled();
      const completed=await api(targetFixture,'luvdia','?candidateId=review-save');expect(completed.status,await completed.clone().text()).toBe(200);
      expect(await completed.json()).toMatchObject({data:{status:'succeeded',result:{songs:[{values:{song:{title:'Original analysed song'}}}]}}});
      expect((await routeSource.exportOperation(plan.id,operation.operationId)).outcome).toMatchObject({outcome:'committed',aiReviewResult:{disposition:'response_consumed',status:'succeeded'}});
      expect((await routeSource.exportOperation(plan.id,operation.operationId)).attempt).toMatchObject({status:'completed'});
      expect(await targetDb.prepare("SELECT json_extract(record_json,'$.values.result_json.songs[0].values.song.title') title FROM content_historical_records WHERE source_table='music_ai_reviews'").first('title')).toBe('Original analysed song');
      expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
      expect(await sourceDb.prepare('SELECT input_hash,lease_token,status,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(sourceEvidence);
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[delivery]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(posts).toBe(1);expect(gets).toBe(1);return;
    }
    const read=await api(targetFixture,'luvdia','?candidateId=review-save');expect(read.status,await read.clone().text()).toBe(200);
    const dto=(await read.json() as {data:import('@contracts/otw-play-ai-review').AiReviewDto}).data;
    expect(dto).toMatchObject({status:'running',result:null,recovery:{state:'outcome_unknown',issuance:'issuance_unknown'}});
    const {state:_state,...identity}=dto.recovery!;void _state;const decision={...identity,decision:'close_unknown',idempotencyKey:'close-original-unknown'};
    const denied=await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,decision,'ordinary-user');expect(denied.status).toBe(403);
    const wrong=await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,{...decision,evidenceHash:'0'.repeat(64)});expect(wrong.status).toBe(409);
    const interrupted=vi.spyOn(D1AiUnknownControl.prototype,'finishDecision').mockRejectedValueOnce(new Error('Lost response after original source decision CAS'));
    try {expect((await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,decision)).status).toBe(409);} finally {interrupted.mockRestore();}
    expect((await routeTarget.exportOperation(plan.id,operation.operationId)).outcome).toBeNull();
    expect((await new D1AiUnknownControl(sourceDb,'otw','otw-db').transfer(plan.id,operation.operationId,operation.payloadHash)).closure).not.toBeNull();
    const recoveryMessage={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:operation.operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[recoveryMessage]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(recoveryMessage.ack).toHaveBeenCalledOnce();expect(recoveryMessage.retry).not.toHaveBeenCalled();
    const done=await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,decision);expect(done.status,await done.clone().text()).toBe(200);
    const result=await done.json();expect(result).toMatchObject({data:{status:'running',result:null,recovery:{state:'closed_by_admin',issuance:'issuance_unknown'}}});expect(await(await api(targetFixture,'luvdia',`/${accepted.id}/close-unknown`,decision)).json()).toEqual(result);
    const terminal=await routeTarget.exportOperation(plan.id,operation.operationId);expect(terminal.outcome).toMatchObject({outcome:'administratively_closed',sideEffectReconciled:true});expect(terminal.attempt).toEqual(operation.attempt);
    const privateDecision=await targetDb.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.aiDecision.actorId') actor FROM content_transition_operations WHERE operation_id=?").bind(operation.operationId).first('actor');expect(privateDecision).toBe('luvdia-pending-admin');
    expect(JSON.stringify(await routeSource.exportOperation(plan.id,operation.operationId))).not.toContain('luvdia-pending-admin');
    expect(await sourceDb.prepare('SELECT input_hash,lease_token,status,attempts FROM music_ai_reviews WHERE id=?').bind(accepted.id).first()).toEqual(sourceEvidence);
    expect(await targetDb.prepare('SELECT count(*) n FROM music_ai_reviews').first('n')).toBe(0);
    expect(await new D1AiReviewRepository(sourceDb).clearExpired(Date.now()+31*86400000)).toBe(0);
    const future=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);try{expect(await createOtwPlayAiReviewService(targetFixture.runtime).get(accepted.id)).toMatchObject({status:'running',recovery:{state:'closed_by_admin'}});}finally{future.mockRestore();}
    const retry={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:operation.operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:'luvdia-ops-background',messages:[retry]} as unknown as MessageBatch<unknown>,targetFixture.runtime);expect(retry.ack).toHaveBeenCalledOnce();expect(posts).toBe(1);expect(gets).toBe(1);
  } finally {interrupt(new Error('Fixture disposed'));if(queue)await queue;await sourceDb.prepare('DROP TRIGGER IF EXISTS task44_ai_source_abort').run();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_ai_result_abort').run();sourceFixture.close();targetFixture?.close();}
},30000);
it('task4.4 metadata_refresh_local commits the original source event and capture before terminal',async()=>{
  await seedPublicationCatalog();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save','NewVideo001','needs_input','eligible',?,1,1,999,1,1,?)").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  let gets=0;
  const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{expect(new URL(String(input)).pathname).toBe('/youtube/v3/videos');gets++;return Response.json({items:[]});});fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const request=async()=>handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/import-candidates/review-save',{method:'PATCH',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json'},body:JSON.stringify({action:'refresh_metadata',expectedVersion:0})}),fixture.runtime);
  try {
    await sourceDb.prepare("CREATE TRIGGER task44_refresh_local_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.candidate_id='review-save' BEGIN SELECT RAISE(ABORT,'refresh_local_event_atomic'); END").run();
    expect((await request()).status).toBe(503);const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.refresh'").first<string>('operation_id'))!;
    expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(await sourceDb.prepare("SELECT version FROM music_ingestion_candidates WHERE id='review-save'").first('version')).toBe(0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_journal WHERE row_table='music_ingestion_candidates' AND commit_seq>? AND json_extract(after_json,'$.version')=1").bind(boundary).first('n')).toBe(0);
    await sourceDb.prepare('DROP TRIGGER task44_refresh_local_abort').run();const saved=await request();expect(saved.status,await saved.clone().text()).toBe(200);const dto=await saved.json();expect(dto).toMatchObject({data:{version:1,status:'blocked'}});expect(await (await request()).json()).toEqual(dto);expect(gets).toBe(1);
    const receipt=(await routeSource.readCandidateMetadataReceipt(operationId))!;expect(receipt.operation.outcome?.outcome).toBe('committed');expect(await sourceDb.prepare("SELECT actor_user_id FROM music_ingestion_events WHERE candidate_id='review-save'").first('actor_user_id')).toBe('otw-pending-admin');
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    expect(await targetDb.prepare("SELECT version,status,reviewed_by_user_id FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:1,status:'blocked',reviewed_by_user_id:null});
    const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});expect(gets).toBe(1);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:receipt.operation.payloadHash},ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,{...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(1);
  } finally {await sourceDb.prepare('DROP TRIGGER IF EXISTS task44_refresh_local_abort').run();fixture.close();}
},25000);
it.each(['metadata_refresh_source','metadata_refresh_native','metadata_refresh_newer'] as const)('task4.4 preserves the original observation refresh and required event (%s)',async scenario=>{
  await seedPublicationCatalog();
  const transferred=scenario==='metadata_refresh_source',newer=scenario==='metadata_refresh_newer',videoId='NewVideo001',freshChannel=`UC${'q'.repeat(22)}`;
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save',?,'needs_input','eligible',?,'playable',1,1,999,1,1,?)").bind(videoId,`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  await sourceDb.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,created_at,updated_at) VALUES('video-matched','youtube',?,'Fresh approved channel','member_music','approved',1,1,1)").bind(freshChannel).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  expect(await targetDb.prepare("SELECT id FROM music_channels WHERE id='video-matched'").first('id')).toBeNull();
  let gets=0,activated=false,sourceFixture:Awaited<ReturnType<typeof pendingAdminFixture>>|null=null,targetFixture:Awaited<ReturnType<typeof pendingAdminFixture>>|null=null;
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);activated=true;};
  const seal=D1TransitionRepository.prototype.sealCandidateMetadataStage;
  const stage=vi.spyOn(D1TransitionRepository.prototype,'sealCandidateMetadataStage').mockImplementation(async function(this:D1TransitionRepository,...args){const result=await seal.apply(this,args);if(transferred&&!activated) await activate();return result;});
  const request=async(fixture:Awaited<ReturnType<typeof pendingAdminFixture>>,site:'otw'|'luvdia',body:unknown={action:'refresh_metadata',expectedVersion:0})=>handleWorkerFetch(new Request(`http://localhost:${site==='otw'?5173:5174}/api/play/admin/import-candidates/review-save`,{method:'PATCH',headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),fixture.runtime);
  try {
    if(transferred) {
      sourceFixture=await pendingAdminFixture('otw',sourceDb,async input=>{
        expect(new URL(String(input)).pathname).toBe('/youtube/v3/videos');gets++;
        expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.refresh'").first('n')).toBe(1);
        expect(await sourceDb.prepare("SELECT attempt FROM content_transition_chzzk_requests WHERE request_key=?").bind(`youtube:videos:0:${videoId}`).first('attempt')).toBe(1);
        await expect(routeSource.freeze(plan.id,Date.now())).rejects.toThrow(/Fence/);
        expect((await routeSource.readTransition(plan.id)).phase).toBe('target_ingress_ready');
        const save=await sourceRouteSave({member_uid:1,date:'2026-10-15',title:'Source still serving refresh stage',status:'휴방'});expect(save.status).toBe(200);
        return Response.json({items:[{id:videoId,snippet:{channelId:freshChannel,channelTitle:'Fresh approved channel',title:'Original fresh observation',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
      });sourceFixture.runtime.YOUTUBE_API_KEY='local-fixture-only';sourceFixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
      const accepted=await request(sourceFixture,'otw');expect(accepted.status,await accepted.clone().text()).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(activated).toBe(true);expect(gets).toBe(1);
      expect(await targetDb.prepare("SELECT verification_status FROM music_channels WHERE id='video-matched'").first('verification_status')).toBe('approved');
      sourceFixture.close();sourceFixture=null;
    }
    targetFixture=await pendingAdminFixture('luvdia',targetDb,async input=>{
      const url=new URL(String(input));
      if(url.pathname==='/youtube/v3/channels') {expect(transferred).toBe(true);return Response.json({items:[{id:freshChannel,snippet:{title:'Native current channel'}}]});}
      expect(url.pathname).toBe('/youtube/v3/videos');expect(url.searchParams.get('id')).toBe(videoId);gets++;return Response.json({items:[]});
    });targetFixture.runtime.YOUTUBE_API_KEY='local-fixture-only';targetFixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.SOURCE_RELAY;
    if(!transferred) {const accepted=await request(targetFixture,'luvdia');expect(accepted.status,await accepted.clone().text()).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(gets).toBe(0);await activate();}
    if(transferred) {
      const changed=await handleWorkerFetch(new Request('http://localhost:5174/api/play/admin/channels',{method:'PUT',headers:{Authorization:`Bearer ${await targetFixture.token('luvdia-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'refresh-native-channel-winner'},body:JSON.stringify({id:'video-matched',expectedVersion:0,externalChannelId:freshChannel,displayName:'Native current channel',channelRole:'member_music',verificationStatus:'revoked',active:false,entityIds:['publication-singer']})}),targetFixture.runtime);
      expect(changed.status,await changed.clone().text()).toBe(200);
    }
    if(newer) {const winner=await request(targetFixture,'luvdia',{action:'ignore',expectedVersion:0});expect(winner.status,await winner.clone().text()).toBe(200);}
    const operationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.refresh'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()},consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,targetFixture!.runtime);};
    if(!newer) {
      await targetDb.prepare(transferred?"CREATE TRIGGER task44_refresh_abort BEFORE INSERT ON content_historical_records WHEN NEW.source_table='music_ingestion_events' BEGIN SELECT RAISE(ABORT,'refresh_required_event_atomic'); END":"CREATE TRIGGER task44_refresh_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.candidate_id='review-save' BEGIN SELECT RAISE(ABORT,'refresh_required_event_atomic'); END").run();
      await consume();expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(await targetDb.prepare("SELECT version FROM music_ingestion_candidates WHERE id='review-save'").first('version')).toBe(0);
      if(!transferred) {const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);try{expect((await runDataRetentionPolicyPrune(targetFixture.runtime,'native-chzzk-read-detail',250)).deletedRows).toBe(0);}finally{clock.mockRestore();}}
      await targetDb.prepare('DROP TRIGGER task44_refresh_abort').run();
    }
    const beforeRetry=gets;await consume();expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();if(!newer) expect(gets).toBe(beforeRetry);expect(gets).toBe(1);
    const saved=(await routeTarget.readCandidateMetadataReceipt(operationId))!;expect(saved.operation.outcome).toMatchObject({outcome:newer?'conflicted':'committed',sideEffectReconciled:true,youtubeVideo:{reads:[{disposition:'consumed'}]}});
    if(transferred) {
      expect(await targetDb.prepare("SELECT version,status,classification,channel_id,reviewed_by_user_id FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:1,status:'ready',classification:'eligible',channel_id:freshChannel,reviewed_by_user_id:null});
      expect(await targetDb.prepare("SELECT verification_status,version FROM music_channels WHERE id='video-matched'").first()).toEqual({verification_status:'revoked',version:1});
      expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_ingestion_events' AND json_extract(record_json,'$.values.event_type')='candidate.metadata_refreshed'").first('n')).toBe(1);
      expect(await routeTarget.candidateMetadataEventExists(plan.id,operationId)).toBe(true);expect(await sourceDb.prepare("SELECT version,status FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:0,status:'needs_input'});
      expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
    } else {
      expect(await targetDb.prepare("SELECT version,status,availability_status FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({version:1,status:newer?'ignored':'blocked',availability_status:newer?'playable':'unavailable'});
      const repeated=await request(targetFixture,'luvdia');expect(repeated.status).toBe(newer?409:200);expect(gets).toBe(1);
      if(!newer) {
        const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);try{expect((await runDataRetentionPolicyPrune(targetFixture.runtime,'native-chzzk-read-detail',250)).deletedRows).toBe(1);}finally{clock.mockRestore();}
        expect((await request(targetFixture,'luvdia')).status).toBe(200);expect(gets).toBe(1);expect(saved.result?.status).toBe('blocked');
      }
    }
    await consume();expect(message.ack).toHaveBeenCalledOnce();expect(gets).toBe(1);
  } finally {stage.mockRestore();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_refresh_abort').run();sourceFixture?.close();targetFixture?.close();}
},25000);
it.each(['conversion_source','conversion_native','conversion_duplicate'] as const)('task4.4 preserves the original two-read conversion and outcome responsibility (%s)',async scenario=>{
  await seedPublicationCatalog();
  const transferred=scenario==='conversion_source',duplicate=scenario==='conversion_duplicate',videoId=transferred?'BulkMove001':duplicate?'PubVideo001':'NewVideo001',candidateId=transferred?'youtube:BulkMove001':'review-save';
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  if(transferred) {
    const repository=new D1IngestionRepository(sourceDb),preflight:import('@contracts/otw-play').OtwPlayPlaylistPreflightDto={playlistId:'PL1234567890',canonicalUrl:'https://www.youtube.com/playlist?list=PL1234567890',title:'Original conversion job',ownerChannelId:'UCowner',ownerChannelTitle:'Owner',itemCount:2,privacyStatus:'public',rangeStartPosition:0,rangeEndExclusive:2,nextRangeStart:null,requestedItemCount:2,estimatedPageCount:1,estimatedVideoBatchCount:1,hardCap:5000,requiresSplit:false,previousImport:null};
    const job=await repository.createJob({jobId:'review-bulk-job',actorUserId:'otw-pending-admin',input:{playlistUrl:preflight.canonicalUrl,mode:'all_new',idempotencyKey:'conversion-fixture'},preflight,now:1});
    await repository.recordPlaylistPage(await repository.readMessage(job.message.idempotencyKey),{items:[{playlistItemId:'conversion-item',videoId,position:0},{playlistItemId:'conversion-independent',videoId:'BulkStay001',position:1}],nextPageToken:null},2);
    await sourceDb.prepare("UPDATE music_ingestion_candidates SET status='ready',classification='eligible',channel_id=?,availability_status='playable',made_for_kids=0,review_input_json=? WHERE id=?").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review),candidateId).run();
    await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Unrelated')").run();
    await sourceDb.prepare("UPDATE music_ingestion_candidates SET status='needs_input',classification='eligible',channel_id=?,review_input_json=? WHERE id='youtube:BulkStay001'").bind(`UC${'p'.repeat(22)}`,JSON.stringify({...review,participants:[{subject:{kind:'member',memberUid:90},participantRole:'vocal',creditOrder:0}]})).run();
    await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save','NewVideo001','needs_input','eligible',?,1,1,999,1,1,?)").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  } else await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,made_for_kids,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES(?,?,'ready','eligible',?,'playable',0,1,1,999,1,1,?)").bind(candidateId,videoId,`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  let gets=0,activated=false;
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);activated=true;};
  const save=D1TransitionRepository.prototype.saveConversionPreflight;
  const stage=vi.spyOn(D1TransitionRepository.prototype,'saveConversionPreflight').mockImplementation(async function(this:D1TransitionRepository,...args){const result=await save.apply(this,args);if(transferred&&!activated) await activate();return result;});
  const site=transferred?'otw':'luvdia',fixture=await pendingAdminFixture(site,transferred?sourceDb:targetDb,async input=>{
    const url=new URL(String(input));expect(url.origin+url.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');expect(url.searchParams.get('id')).toBe(videoId);gets++;
    expect(await (transferred?sourceDb:targetDb).prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.convert'").first('n')).toBe(1);
    return Response.json({items:[{id:videoId,snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Approved channel',title:'Converted video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed',madeForKids:false}}]});
  });fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=transferred?relayBindings.TARGET_RELAY:relayBindings.SOURCE_RELAY;
  // Reuse the same authenticated fixture API token path as the owning editors.
  const token=await fixture.token(`${site}-pending-admin`);
  const post=(candidates=[{id:candidateId,expectedVersion:0},...(transferred?[{id:'youtube:BulkStay001',expectedVersion:0}]:[])])=>handleWorkerFetch(new Request(`http://localhost:${transferred?5173:5174}/api/play/admin/${transferred?'imports/review-bulk-job/convert':`import-candidates/${candidateId}/convert`}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(transferred?{candidates}:{expectedVersion:0})}),fixture.runtime);
  try {
    if(transferred) {
      await sourceDb.prepare("CREATE TRIGGER task44_conversion_job_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.job_id='review-bulk-job' AND NEW.candidate_id IS NULL AND NEW.event_type='candidate.convert.validation_failed' BEGIN SELECT RAISE(ABORT,'conversion_job_event_atomic'); END").run();
      expect((await post([{id:'review-save',expectedVersion:0}])).status).toBe(503);
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.conversion-outcome.local'").first('n')).toBe(0);
      await sourceDb.prepare('DROP TRIGGER task44_conversion_job_abort').run();
      const invalid=await post([{id:'review-save',expectedVersion:0}]);expect(invalid.status,await invalid.clone().text()).toBe(200);expect(await invalid.json()).toMatchObject({data:{results:[{candidateId:'review-save',outcome:'validation_failed',errorCode:'validation_failed'}]}});
      expect((await post([{id:'review-save',expectedVersion:0}])).status).toBe(200);expect(gets).toBe(0);
      expect(await sourceDb.prepare("SELECT count(*) n FROM music_ingestion_events WHERE job_id='review-bulk-job' AND candidate_id IS NULL AND event_type='candidate.convert.validation_failed'").first('n')).toBe(1);
    }
    const accepted=await post();expect(accepted.status,await accepted.clone().text()).toBe(transferred?200:409);expect(await accepted.json()).toMatchObject(transferred?{data:{results:[{candidateId,outcome:'accepted',errorCode:'CONTENT_ACCEPTED'},{candidateId:'youtube:BulkStay001',outcome:'stale',errorCode:'stale_write'}]}}:{error:{code:'CONTENT_ACCEPTED'}});
    expect(gets).toBe(transferred?1:0);if(!activated) await activate();
    const operationId=(await (transferred?sourceDb:targetDb).prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.convert'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId),receipt=(await routeTarget.readVideoReceipt(operationId))!;
    expect(receipt.command.action).toBe('candidate_convert');
    if(transferred) {expect(receipt.command.actor).toBeNull();expect(await targetDb.prepare("SELECT id FROM music_ingestion_jobs WHERE id='review-bulk-job'").first('id')).toBeNull();expect(await routeTarget.conversionJobScope(plan.id,operationId)).toMatchObject({historical:true});}
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()},runtime={...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,runtime);};
    await targetDb.prepare(transferred?"CREATE TRIGGER task44_conversion_event_abort BEFORE INSERT ON content_historical_records WHEN NEW.source_table='music_ingestion_events' BEGIN SELECT RAISE(ABORT,'conversion_required_event_atomic'); END":"CREATE TRIGGER task44_conversion_event_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.candidate_id='review-save' BEGIN SELECT RAISE(ABORT,'conversion_required_event_atomic'); END").run();
    await consume();expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(await targetDb.prepare('SELECT version FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first('version')).toBe(0);
    if(scenario==='conversion_native') {
      const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);
      try {expect(await runDataRetentionPolicyPrune(runtime,'native-chzzk-read-detail',250)).toMatchObject({deletedRows:0});expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=?').bind(operationId).first('n')).toBe(2);}finally{clock.mockRestore();}
    }
    const afterFailure=gets;await targetDb.prepare('DROP TRIGGER task44_conversion_event_abort').run();await consume();
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(afterFailure);expect(gets).toBe(duplicate?1:2);
    const saved=(await routeTarget.readVideoReceipt(operationId))!;expect(saved.conversionResult).toMatchObject({candidateId,outcome:duplicate?'duplicate':'created',errorCode:duplicate?'duplicate_source':null});
    expect(await targetDb.prepare('SELECT status,version,reviewed_by_user_id FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first()).toEqual({status:'converted',version:1,reviewed_by_user_id:transferred?null:'luvdia-pending-admin'});
    expect(saved.operation.outcome).toMatchObject({outcome:'committed',sideEffectReconciled:true,youtubeVideo:{reads:[{disposition:'consumed'},{disposition:duplicate?'not_issued':'consumed'}]}});
    if(transferred) {
      expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_ingestion_events' AND json_extract(record_json,'$.values.event_type')='candidate.convert.created'").first('n')).toBe(1);expect(await sourceDb.prepare('SELECT status,version FROM music_ingestion_candidates WHERE id=?').bind(candidateId).first()).toEqual({status:'ready',version:0});
      expect(await sourceDb.prepare("SELECT status,version FROM music_ingestion_candidates WHERE id='youtube:BulkStay001'").first()).toEqual({status:'needs_input',version:0});
      const frozen=await sourceDb.prepare('SELECT count(*) n FROM content_transition_journal').first('n');
      const repeated=await post([{id:'review-save',expectedVersion:0}]);expect(repeated.status).toBe(200);expect(await repeated.json()).toMatchObject({data:{results:[{outcome:'validation_failed'}]}});
      const later=await post([{id:'review-save',expectedVersion:1}]);expect(later.status,await later.clone().text()).toBe(200);expect(await later.json()).toMatchObject({data:{results:[{outcome:'validation_failed'}]}});
      expect(await sourceDb.prepare("SELECT status,version FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({status:'needs_input',version:0});
      expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_journal').first('n')).toBe(frozen);
      expect(await sourceDb.prepare("SELECT count(*) n FROM music_ingestion_events WHERE job_id='review-bulk-job' AND candidate_id IS NULL AND event_type='candidate.convert.validation_failed'").first('n')).toBe(2);
      expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_ingestion_events' AND json_extract(record_json,'$.values.event_type')='candidate.convert.validation_failed'").first('n')).toBe(1);
    }
    if(scenario==='conversion_native') {
      expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=? AND settled_at IS NOT NULL').bind(operationId).first('n')).toBe(2);
      const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31*86400000);
      try {
        const result=await runDataRetentionPolicyPrune(runtime,'native-chzzk-read-detail',250);expect(result.deletedRows).toBe(2);
        expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=?').bind(operationId).first('n')).toBe(0);
        expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_chzzk_attempts WHERE operation_id=?').bind(operationId).first('n')).toBe(0);
        expect((await routeTarget.readVideoReceipt(operationId))!.conversionResult).toEqual(saved.conversionResult);
        await expect(new D1YouTubeVideoReadJournal(targetDb,'luvdia','luvdia-db').claim(plan.id,operationId,operation.payloadHash,`youtube:videos:0:${videoId}`,Date.now())).rejects.toThrow(/registered/);
      }finally{clock.mockRestore();}
      expect((await post()).status).toBe(200);
    }
    await consume();expect(message.ack).toHaveBeenCalledOnce();expect(gets).toBe(afterFailure);
  } finally {stage.mockRestore();await sourceDb.prepare('DROP TRIGGER IF EXISTS task44_conversion_job_abort').run();await targetDb.prepare('DROP TRIGGER IF EXISTS task44_conversion_event_abort').run();fixture.close();}
},25000);
it.each(['conversion_validation_source','conversion_validation_native','conversion_validation_newer'] as const)('task4.4 preserves original no-GET conversion outcomes (%s)',async scenario=>{
  await seedPublicationCatalog();
  const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid:1},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
  await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,channel_id,availability_status,made_for_kids,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('review-save','NewVideo001','needs_input','eligible',?,'playable',0,1,1,999,1,1,?)").bind(`UC${'p'.repeat(22)}`,JSON.stringify(review)).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary,native=scenario!=='conversion_validation_source',newer=scenario==='conversion_validation_newer',site=native?'luvdia':'otw',db=native?targetDb:sourceDb;
  let gets=0;const fixture=await pendingAdminFixture(site,db,async()=>{gets++;throw new Error('Invalid selection must not issue metadata GET');});fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';
  const token=await fixture.token(`${site}-pending-admin`),request=()=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/import-candidates/review-save/convert`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:newer?1:0})}),fixture.runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    if(native) {const accepted=await request();expect(accepted.status,await accepted.clone().text()).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});await activate();}
    if(newer) {
      const saved=await handleWorkerFetch(new Request('http://localhost:5174/api/play/admin/import-candidates/review-save',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'save',expectedVersion:0,input:review})}),fixture.runtime);
      expect(saved.status,await saved.clone().text()).toBe(200);expect(await saved.json()).toMatchObject({data:{version:1,status:'ready'}});
    }
    await db.prepare("CREATE TRIGGER task44_conversion_validation_abort BEFORE INSERT ON music_ingestion_events WHEN NEW.candidate_id='review-save' AND NEW.event_type LIKE 'candidate.convert.%' BEGIN SELECT RAISE(ABORT,'conversion_validation_atomic'); END").run();
    if(native) {
      const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.conversion-outcome.mutate'").first<string>('operation_id'))!,op=await routeTarget.exportOperation(plan.id,operationId),message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:op.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
      await db.prepare('DROP TRIGGER task44_conversion_validation_abort').run();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
    } else {expect((await request()).status).toBe(503);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.conversion-outcome.local'").first('n')).toBe(0);await db.prepare('DROP TRIGGER task44_conversion_validation_abort').run();}
    const response=await request();expect(response.status,await response.clone().text()).toBe(200);expect(await response.json()).toMatchObject({data:{candidateId:'review-save',outcome:'stale',performanceId:null,errorCode:'stale_write'}});
    expect((await request()).status).toBe(200);expect(gets).toBe(0);
    expect(await db.prepare("SELECT count(*) n FROM music_ingestion_events WHERE candidate_id='review-save' AND event_type='candidate.convert.stale'").first('n')).toBe(1);
    expect(await db.prepare("SELECT status,version FROM music_ingestion_candidates WHERE id='review-save'").first()).toEqual({status:newer?'ready':'needs_input',version:newer?1:0});
    expect(await db.prepare('SELECT count(*) n FROM content_transition_chzzk_requests').first('n')).toBe(0);
    if(!native) {await activate();const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});}
  } finally {await db.prepare('DROP TRIGGER IF EXISTS task44_conversion_validation_abort').run();fixture.close();}
},25000);
it('task4.4 preserves original bulk ignore receipts and independent source rows',async()=>{
  await seedPublicationCatalog();
  await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Unrelated')").run();
  const repository=new D1IngestionRepository(sourceDb);
  const preflight:import('@contracts/otw-play').OtwPlayPlaylistPreflightDto={playlistId:'PL1234567890',canonicalUrl:'https://www.youtube.com/playlist?list=PL1234567890',title:'Bulk review fixture',ownerChannelId:'UCowner',ownerChannelTitle:'Owner',itemCount:2,privacyStatus:'public',rangeStartPosition:0,rangeEndExclusive:2,nextRangeStart:null,requestedItemCount:2,estimatedPageCount:1,estimatedVideoBatchCount:1,hardCap:5000,requiresSplit:false,previousImport:null};
  const created=await repository.createJob({jobId:'review-bulk-job',actorUserId:'otw-pending-admin',input:{playlistUrl:preflight.canonicalUrl,mode:'all_new',idempotencyKey:'review-bulk-fixture'},preflight,now:1});
  await repository.recordPlaylistPage(await repository.readMessage(created.message.idempotencyKey),{items:[{playlistItemId:'bulk-move',videoId:'BulkMove001',position:0},{playlistItemId:'bulk-stay',videoId:'BulkStay001',position:1}],nextPageToken:null},2);
  for(const [video,memberUid] of [['BulkMove001',1],['BulkStay001',90]] as const) {
    const review={song:{kind:'existing',songId:'publication-song'},participants:[{subject:{kind:'member',memberUid},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',internalNote:null};
    await sourceDb.prepare("UPDATE music_ingestion_candidates SET status='needs_input',classification='eligible',review_input_json=? WHERE id=?").bind(JSON.stringify(review),`youtube:${video}`).run();
  }
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const fixture=await pendingAdminFixture('otw');fixture.runtime.YOUTUBE_API_KEY='';
  const request=async(ids:string[])=>handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/imports/review-bulk-job/ignore',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json'},body:JSON.stringify({candidates:ids.map(id=>({id:`youtube:${id}`,expectedVersion:0}))})}),fixture.runtime);
  try {
    expect(await targetDb.prepare("SELECT version FROM music_ingestion_candidates WHERE id='youtube:BulkMove001'").first('version')).toBe(0);
    const first=await request(['BulkMove001']);expect(first.status,await first.clone().text()).toBe(200);const original=await first.json();
    expect(original).toMatchObject({data:{results:[{candidateId:'youtube:BulkMove001',outcome:'ignored',errorCode:null}]}});
    expect(await (await request(['BulkMove001'])).json()).toEqual(original);
    expect(await sourceDb.prepare("SELECT version FROM music_ingestion_candidates WHERE id='youtube:BulkMove001'").first('version')).toBe(1);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    const mixed=await request(['BulkMove001','BulkStay001']);expect(mixed.status,await mixed.clone().text()).toBe(200);
    expect(await mixed.json()).toMatchObject({data:{results:[{candidateId:'youtube:BulkMove001',outcome:'failed',errorCode:'CONTENT_MOVED'},{candidateId:'youtube:BulkStay001',outcome:'ignored',errorCode:null}]}});
    expect((await sourceDb.prepare("SELECT id,version,status FROM music_ingestion_candidates WHERE id IN ('youtube:BulkMove001','youtube:BulkStay001') ORDER BY id").all()).results).toEqual([{id:'youtube:BulkMove001',version:1,status:'ignored'},{id:'youtube:BulkStay001',version:1,status:'ignored'}]);
    // Ignore clears this row's sole selected review subject. The original
    // scope-exit tail removes the baseline row; it must not retain stale input.
    expect(await targetDb.prepare("SELECT id FROM music_ingestion_candidates WHERE id='youtube:BulkMove001'").first()).toBeNull();
    expect(await sourceDb.prepare("SELECT json_extract(outcome_json,'$.outcome') value FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.candidate.local'").first('value')).toBe('committed');
    expect(await sourceDb.prepare("SELECT count(*) n FROM music_ingestion_events WHERE candidate_id='youtube:BulkMove001' AND event_type='candidate.ignored'").first('n')).toBe(1);
  } finally {fixture.close();}
},20000);
it.each(['source_before','target_newer'] as const)('task4.4 preserves transferred catalog revision authority (%s)',async scenario=>{
  await seedPublicationCatalog();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const sourceRevision=await sourceDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision');
  const entityInput={id:'publication-singer',expectedVersion:0,memberUid:1,entityKind:'person',displayName:`Revision winner ${scenario}`,slug:'publication-singer',archived:false};
  let gets=0;
  const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{
    expect(new URL(String(input)).pathname).toBe('/youtube/v3/videos');gets++;
    if(scenario==='source_before') {
      const changed=await handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/entities',{method:'PUT',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'video-source-revision-winner'},body:JSON.stringify(entityInput)}),fixture.runtime);
      expect(changed.status,await changed.clone().text()).toBe(200);
    }
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Original channel',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});
  });
  fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const body={expectedCatalogRevision:sourceRevision,youtubeUrl:'https://youtu.be/NewVideo001',startSeconds:30,endSeconds:90,song:{kind:'existing',songId:'publication-song'},channel:{kind:'existing',channelId:'publication-channel'},participants:[{subject:{kind:'entity',entityId:'publication-singer'},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',publicationTarget:'draft'};
  try {
    const response=await handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/catalog-entries',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`video-revision-${scenario}`},body:JSON.stringify(body)}),fixture.runtime);
    expect(response.status,await response.clone().text()).toBe(409);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    const execution=await routeTarget.videoExecutionCommand(plan.id,operationId);expect(execution.sourceRevisionValid).toBe(scenario==='target_newer');
    const anchor=await targetDb.prepare("SELECT json_extract(installation_json,'$.catalogRevisionAnchor') value FROM content_transitions WHERE id=?").bind(plan.id).first('value');
    if(scenario==='target_newer') {
      const native=await pendingAdminFixture('luvdia');native.runtime.YOUTUBE_API_KEY='';
      try {
        const changed=await handleWorkerFetch(new Request('http://localhost:5174/api/play/admin/entities',{method:'PUT',headers:{Authorization:`Bearer ${await native.token('luvdia-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'video-target-revision-winner'},body:JSON.stringify(entityInput)}),native.runtime);
        expect(changed.status,await changed.clone().text()).toBe(200);
      } finally {native.close();}
    }
    await routeTarget.activate(plan.id);
    expect(await targetDb.prepare("SELECT json_extract(installation_json,'$.catalogRevisionAnchor') value FROM content_transitions WHERE id=?").bind(plan.id).first('value')).toBe(anchor);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const runtime={...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY};
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,runtime);
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(1);
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toMatchObject({outcome:'conflicted',sideEffectReconciled:true});
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='publication-singer'").first('display_name')).toBe(entityInput.displayName);
    expect(await targetDb.prepare("SELECT id FROM music_media_sources WHERE external_id='NewVideo001'").first('id')).toBeNull();
    expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,runtime);expect(gets).toBe(1);
  } finally {fixture.close();}
},20000);
it('task4.4 recovers original unfenced video delivery and exhausts only its four HTTP slots',async()=>{
  await seedPublicationCatalog();const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const started=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(started),quotaBefore=(await readYouTubeQuotaLedgerUsage(sourceDb)).used;
  let gets=0;const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{expect(new URL(String(input)).searchParams.get('id')).toBe('NewVideo001');gets++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Channel',title:`Lost response ${gets}`,publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});});
  fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const complete=D1YouTubeVideoReadJournal.prototype.complete,interrupted=vi.spyOn(D1YouTubeVideoReadJournal.prototype,'complete').mockImplementation(async()=>{throw new Error('Interrupted after HTTP before durable video response');});
  const sourceInput={youtubeUrl:'https://youtu.be/NewVideo001',channelId:'publication-channel',startSeconds:30,endSeconds:90,sourceRole:'official',priority:0,isPrimary:true};
  const body={songId:'publication-song',relationType:'cover',releaseType:'official_video',participationType:'solo',qualityStatus:'ok',releasedAt:null,participants:[{entityId:'publication-singer',participantRole:'vocal',creditOrder:0,creditNameSnapshot:'Selected Singer'}],sources:[sourceInput,{...sourceInput,startSeconds:100,endSeconds:150,priority:1,isPrimary:false}]};
  try {
    const request=async()=>handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/performances',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':'source-four-unknown-videos'},body:JSON.stringify(body)}),fixture.runtime);
    const first=await request();expect(first.status,await first.clone().text()).toBe(500);expect(gets).toBe(1);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!,operation=await routeSource.exportOperation(plan.id,operationId);
    fixture.send.mockResolvedValue(undefined);fixture.send.mockClear();await recoverTransitionWork(fixture.runtime);expect(fixture.send).toHaveBeenCalledOnce();
    const message={body:fixture.send.mock.calls[0][0],ack:vi.fn(),retry:vi.fn()};expect(message.body).toMatchObject({operationId,payloadHash:operation.payloadHash});
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'otw-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);};
    for(let retry=1;retry<=4;retry++){clock.mockReturnValue(started+retry*30001);await consume();if(retry<4){expect(message.retry).toHaveBeenCalledOnce();expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toBeNull();}}
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(4);
    const terminal=(await routeSource.exportOperation(plan.id,operationId)).outcome;expect(terminal).toMatchObject({outcome:'failed',sideEffectReconciled:true,youtubeVideo:{failure:{code:'network',retryable:false},reads:[{disposition:'exhausted_unknown'},{disposition:'not_issued'}]}});
    const details=(await sourceDb.prepare('SELECT request_key,request_hash,attempt,disposition,response_json FROM content_transition_chzzk_requests WHERE operation_id=? ORDER BY request_key').bind(operationId).all<{request_key:string;request_hash:string;attempt:number;disposition:string;response_json:string|null}>()).results;
    expect(details.map(row=>row.attempt)).toEqual([4,0]);expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_chzzk_attempts WHERE operation_id=? AND state=\'uncertain\'').bind(operationId).first('n')).toBe(4);
    expect((await readYouTubeQuotaLedgerUsage(sourceDb)).used-quotaBefore).toBe(4);
    expect(await sourceDb.prepare('SELECT count(*) n FROM music_media_sources WHERE external_id=\'NewVideo001\'').first('n')).toBe(0);
    const claim=(await sourceDb.prepare('SELECT claim FROM content_transition_chzzk_attempts WHERE operation_id=? AND attempt=1').bind(operationId).first<string>('claim'))!;
    await complete.call(new D1YouTubeVideoReadJournal(sourceDb,'otw','otw-db'),plan.id,operationId,operation.payloadHash,details[0].request_key,details[0].request_hash,1,claim,{status:'success',video:{videoId:'NewVideo001',channelId:`UC${'p'.repeat(22)}`,channelTitle:'Late',title:'Late distinct lost response',thumbnailUrl:null,durationSeconds:300,publishedAt:started,availabilityStatus:'playable'}},Date.now());
    expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toEqual(terminal);expect(await sourceDb.prepare('SELECT response_json FROM content_transition_chzzk_requests WHERE request_key=? AND operation_id=?').bind(details[0].request_key,operationId).first('response_json')).toBeNull();
    const retry=await request();expect(retry.status,await retry.clone().text()).toBe(503);expect(gets).toBe(4);
    fixture.send.mockClear();await recoverTransitionWork(fixture.runtime);expect(fixture.send).not.toHaveBeenCalled();
    await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,'video-recovered-readiness',Date.now()+60000),Date.now());
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));for(const original of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(original);for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,{...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toEqual(terminal);expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
    await routeTarget.admit({...admission('video-native-backlog'),subject:{table:'schedules',key:'[319]'},payload:{...admission('video-native-backlog').payload,input:{...admission('video-native-backlog').payload.input,id:319}}});
    await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);expect((await routeTarget.readTransition(plan.id)).phase).toBe('complete');expect(gets).toBe(4);
  } finally {interrupted.mockRestore();fixture.close();clock.mockRestore();}
},20000);
it.each(['external_credit','guarded_source_mutation','wrong_verdict'] as const)('task4.4 preserves frozen recognized channel credit (%s)',async scenario=>{
  await seedPublicationCatalog();const externalChannelId=`UC${'q'.repeat(22)}`;
  await sourceDb.prepare("INSERT INTO members(uid,code,name,youtube_channel_id,is_deprecated) VALUES(90,'other','Original external singer',?,0)").bind(scenario==='wrong_verdict'?`UC${'z'.repeat(22)}`:externalChannelId).run();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const revision=await sourceDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision');
  let gets=0,activated=false;
  const resolve=D1TransitionRepository.prototype.resolveVideoDependency;
  const stage=vi.spyOn(D1TransitionRepository.prototype,'resolveVideoDependency').mockImplementation(async function(this:D1TransitionRepository,...args){
    const witness=await resolve.apply(this,args);expect(witness?.recognizedChannelAllowed).toBe(scenario!=='wrong_verdict');
    // The existing lifecycle validates newly sealed external identity facts.
    await routeSource.validateIdentityProjection(plan.id);
    if(scenario==='guarded_source_mutation') {await expect(sourceDb.prepare('UPDATE members SET is_deprecated=1 WHERE uid=90').run()).rejects.toThrow(/final_owner_required/);expect(await sourceDb.prepare('SELECT is_deprecated FROM members WHERE uid=90').first('is_deprecated')).toBe(0);}
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);activated=true;
    if(scenario==='external_credit') await sourceDb.prepare('UPDATE members SET youtube_channel_id=NULL WHERE uid=90').run();
    return witness;
  });
  const fixture=await pendingAdminFixture('otw',sourceDb,async input=>{expect(new URL(String(input)).pathname).toBe('/youtube/v3/videos');gets++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:externalChannelId,channelTitle:'External channel',title:'Recognized source video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});});
  fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const body={expectedCatalogRevision:revision,youtubeUrl:'https://youtu.be/NewVideo001',startSeconds:30,endSeconds:90,song:{kind:'existing',songId:'publication-song'},channel:{kind:'recognized_member',channelRole:'member_music',memberUid:90},participants:[{subject:{kind:'entity',entityId:'publication-singer'},participantRole:'vocal',creditOrder:0}],relationType:'cover',releaseType:'official_video',participationType:'solo',publicationTarget:'draft'};
  try {
    const response=await handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/catalog-entries',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`recognized-${scenario}`},body:JSON.stringify(body)}),fixture.runtime);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!;
    expect(response.status,JSON.stringify({response:await response.clone().text(),gets})).toBe(409);expect(activated).toBe(true);
    const operation=await routeTarget.exportOperation(plan.id,operationId),receipt=(await routeTarget.readVideoReceipt(operationId))!;
    expect(JSON.stringify(operation)).not.toContain('member:90');expect(JSON.stringify(operation)).not.toContain('"memberUid":90');expect(await targetDb.prepare('SELECT uid FROM members WHERE uid=90').first('uid')).toBeNull();
    if(receipt.command.action!=='catalog_create'||receipt.command.input.channel.kind!=='confirm'||receipt.command.input.channel.owners[0].kind!=='entity') throw new Error('Expected frozen external channel credit');
    const externalEntityId=receipt.command.input.channel.owners[0].entityId;
    expect(await targetDb.prepare('SELECT member_uid,display_name FROM music_entities WHERE id=?').bind(externalEntityId).first()).toEqual({member_uid:null,display_name:'Original external singer'});
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,{...fixture.runtime,...siteEnv('luvdia'),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:'luvdia-bucket',CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY});
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(1);
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toMatchObject({outcome:scenario!=='wrong_verdict'?'committed':'failed',sideEffectReconciled:true});
    if(scenario!=='wrong_verdict') expect(await targetDb.prepare('SELECT entity_id FROM music_channel_entities WHERE channel_id=?').bind(receipt.command.ids.channelId).first('entity_id')).toBe(externalEntityId);
    else expect(await targetDb.prepare('SELECT id FROM music_channels WHERE external_channel_id=?').bind(externalChannelId).first('id')).toBeNull();
    expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
  } finally {stage.mockRestore();fixture.close();}
},20000);
it.each(['unused','claim_wins'] as const)('task4.4 preserves the actual newer native approval no-op (%s)',async scenario=>{
  await seedPublicationCatalog();await seedVideoProposal();
  const {routeSource,routeTarget}=await routeControls(),boundary=(await routeSource.describeBaseline(plan.id)).boundary;
  const input={expectedVersion:0,expectedCatalogRevision:(await sourceDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first<number>('revision'))!,song:{kind:'existing',songId:'publication-song'},channel:{kind:'existing',channelId:'publication-channel'},participants:[{subject:{kind:'entity',entityId:'publication-singer'},participantRole:'vocal',creditOrder:0}],releaseType:'official_video',participationType:'solo',startSeconds:30,endSeconds:90,performanceTags:[],singingCreditConfirmed:true,publish:true};
  const admit=D1TransitionRepository.prototype.admitVideoMutation;
  const held=vi.spyOn(D1TransitionRepository.prototype,'admitVideoMutation').mockImplementation(async function(this:D1TransitionRepository,...args){
    const receipt=await admit.apply(this,args);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);return receipt;
  });
  const sourceFixture=await pendingAdminFixture('otw');sourceFixture.runtime.YOUTUBE_API_KEY='local-fixture-only';
  try {
    const response=await handleWorkerFetch(new Request('http://localhost:5173/api/play/admin/submissions/video-proposal/approve',{method:'POST',headers:{Authorization:`Bearer ${await sourceFixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`source-noop-${scenario}`},body:JSON.stringify(input)}),sourceFixture.runtime);
    expect(response.status,await response.clone().text()).toBe(409);expect(await sourceDb.prepare('SELECT attempt FROM content_transition_chzzk_requests').first('attempt')).toBe(0);
  } finally {held.mockRestore();sourceFixture.close();}
  const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
  let gets=0;const fixture=await pendingAdminFixture('luvdia',targetDb,async input=>{expect(new URL(String(input)).pathname).toBe('/youtube/v3/videos');gets++;return Response.json({items:[{id:'NewVideo001',snippet:{channelId:`UC${'p'.repeat(22)}`,channelTitle:'Channel',title:'Native approved video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});});
  fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.SOURCE_RELAY;
  let raced=false;
  const prepare=D1TransitionRepository.prototype.prepareVideoApprovalNoop;
  const race=vi.spyOn(D1TransitionRepository.prototype,'prepareVideoApprovalNoop').mockImplementation(async function(this:D1TransitionRepository,...args){const proof=await prepare.apply(this,args);if(scenario==='claim_wins'&&!raced){raced=true;const claim=await relayBindings.SOURCE_RELAY.claimYouTubeVideoRead(plan.id,operationId,operation.payloadHash,'youtube:videos:0:NewVideo001');expect(claim.claimed).toBe(true);}return proof;});
  try {
    const newer=await handleWorkerFetch(new Request('http://localhost:5174/api/play/admin/submissions/video-proposal/approve',{method:'POST',headers:{Authorization:`Bearer ${await fixture.token('luvdia-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`native-newer-noop-${scenario}`},body:JSON.stringify({...input,expectedCatalogRevision:await targetDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision')})}),fixture.runtime);
    expect(newer.status,await newer.clone().text()).toBe(200);const result=await newer.json();expect(gets).toBe(1);
    const revision=await targetDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision');
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);};
    await consume();
    if(scenario==='claim_wins') {
      expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
      expect(await sourceDb.prepare('SELECT disposition FROM content_transition_chzzk_requests WHERE operation_id=?').bind(operationId).first('disposition')).toBeNull();
      expect(await targetDb.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.videoApprovalNoop.resultHash') value FROM content_transition_operations WHERE operation_id=?").bind(operationId).first('value')).toMatch(/^[a-f0-9]{64}$/);
      // Expire the actual separate Worker's request claim in its bounded fixture.
      await sourceDb.prepare('UPDATE content_transition_chzzk_requests SET retry_at=0 WHERE operation_id=?').bind(operationId).run();await consume();
    }
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(scenario==='claim_wins'?2:1);
    expect((await routeTarget.readVideoReceipt(operationId))!.result).toEqual(result);
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toMatchObject({outcome:'committed',sideEffectReconciled:true,detail:'Original proposal already approved; no new catalog mutation'});
    expect(await targetDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision')).toBe(revision);
    expect(await targetDb.prepare("SELECT reviewed_by_user_id,historical_review,version FROM music_cover_proposals WHERE id='video-proposal'").first()).toEqual({reviewed_by_user_id:'luvdia-pending-admin',historical_review:0,version:1});
    expect(await sourceDb.prepare('SELECT outcome_acknowledged FROM content_transition_operations WHERE operation_id=?').bind(operationId).first('outcome_acknowledged')).toBe(1);
    expect(await sourceDb.prepare('SELECT envelope_json FROM content_transition_operations WHERE operation_id=?').bind(operationId).first<string>('envelope_json')).not.toContain('luvdia-pending-admin');
    expect(JSON.stringify(await routeTarget.exportOperation(plan.id,operationId))).not.toContain('luvdia-pending-admin');
    await consume();expect(message.ack).toHaveBeenCalledOnce();expect(gets).toBe(scenario==='claim_wins'?2:1);
    const claim=await relayBindings.SOURCE_RELAY.claimYouTubeVideoRead(plan.id,operationId,operation.payloadHash,'youtube:videos:0:NewVideo001');expect(claim.claimed).toBe(false);
  } finally {race.mockRestore();fixture.close();}
},20000);
it.each(['performance_create','performance_update','catalog_create','proposal_approve'] as const)('task4.4 runs original native video owning API and Queue (%s)',async action=>{
  await seedPublicationCatalog();
  await seedVideoProposal();
  const {routeSource,routeTarget}=await routeControls(),channelId=`UC${'p'.repeat(22)}`;
  const revision=(await targetDb.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first<number>('revision'))!;
  let gets=0;
  const fixture=await pendingAdminFixture('luvdia',targetDb,async(input,init)=>{
    const url=new URL(String(input));expect(url.origin+url.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');expect(init?.method??'GET').toBe('GET');
    expect(url.searchParams.get('id')).toBe('NewVideo001');expect(url.searchParams.get('part')).toBe('snippet,contentDetails,status,player,liveStreamingDetails');
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first('n')).toBe(1);
    expect(await targetDb.prepare('SELECT attempt FROM content_transition_chzzk_requests').first('attempt')).toBe(1);gets++;
    return Response.json({items:[{id:'NewVideo001',snippet:{channelId,channelTitle:'Original channel',title:'Original video',publishedAt:'2026-10-01T00:00:00Z'},contentDetails:{duration:'PT5M'},status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'}}]});
  });fixture.runtime.YOUTUBE_API_KEY='local-fixture-only';fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.SOURCE_RELAY;
  const subject={kind:'entity',entityId:'publication-singer'},participants=[{subject,participantRole:'vocal',creditOrder:0}];
  const sourceInput={youtubeUrl:'https://youtu.be/NewVideo001',channelId:'publication-channel',startSeconds:30,endSeconds:90,sourceRole:'official',priority:0,isPrimary:true};
  const core={songId:'publication-song',relationType:'cover',releaseType:'official_video',participationType:'solo',qualityStatus:'ok',releasedAt:null,internalNote:null,tags:[],sources:[sourceInput]};
  const body=action==='performance_create'?{...core,participants:[{entityId:'publication-singer',participantRole:'vocal',creditOrder:0,creditNameSnapshot:'Selected Singer'}]}:action==='performance_update'?{...core,id:'publication-selected',expectedVersion:0,participants}:action==='catalog_create'?{expectedCatalogRevision:revision,youtubeUrl:sourceInput.youtubeUrl,startSeconds:30,endSeconds:90,song:{kind:'existing',songId:'publication-song'},channel:{kind:'existing',channelId:'publication-channel'},participants,relationType:'cover',releaseType:'official_video',participationType:'solo',publicationTarget:'draft',performanceTags:[]}:{expectedVersion:0,expectedCatalogRevision:revision,song:{kind:'existing',songId:'publication-song'},channel:{kind:'existing',channelId:'publication-channel'},participants,releaseType:'official_video',participationType:'solo',startSeconds:30,endSeconds:90,performanceTags:[],singingCreditConfirmed:true,publish:true};
  const path=action==='proposal_approve'?'/api/play/admin/submissions/video-proposal/approve':action==='catalog_create'?'/api/play/admin/catalog-entries':'/api/play/admin/performances';
  const request=async()=>handleWorkerFetch(new Request(`http://localhost:5174${path}`,{method:action==='performance_update'?'PUT':'POST',headers:{Authorization:`Bearer ${await fixture.token('luvdia-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`native-video-${action}`},body:JSON.stringify(body)}),fixture.runtime);
  try {
    const admitted=await request();expect(admitted.status,await admitted.clone().text()).toBe(409);expect(await admitted.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(gets).toBe(0);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    const operationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.video.mutate'").first<string>('operation_id'))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);};
    await consume();
    const terminal=await routeTarget.exportOperation(plan.id,operationId);expect(terminal.outcome).toMatchObject({outcome:'committed',sideEffectReconciled:true});expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(gets).toBe(1);
    const saved=(await routeTarget.readVideoReceipt(operationId))!;expect(saved.result).toBeTruthy();expect(JSON.stringify(terminal)).not.toContain('luvdia-pending-admin');
    if(action==='proposal_approve') expect(await targetDb.prepare("SELECT status,reviewed_by_user_id,historical_review,version FROM music_cover_proposals WHERE id='video-proposal'").first()).toEqual({status:'approved',reviewed_by_user_id:'luvdia-pending-admin',historical_review:0,version:1});
    else {const id=action==='performance_update'?'publication-selected':(saved.command.action==='performance_update'?'':saved.command.ids.performanceId);expect(await targetDb.prepare('SELECT id FROM music_performances WHERE id=?').bind(id).first('id')).toBe(id);}
    const replay=await request();expect(replay.status,await replay.clone().text()).toBe(action==='performance_create'||action==='catalog_create'?201:200);expect(await replay.json()).toEqual(saved.result);await consume();expect(gets).toBe(1);
    if(action==='performance_create') {
      const settled=(await targetDb.prepare('SELECT settled_at FROM content_transition_chzzk_requests WHERE operation_id=?').bind(operationId).first<number>('settled_at'))!;expect(settled).toBeGreaterThan(0);
      const clock=vi.spyOn(Date,'now').mockReturnValue(settled+31*86400000);
      try {await runDataRetentionPolicyPrune(fixture.runtime,'native-chzzk-read-detail',250);await consume();expect(message.ack).toHaveBeenCalledOnce();expect(gets).toBe(1);expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=?').bind(operationId).first('n')).toBe(0);await expect(new D1YouTubeVideoReadJournal(targetDb,'luvdia','luvdia-db').claim(plan.id,operationId,operation.payloadHash,'youtube:videos:0:NewVideo001',Date.now())).rejects.toThrow(/registered/);} finally {clock.mockRestore();}
    }
  } finally {fixture.close();}
},20000);
it.each(["source_tail","native_retention","unknown_replacement","unknown_exhausted","quota_denied","rate_limited"] as const)("task4.4 preserves the actual admitted channel metadata and owning flow (%s)",async scenario=>{
  await seedPublicationCatalog();
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('operation-parent',NULL,'person','Original dependency','original dependency','operation-parent',1,1)"),
    sourceDb.prepare("INSERT INTO music_entity_aliases(entity_id,alias,normalized_alias) VALUES('operation-parent','Original dependency alias','original dependency alias')"),
  ]);
  const {routeSource,routeTarget}=await routeControls(),sourceCase=scenario==="source_tail",database=sourceCase?sourceDb:targetDb,repository=sourceCase?routeSource:routeTarget;
  const started=Date.now(),clock=vi.spyOn(Date,"now").mockReturnValue(started),channelId=`UC${"p".repeat(22)}`;
  const priorQuota=await database.prepare("SELECT value FROM settings WHERE key='youtube_api_daily_quota_units'").first<string>("value");
  await database.prepare("UPDATE settings SET value=? WHERE key='youtube_api_daily_quota_units'").bind(scenario==="quota_denied"?"1":"10000").run();
  const quotaBefore=(await readYouTubeQuotaLedgerUsage(database)).used;
  let gets=0,cutoverDone=false;
  const activate=async()=>{
    const baseline=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);cutoverDone=true;
  };
  const fixture=await pendingAdminFixture(sourceCase?"otw":"luvdia",database,async(input,init)=>{
    const url=new URL(String(input));expect(url.origin+url.pathname).toBe("https://www.googleapis.com/youtube/v3/channels");expect(init?.method??"GET").toBe("GET");
    expect([...url.searchParams.keys()].sort()).toEqual(["id","key","maxResults","part"]);expect(url.searchParams.get("id")).toBe(channelId);expect(url.searchParams.get("part")).toBe("snippet");
    expect(await database.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.channel.mutate'").first("n")).toBe(1);
    expect(await database.prepare("SELECT attempt FROM content_transition_chzzk_requests WHERE request_key=?").bind(`youtube:channels:snippet:${channelId}`).first("attempt")).toBe(gets+1);
    gets++;expect((await readYouTubeQuotaLedgerUsage(database)).used).toBe(quotaBefore+gets);
    if(sourceCase && !cutoverDone) await activate();
    return scenario==="rate_limited"?Response.json({error:{message:"fixture limit"}},{status:429,headers:{"Retry-After":"7"}}):Response.json({items:[{id:channelId,snippet:{title:gets===1?"First authoritative name":"Changed replacement name"}}]});
  });
  fixture.runtime.YOUTUBE_API_KEY="local-fixture-only";
  fixture.runtime.CONTENT_TRANSITION_PEER=sourceCase?relayBindings.TARGET_RELAY:relayBindings.SOURCE_RELAY;
  const body={id:"publication-channel",expectedVersion:0,externalChannelId:channelId,displayName:"Original client name",channelRole:"member_music",verificationStatus:"approved",active:true,entityIds:sourceCase?["publication-singer","operation-parent"]:["publication-singer"]};
  const key=`channel-original-${scenario}`,origin=sourceCase?"http://localhost:5173":"http://localhost:5174";
  const request=async()=>handleWorkerFetch(new Request(`${origin}/api/play/admin/channels`,{method:"PUT",headers:{Authorization:`Bearer ${await fixture.token(sourceCase?"otw-pending-admin":"luvdia-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)}),fixture.runtime);
  const interrupted=scenario==="unknown_replacement"||scenario==="unknown_exhausted",complete=D1YouTubeChannelReadJournal.prototype.complete;
  let targetActorFixture:Awaited<ReturnType<typeof pendingAdminFixture>>|null=null;
  const completion=interrupted?vi.spyOn(D1YouTubeChannelReadJournal.prototype,"complete").mockImplementation(async function(this:D1YouTubeChannelReadJournal,...args){if(scenario==="unknown_exhausted" || gets===1) throw new Error("Interrupted after HTTP before durable response");return complete.apply(this,args);}):null;
  try {
    expect(await targetDb.prepare("SELECT id FROM music_entities WHERE id='operation-parent'").first()).toBeNull();
    if(sourceCase) {
      const response=await request();expect(response.status,await response.clone().text()).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
      expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='operation-parent'").first("display_name")).toBe("Original dependency");
      expect(await targetDb.prepare("SELECT alias FROM music_entity_aliases WHERE entity_id='operation-parent'").first("alias")).toBe("Original dependency alias");
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='content_transition_operations'").first("n")).toBe(0);
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_membership WHERE root_table='music_entities' AND root_key='[\"operation-parent\"]'").first("n")).toBe(0);
    } else {
      const accepted=await request();expect(accepted.status,await accepted.clone().text()).toBe(409);expect(gets).toBe(0);await activate();
    }
    const operationId=(await database.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.channel.mutate'").first<string>("operation_id"))!,operation=await repository.exportOperation(plan.id,operationId);
    expect(JSON.stringify(operation)).not.toContain("pending-admin");
    const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const targetRuntime={...fixture.runtime,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetRuntime);};
    if(sourceCase) {
      const frozen=await routeSource.readJournal(plan.id);
      const edit=await handleWorkerFetch(new Request("http://localhost:5173/api/play/admin/entities",{method:"PUT",headers:{Authorization:`Bearer ${await fixture.token("otw-pending-admin")}`,"Content-Type":"application/json"},body:JSON.stringify({id:"operation-parent",expectedVersion:0,entityKind:"person",displayName:"Independent source dependency",slug:"operation-parent",memberUid:null,archived:false})}),fixture.runtime);
      expect(edit.status,await edit.clone().text()).toBe(200);expect(await routeSource.readJournal(plan.id)).toEqual(frozen);
      expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='operation-parent'").first("display_name")).toBe("Original dependency");
      targetActorFixture=await pendingAdminFixture("luvdia",targetDb,async()=>{throw new Error("Committed source response must not refetch");});
      targetActorFixture.runtime.YOUTUBE_API_KEY="";
      const targetEdit=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/entities",{method:"PUT",headers:{Authorization:`Bearer ${await targetActorFixture.token("luvdia-pending-admin")}`,"Content-Type":"application/json"},body:JSON.stringify({id:"operation-parent",expectedVersion:0,entityKind:"person",displayName:"Independent target dependency",slug:"operation-parent",memberUid:null,archived:false})}),targetActorFixture.runtime);
      expect(targetEdit.status,await targetEdit.clone().text()).toBe(200);
      await targetDb.prepare("CREATE TRIGGER task44_channel_event_abort BEFORE INSERT ON content_historical_records WHEN NEW.source_table='music_catalog_events' AND json_extract(NEW.record_json,'$.values.event_type')='channel.updated' BEGIN SELECT RAISE(ABORT,'channel_event_atomic_rollback'); END").run();
      await consume();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
      expect(message.retry).toHaveBeenCalledOnce();expect(message.ack).not.toHaveBeenCalled();
      expect(await targetDb.prepare("SELECT version FROM music_channels WHERE id='publication-channel'").first("version")).toBe(0);
      expect(await targetDb.prepare("SELECT count(*) n FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.event_type')='channel.updated'").first("n")).toBe(0);
      await targetDb.prepare("DROP TRIGGER task44_channel_event_abort").run();
    }
    await consume();
    if(interrupted) {
      expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();
      expect(await targetDb.prepare("SELECT version FROM music_channels WHERE id='publication-channel'").first("version")).toBe(0);
      for(let retry=1;retry<=(scenario==="unknown_exhausted"?4:1);retry++) {clock.mockReturnValue(started+retry*30001);await consume();}
    }
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
    const terminal=await routeTarget.exportOperation(plan.id,operationId),failed=["quota_denied","rate_limited","unknown_exhausted"].includes(scenario);
    expect(terminal.outcome).toMatchObject({outcome:failed?"failed":"committed",sideEffectReconciled:true});
    expect(await targetDb.prepare("SELECT version FROM music_channels WHERE id='publication-channel'").first("version")).toBe(failed?0:1);
    expect(gets).toBe(scenario==="quota_denied"?0:scenario==="unknown_exhausted"?4:scenario==="unknown_replacement"?2:1);
    if(scenario==="rate_limited") expect(terminal.outcome?.youtubeChannel?.failure).toMatchObject({code:"rate_limited",retryAfterMs:7000,retryable:true});
    if(scenario==="quota_denied") expect(terminal.outcome?.youtubeChannel?.failure).toMatchObject({code:"quota_exceeded",retryable:true});
    const detail=await database.prepare("SELECT request_key,request_hash,response_hash,attempt,disposition,settled_at FROM content_transition_chzzk_requests WHERE operation_id=?").bind(operationId).first<{request_key:string;request_hash:string;response_hash:string|null;attempt:number;disposition:string;settled_at:number|null}>();
    if(scenario==="unknown_exhausted") {
      expect(detail).toMatchObject({attempt:4,response_hash:null,disposition:"exhausted_unknown"});
      const first=await targetDb.prepare("SELECT claim FROM content_transition_chzzk_attempts WHERE operation_id=? AND attempt=1").bind(operationId).first<string>("claim");
      await complete.call(new D1YouTubeChannelReadJournal(targetDb,"luvdia","luvdia-db"),plan.id,operationId,operation.payloadHash,detail!.request_key,detail!.request_hash,1,first!,{status:"success",channel:{channelId,displayName:"Late after failure"}},Date.now());
      expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toEqual(terminal.outcome);
      expect(await targetDb.prepare("SELECT response_json FROM content_transition_chzzk_requests WHERE operation_id=?").bind(operationId).first("response_json")).toBeNull();
      expect(await targetDb.prepare("SELECT state FROM content_transition_chzzk_attempts WHERE operation_id=? AND attempt=1").bind(operationId).first("state")).toBe("uncertain");
    }
    if(scenario==="native_retention") {
      expect(detail!.settled_at).toBe(started);clock.mockReturnValue(started+31*86400000);
      await runDataRetentionPolicyPrune(targetRuntime,"native-chzzk-read-detail",250);
      expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=?").bind(operationId).first("n")).toBe(0);
      expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toEqual(terminal.outcome);
      await expect(new D1YouTubeChannelReadJournal(targetDb,"luvdia","luvdia-db").claim(plan.id,operationId,operation.payloadHash,detail!.request_key,Date.now())).rejects.toThrow(/registered/);
    }
    const beforeGets=gets;await consume();expect(gets).toBe(beforeGets);expect(message.ack).toHaveBeenCalledOnce();
    if(!sourceCase) {const replay=await request();expect(replay.status,await replay.clone().text()).toBe(failed?503:200);expect(gets).toBe(beforeGets);}
    if(sourceCase) {
      expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toEqual(terminal.outcome);
      expect(await targetDb.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_type='channel' AND event_type='channel.updated'").first("n")).toBe(0);
      const events=(await targetDb.prepare("SELECT source_site,source_key,record_json FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.aggregate_id')='publication-channel' AND json_extract(record_json,'$.values.event_type')='channel.updated'").all<{source_site:string;source_key:string;record_json:string}>()).results;
      expect(events).toHaveLength(1);expect(events[0].source_site).toBe("otw");
      expect(JSON.parse(events[0].record_json)).toMatchObject({sourceSite:"otw",sourceRecordId:events[0].source_key,kind:"event",values:{aggregate_type:"channel",aggregate_id:"publication-channel",event_type:"channel.updated",actor_kind:"admin",created_at:started,after_json:{displayName:"First authoritative name",entityIds:["operation-parent","publication-singer"]}}});
      expect(events[0].record_json).not.toContain("actor_user_id");expect(events[0].record_json).not.toContain("pending-admin");
      expect(await sourceDb.prepare("SELECT version FROM music_channels WHERE id='publication-channel'").first("version")).toBe(0);
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE outcome_acknowledged=1").first("n")).toBe(1);
      expect(await targetDb.prepare("SELECT display_name,version FROM music_entities WHERE id='operation-parent'").first()).toEqual({display_name:"Independent target dependency",version:1});
      await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);
      expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");
    }
  } finally {await targetDb.prepare("DROP TRIGGER IF EXISTS task44_channel_event_abort").run();completion?.mockRestore();targetActorFixture?.close();fixture.close();clock.mockRestore();if(priorQuota!==null) await database.prepare("UPDATE settings SET value=? WHERE key='youtube_api_daily_quota_units'").bind(priorQuota).run();}
},20000);
it("task4.4 creates original source channels through uncertain peer replacement and drains with genuine native backlog",async()=>{
  await seedPublicationCatalog();
  // The real Service Binding executes in another Worker isolate. Give the
  // original local attempt a genuinely expired 30s claim there; a local clock
  // spy alone cannot advance that independent source control clock.
  const {routeSource,routeTarget}=await routeControls(),started=Date.now()-31000,clock=vi.spyOn(Date,"now").mockReturnValue(started);
  const sourceExternal=`UC${"r".repeat(22)}`,nativeExternal=`UC${"n".repeat(22)}`;
  const body=(externalChannelId:string)=>({externalChannelId,displayName:"Original create input",channelRole:"member_music",entityIds:["publication-singer"]});
  const post=async(fixture:Awaited<ReturnType<typeof pendingAdminFixture>>,site:"otw"|"luvdia",external:string)=>handleWorkerFetch(new Request(`http://localhost:${site==="otw"?5173:5174}/api/play/admin/channels`,{method:"POST",headers:{Authorization:`Bearer ${await fixture.token(`${site}-pending-admin`)}`,"Content-Type":"application/json","Idempotency-Key":`channel-create-${external}`},body:JSON.stringify(body(external))}),fixture.runtime);
  const nativeFixture=await pendingAdminFixture("luvdia");nativeFixture.runtime.YOUTUBE_API_KEY="local-fixture-only";
  let nativeOperationId:string;
  try {
    const response=await post(nativeFixture,"luvdia",nativeExternal);expect(response.status,await response.clone().text()).toBe(409);
    nativeOperationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.channel.mutate'").first<string>("operation_id"))!;
    expect(await targetDb.prepare("SELECT id FROM music_channels WHERE external_channel_id=?").bind(nativeExternal).first()).toBeNull();
  } finally {nativeFixture.close();}
  const quotaSource=(await readYouTubeQuotaLedgerUsage(sourceDb)).used,quotaTarget=(await readYouTubeQuotaLedgerUsage(targetDb)).used;
  let sourceGets=0,nativeGets=0;
  const fixture=await pendingAdminFixture("otw",sourceDb,async input=>{
    const url=new URL(String(input));expect(url.origin+url.pathname).toBe("https://www.googleapis.com/youtube/v3/channels");
    const external=url.searchParams.get("id");expect([sourceExternal,nativeExternal]).toContain(external);
    if(external===nativeExternal) {nativeGets++;expect((await readYouTubeQuotaLedgerUsage(targetDb)).used).toBe(quotaTarget+sourceGets-1+nativeGets);}
    else {
      sourceGets++;
      expect(await sourceDb.prepare("SELECT attempt FROM content_transition_chzzk_requests WHERE request_key=?").bind(`youtube:channels:snippet:${sourceExternal}`).first("attempt")).toBe(sourceGets);
      if(sourceGets===1) {
        expect((await readYouTubeQuotaLedgerUsage(sourceDb)).used).toBe(quotaSource+1);
        const baseline=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
        for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
        for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
        await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      } else expect((await readYouTubeQuotaLedgerUsage(targetDb)).used).toBe(quotaTarget+1);
    }
    return Response.json({items:[{id:external,snippet:{title:external===nativeExternal?"Native original create":sourceGets===1?"Lost source response":"Consumed target replacement"}}]});
  });
  fixture.runtime.YOUTUBE_API_KEY="local-fixture-only";fixture.runtime.CONTENT_TRANSITION_PEER=relayBindings.TARGET_RELAY;
  const complete=D1YouTubeChannelReadJournal.prototype.complete,completion=vi.spyOn(D1YouTubeChannelReadJournal.prototype,"complete").mockImplementation(async function(this:D1YouTubeChannelReadJournal,...args){if(sourceGets===1 && nativeGets===0) throw new Error("Original source HTTP response lost before durable recording");return complete.apply(this,args);});
  try {
    const response=await post(fixture,"otw",sourceExternal);expect(response.status,await response.clone().text()).toBe(409);
    const operationId=(await sourceDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.channel.mutate'").first<string>("operation_id"))!,operation=await routeSource.exportOperation(plan.id,operationId);
    const originalAttempt=await sourceDb.prepare("SELECT a.claim,r.request_key,r.request_hash FROM content_transition_chzzk_attempts a JOIN content_transition_chzzk_requests r USING(transition_id,operation_id,request_key) WHERE a.operation_id=? AND a.attempt=1").bind(operationId).first<{claim:string;request_key:string;request_hash:string}>();
    const targetRuntime={...fixture.runtime,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY};
    const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    const consume=async()=>{message.ack.mockClear();message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetRuntime);};
    expect(sourceGets).toBe(1);clock.mockReturnValue(started+31001);await consume();
    expect((await routeTarget.exportOperation(plan.id,operationId)).outcome,JSON.stringify((await sourceDb.prepare("SELECT attempt,claim,retry_at,response_hash FROM content_transition_chzzk_requests WHERE operation_id=?").bind(operationId).all()).results)).toMatchObject({outcome:"committed"});
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();expect(sourceGets).toBe(2);
    const terminal=await routeTarget.exportOperation(plan.id,operationId),result=terminal.outcome?.youtubeChannel?.result;
    expect(terminal.outcome).toMatchObject({outcome:"committed",sideEffectReconciled:true});expect(result?.data).toMatchObject({displayName:"Consumed target replacement",verificationStatus:"pending",active:false,version:0});
    expect(await targetDb.prepare("SELECT id,display_name FROM music_channels WHERE external_channel_id=?").bind(sourceExternal).first()).toEqual({id:result!.data.id,display_name:"Consumed target replacement"});
    expect(await sourceDb.prepare("SELECT id FROM music_channels WHERE external_channel_id=?").bind(sourceExternal).first()).toBeNull();
    expect(await sourceDb.prepare("SELECT state FROM content_transition_chzzk_attempts WHERE operation_id=? AND attempt=1").bind(operationId).first("state")).toBe("superseded");
    await complete.call(new D1YouTubeChannelReadJournal(sourceDb,"otw","otw-db"),plan.id,operationId,operation.payloadHash,originalAttempt!.request_key,originalAttempt!.request_hash,1,originalAttempt!.claim,{status:"success",channel:{channelId:sourceExternal,displayName:"Late source response"}},Date.now());
    expect((await routeSource.exportOperation(plan.id,operationId)).outcome).toEqual(terminal.outcome);await consume();expect(sourceGets).toBe(2);
    expect(await sourceDb.prepare("SELECT state,response_hash,superseded_by_response_hash FROM content_transition_chzzk_attempts WHERE operation_id=? AND attempt=1").bind(operationId).first()).toMatchObject({state:"superseded",superseded_by_response_hash:terminal.outcome!.youtubeChannel!.responseHash});
    expect((await routeTarget.exportOperation(plan.id,nativeOperationId!)).outcome).toBeNull();
    await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);
    expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");expect((await routeTarget.exportOperation(plan.id,nativeOperationId!)).outcome).toBeNull();
    const nativeOperation=await routeTarget.exportOperation(plan.id,nativeOperationId!);message.body={...message.body,operationId:nativeOperationId!,payloadHash:nativeOperation.payloadHash};
    await consume();expect(message.ack).toHaveBeenCalledOnce();expect(nativeGets).toBe(1);
    const nativeTerminal=await routeTarget.exportOperation(plan.id,nativeOperationId!);
    expect(nativeTerminal.outcome).toMatchObject({outcome:"committed",youtubeChannel:{result:{data:{displayName:"Native original create",verificationStatus:"pending",active:false}}}});
    expect(await targetDb.prepare("SELECT actor_user_id FROM music_catalog_events WHERE aggregate_type='channel' AND aggregate_id=? AND event_type='channel.created'").bind(nativeTerminal.outcome!.youtubeChannel!.result!.data.id).first("actor_user_id")).toBe("luvdia-pending-admin");
    await consume();expect(nativeGets).toBe(1);
  } finally {completion.mockRestore();fixture.close();clock.mockRestore();}
},20000);
it("task4.4 preserves the actual independent source channel dictionary after its dependency copy is frozen",async()=>{
  await seedPublicationCatalog();
  const {routeSource,routeTarget}=await routeControls();
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_membership WHERE row_table='music_channels' AND row_key='[\"publication-channel\"]'").first<number>("n")).toBeGreaterThan(0);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_membership WHERE root_table='music_channels' AND root_key='[\"publication-channel\"]'").first("n")).toBe(0);
  await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  const frozen=await routeSource.readJournal(plan.id),images=(await sourceDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results;
  let gets=0;const fixture=await pendingAdminFixture("otw",sourceDb,async input=>{const url=new URL(String(input));expect(url.origin+url.pathname).toBe("https://www.googleapis.com/youtube/v3/channels");expect(url.searchParams.get("id")).toBe(`UC${"p".repeat(22)}`);gets++;return Response.json({items:[{id:url.searchParams.get("id"),snippet:{title:"Independent source channel"}}]});});fixture.runtime.YOUTUBE_API_KEY="local-fixture-only";
  try {
    const response=await handleWorkerFetch(new Request("http://localhost:5173/api/play/admin/channels",{method:"PUT",headers:{Authorization:`Bearer ${await fixture.token("otw-pending-admin")}`,"Content-Type":"application/json"},body:JSON.stringify({id:"publication-channel",expectedVersion:0,externalChannelId:`UC${"p".repeat(22)}`,displayName:"Source input",channelRole:"member_music",verificationStatus:"approved",active:true,entityIds:["publication-other"]})}),fixture.runtime);
    expect(response.status,await response.clone().text()).toBe(200);expect(gets).toBe(1);
    expect(await sourceDb.prepare("SELECT display_name,version FROM music_channels WHERE id='publication-channel'").first()).toEqual({display_name:"Independent source channel",version:1});
    expect(await targetDb.prepare("SELECT display_name,version FROM music_channels WHERE id='publication-channel'").first()).toEqual({display_name:"Approved music",version:0});
    expect(await routeSource.readJournal(plan.id)).toEqual(frozen);expect((await sourceDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results).toEqual(images);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT actor_user_id FROM music_catalog_events WHERE aggregate_type='channel' AND event_type='channel.updated' ORDER BY created_at DESC LIMIT 1").first("actor_user_id")).toBe("otw-pending-admin");
  } finally {fixture.close();}
},20000);
it.each(["source","source_race","source_event_abort","native","native_conflict","native_daily_conflict"] as const)("task4.4 preserves original member submission owning writes and access (%s)",async scenario=>{
  const {routeSource,routeTarget}=await routeControls(),native=scenario.startsWith('native'),site=native?'luvdia':'otw',db=native?targetDb:sourceDb,repository=native?routeTarget:routeSource;
  const fixture=await pendingAdminFixture(site),edge=vi.fn(async()=>({success:true}));fixture.runtime.OTW_PLAY_SUBMISSION_RATE_LIMITER={limit:edge};fixture.runtime.YOUTUBE_API_KEY='';
  const prior=await db.prepare("SELECT value FROM settings WHERE key='otw_play_submission_daily_limit'").first<string>('value');
  await db.prepare("INSERT INTO settings(key,value) VALUES('otw_play_submission_daily_limit','2') ON CONFLICT(key) DO UPDATE SET value='2'").run();
  const body={clientRequestId:'00000000-0000-4000-8000-000000000021',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',title:'Member original',originalArtists:[{kind:'external',displayName:'Original artist'}],participants:[{kind:'member',memberUid:1,participantRole:'vocal'}],tags:['J-POP']};
  const request=async(path='',method='POST',input:unknown=body,key='member-original-request',user=`${site}-member`,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/submissions${path}`,{method,headers:{Authorization:`Bearer ${await fixture.token(user)}`,'Content-Type':'application/json','Idempotency-Key':key},...(method==='GET'?{}:{body:JSON.stringify(input)})}),runtime);
  const activate=async()=>{
    const baseline=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) {expect(JSON.stringify(operation)).not.toContain('otw-member');await routeTarget.receiveOperation(operation);}
    for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  };
  const consume=async(operationId:string)=>{
    const operation=await routeTarget.exportOperation(plan.id,operationId),message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);return message;
  };
  const controls=()=>db.prepare("SELECT operation_id,codec,outcome FROM (SELECT operation_id,json_extract(envelope_json,'$.nativeReceipt.command.action') codec,json_extract(outcome_json,'$.outcome') outcome FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.member.mutate')").all<{operation_id:string;codec:string;outcome:string|null}>();
  try {
    const created=await request('','POST',body,'member-original-request',`${site}-member`,scenario==='source_race'?{...fixture.runtime,otw_db:interleave(sourceDb,'batch',()=>routeSource.freeze(plan.id,Date.now()))}:fixture.runtime);
    if(scenario==='source_race') {expect(created.status,await created.clone().text()).toBe(409);expect(await created.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});expect(await db.prepare('SELECT count(*) n FROM music_cover_proposals').first('n')).toBe(0);expect(await db.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);return;}
    expect(created.status,await created.clone().text()).toBe(native?409:201);
    if(native) {
      expect(await created.json()).toMatchObject({error:{code:'CONTENT_ACCEPTED'}});expect(await db.prepare('SELECT count(*) n FROM music_cover_proposals').first('n')).toBe(0);
      const edgeCount=edge.mock.calls.length;expect((await request()).status).toBe(409);expect(edge).toHaveBeenCalledTimes(edgeCount);
      await activate();const operation=(await controls()).results[0]!;expect((await consume(operation.operation_id)).ack).toHaveBeenCalledOnce();
    }
    const replay=await request();expect(replay.status,await replay.clone().text()).toBe(200);
    const saved=await replay.json() as {data:{id:string;version:number;status:string;title:string};idempotentReplay:boolean},id=saved.data.id;
    expect(saved).toMatchObject({idempotentReplay:true,data:{title:'Member original',version:0,status:'pending_review',participants:[{memberUid:1,displayName:'bing_hayu',participantRole:'vocal'}]}});
    const detail=await request(`/${id}`,'GET');expect(await detail.json()).toMatchObject({data:saved.data});
    expect((await request(`/${id}`,'GET',{},'member-foreign-request',`${site}-stranger`)).status).toBe(404);
    const {clientRequestId,...snapshot}=body;void clientRequestId;
    const update={...snapshot,expectedVersion:0,title:'Member changed',participants:[{kind:'member',memberUid:1,participantRole:'chorus'}]};
    const eventCount=await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_type='proposal'").first<number>('n');
    if(scenario==='source_event_abort'||scenario==='native'||scenario==='native_conflict') await db.prepare("CREATE TRIGGER task44_member_event_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='proposal.updated' BEGIN SELECT RAISE(ABORT,'member_required_event_abort'); END").run();
    const edited=await request(`/${id}`,'PATCH',update,'member-update-original');
    if(scenario==='source_event_abort'||scenario==='native'||scenario==='native_conflict') {
      expect(edited.status,await edited.clone().text()).toBe(503);expect(await db.prepare('SELECT submitted_title,version FROM music_cover_proposals WHERE id=?').bind(id).first()).toEqual({submitted_title:'Member original',version:0});
      expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_type='proposal'").first('n')).toBe(eventCount);
      await db.prepare('DROP TRIGGER task44_member_event_abort').run();
      if(!native) {expect(await db.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(1);return;}
      const operation=(await controls()).results.find(row=>row.codec==='update')!;expect(operation.outcome).toBeNull();
      if(scenario==='native_conflict') {const winner=await request(`/${id}`,'PATCH',{...update,title:'Newer member winner'},'member-update-winner');expect(winner.status,await winner.clone().text()).toBe(200);}
      expect((await consume(operation.operation_id)).ack).toHaveBeenCalledOnce();
      if(scenario==='native_conflict') {expect((await repository.exportOperation(plan.id,operation.operation_id)).outcome?.outcome).toBe('conflicted');expect(await db.prepare('SELECT submitted_title,version FROM music_cover_proposals WHERE id=?').bind(id).first()).toEqual({submitted_title:'Newer member winner',version:1});expect((await request(`/${id}`,'PATCH',update,'member-update-original')).status).toBe(409);return;}
    } else expect(edited.status,await edited.clone().text()).toBe(200);
    const actualEdit=await request(`/${id}`,'PATCH',update,'member-update-original');expect(actualEdit.status,await actualEdit.clone().text()).toBe(200);
    const editedDto=(await actualEdit.json() as {data:unknown}).data;
    expect(await (await request(`/${id}`,'GET')).json()).toEqual({data:editedDto});
    expect(await db.prepare("SELECT actor_kind,actor_user_id,detail_json FROM music_catalog_events WHERE aggregate_id=? AND event_type='proposal.updated'").bind(id).first()).toEqual({actor_kind:'member',actor_user_id:`${site}-member`,detail_json:JSON.stringify({changedFields:['title','participants']})});
    if(scenario==='native_daily_conflict') {
      const stale=await request(`/${id}`,'PATCH',update,'member-new-stale-request');expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({error:{code:'PLAY_SUBMISSION_STALE_WRITE'}});
      await db.prepare("UPDATE settings SET value='1' WHERE key='otw_play_submission_daily_limit'").run();
      const deniedBody={...body,clientRequestId:'00000000-0000-4000-8000-000000000022',youtubeUrl:'https://youtu.be/MemberVid02'};
      const denied=await request('','POST',deniedBody);expect(denied.status,await denied.clone().text()).toBe(429);expect(await denied.json()).toMatchObject({error:{code:'PLAY_SUBMISSION_RATE_LIMITED',fields:{scope:'daily'}}});
      const failed=(await controls()).results.find(row=>row.codec==='create'&&row.outcome==='failed')!;expect(failed).toBeTruthy();expect((await consume(failed.operation_id)).ack).toHaveBeenCalledOnce();expect((await request('','POST',deniedBody)).status).toBe(429);expect(await db.prepare('SELECT count(*) n FROM music_cover_proposals').first('n')).toBe(1);
    }
    const withdrawn=await request(`/${id}/withdraw`,'POST',{expectedVersion:1},'member-withdraw-original');expect(withdrawn.status,await withdrawn.clone().text()).toBe(200);
    const withdrawnDto=await withdrawn.json();expect(withdrawnDto).toMatchObject({data:{id,status:'withdrawn',version:2,editable:false,withdrawable:false}});expect(await (await request(`/${id}/withdraw`,'POST',{expectedVersion:1},'member-withdraw-original')).json()).toEqual(withdrawnDto);
    expect(await db.prepare("SELECT actor_kind,actor_user_id FROM music_catalog_events WHERE aggregate_id=? AND event_type='proposal.withdrawn'").bind(id).first()).toEqual({actor_kind:'member',actor_user_id:`${site}-member`});
    if(!native) {
      const originalReceipts=(await db.prepare('SELECT envelope_json,outcome_json FROM content_transition_operations ORDER BY operation_id').all()).results;
      await activate();await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));
      const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:'CONTENT_MOVED'}});
      expect((await request(`/${id}`,'GET')).status).toBe(404);expect((await request(`/${id}`,'PATCH',update,'member-update-original','otw-stranger')).status).toBe(404);
      const changed=await request('','POST',{...body,title:'Different retry'});expect(await changed.json()).toMatchObject({error:{code:'PLAY_SUBMISSION_IDEMPOTENCY_CONFLICT'}});
      expect((await db.prepare('SELECT envelope_json,outcome_json FROM content_transition_operations ORDER BY operation_id').all()).results).toEqual(originalReceipts);
      expect(await targetDb.prepare('SELECT submitted_by_user_id,status,version FROM music_cover_proposals WHERE id=?').bind(id).first()).toEqual({submitted_by_user_id:null,status:'withdrawn',version:2});
      const history=await targetDb.prepare("SELECT record_json FROM content_historical_records WHERE source_table='music_catalog_events' AND json_extract(record_json,'$.values.event_type')='proposal.updated'").first<string>('record_json');expect(history).not.toBeNull();expect(JSON.parse(history!)).toMatchObject({values:{detail_json:{changedFields:['title','participants']}}});expect(history).not.toContain('otw-member');
      const independent=await request('','POST',{...body,clientRequestId:'00000000-0000-4000-8000-000000000023',youtubeUrl:'https://youtu.be/MemberVid03',participants:[{kind:'external',displayName:'Independent',participantRole:'vocal'}]},'member-independent-key','ordinary-member');expect(independent.status,await independent.clone().text()).toBe(201);
    }
  } finally {await db.prepare('DROP TRIGGER IF EXISTS task44_member_event_abort').run();if(prior===null) await db.prepare("DELETE FROM settings WHERE key='otw_play_submission_daily_limit'").run();else await db.prepare("UPDATE settings SET value=? WHERE key='otw_play_submission_daily_limit'").bind(prior).run();fixture.close();}
},20000);
it('task4.4 validates the original member changedFields on projection and decode',async()=>{
  const context={sourceSite:'otw' as const,members:[]},event={id:'member-event',aggregate_type:'proposal',aggregate_id:'member-proposal',event_type:'proposal.updated',actor_kind:'member',actor_user_id:'private-member',created_at:1,detail_json:JSON.stringify({changedFields:['title','participants']})};
  const record=(await projectCapturedRecord('music_catalog_events',JSON.stringify([event.id]),event,context))!;expect(decodeProjectedRecord(JSON.parse(JSON.stringify(record)),context)).toEqual(record);
  for(const changedFields of [['actorUserId'],['submittedByUserId'],['title',3],['title',null],null]) {
    await expect(projectCapturedRecord('music_catalog_events',JSON.stringify([event.id]),{...event,detail_json:JSON.stringify({changedFields})},context)).rejects.toThrow(/changed field/);
    const raw=JSON.parse(JSON.stringify(record));raw.value.detail_json.changedFields=changedFields;expect(()=>decodeProjectedRecord(raw,context)).toThrow(/changed field/);
  }
});
it.each(["source","source_race","source_failure","source_moved","native","native_conflict"] as const)("task4.4 rejects proposals through the original owning review batch (%s)",async scenario=>{
  await seedPublicationCatalog();
  await sourceDb.batch([...["selected","ordinary"].flatMap(kind=>[
    sourceDb.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,segment_start_seconds,submitted_title,submitted_tags_json,created_at,updated_at) VALUES(?, 'source-member', ?, 'https://youtu.be/dQw4w9WgXcQ','dQw4w9WgXcQ',?,?,'[\"J-POP\"]',1,1)").bind(`rejection-${kind}`,`rejection-${kind}`,kind==="selected"?0:10,`Original ${kind} proposal`),
    sourceDb.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_name_snapshot,participant_role) VALUES(?,0,?,'Original singer','vocal')").bind(`rejection-${kind}`,kind==="selected"?"publication-singer":"publication-other"),
  ])]);
  const {routeSource,routeTarget}=await routeControls(),native=scenario.startsWith("native"),db=native?targetDb:sourceDb,fixture=await pendingAdminFixture(native?"luvdia":"otw");fixture.runtime.YOUTUBE_API_KEY="";
  const request=async(id="rejection-selected",key=`proposal-original-${scenario}`,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/submissions/${id}/reject`,{method:"POST",headers:{Authorization:`Bearer ${await fixture.token(`${native?"luvdia":"otw"}-pending-admin`)}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({expectedVersion:0,resultCode:"duplicate",note:"Original reason"})}),runtime);
  const snapshot=async()=>JSON.stringify(await Promise.all(["music_cover_proposals","music_catalog_meta","music_public_read_model_meta"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results))));
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    const before=await snapshot(),eventCount=await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE event_type='proposal.rejected'").first<number>("n");
    if(scenario==="source_failure") await db.prepare("CREATE TRIGGER task44_proposal_event_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='proposal.rejected' BEGIN SELECT RAISE(ABORT,'proposal_required_event_abort'); END").run();
    if(scenario==="source_moved") {await activate();const frozen=await routeSource.readJournal(plan.id);const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});expect(await snapshot()).toBe(before);expect((await request("rejection-ordinary","proposal-independent-original")).status).toBe(200);expect(await routeSource.readJournal(plan.id)).toEqual(frozen);return;}
    const response=await request("rejection-selected",`proposal-original-${scenario}`,scenario==="source_race"?{...fixture.runtime,otw_db:interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now()))}:fixture.runtime);
    if(scenario==="source_failure" || scenario==="source_race") {expect(response.status,await response.clone().text()).toBe(scenario==="source_race"?409:422);expect(await snapshot()).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;}
    expect(response.status,await response.clone().text()).toBe(native?409:200);
    const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id') LIKE 'otw-play.proposal.%'").first<string>("operation_id"))!;
    if(native) {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});expect(await snapshot()).toBe(before);await activate();
      if(scenario==="native_conflict") {const winner=await request("rejection-selected","proposal-concurrent-original");expect(winner.status,await winner.clone().text()).toBe(200);}
      const operation=await routeTarget.exportOperation(plan.id,operationId),message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      const consume=()=>handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
      if(scenario==="native") {
        await db.prepare("CREATE TRIGGER task44_proposal_event_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='proposal.rejected' BEGIN SELECT RAISE(ABORT,'proposal_required_event_abort'); END").run();
        await consume();expect(message.retry).toHaveBeenCalledOnce();expect((await routeTarget.exportOperation(plan.id,operationId)).outcome).toBeNull();expect(await snapshot()).toBe(before);
        await db.prepare("DROP TRIGGER task44_proposal_event_abort").run();
      }
      await consume();expect(message.ack).toHaveBeenCalledOnce();
      if(scenario==="native_conflict") {expect((await routeTarget.exportOperation(plan.id,operationId)).outcome?.outcome).toBe("conflicted");expect(await db.prepare("SELECT version FROM music_cover_proposals WHERE id='rejection-selected'").first("version")).toBe(1);return;}
    }
    const result=await (await request()).json() as {data:unknown;catalogRevision:number};
    expect(result.data).toMatchObject({id:"rejection-selected",status:"rejected",version:1,reviewedByUserId:`${native?"luvdia":"otw"}-pending-admin`,reviewResultCode:"duplicate",reviewNote:"Original reason",historicalReview:false,tags:["J-POP"],participants:[{submittedNameSnapshot:"Original singer"}]});
    const actual=await handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/submissions?status=rejected`,{headers:{Authorization:`Bearer ${await fixture.token(`${native?"luvdia":"otw"}-pending-admin`)}`}}),fixture.runtime);
    expect(actual.status).toBe(200);expect((await actual.json() as {data:unknown[]}).data).toContainEqual(result.data);
    expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE event_type='proposal.rejected'").first<number>("n")).toBe(eventCount!+1);
    const saved=await snapshot();expect(await (await request()).json()).toEqual(result);expect(await snapshot()).toBe(saved);
    if(!native) {
      const baseline=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) {expect(JSON.stringify(operation)).not.toContain("pending-admin");expect(JSON.stringify(operation)).not.toContain("source-member");await routeTarget.receiveOperation(operation);}
      for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect(await targetDb.prepare("SELECT status,version,reviewed_by_user_id,historical_review FROM music_cover_proposals WHERE id='rejection-selected'").first()).toEqual({status:"rejected",version:1,reviewed_by_user_id:null,historical_review:1});
      const material=await targetDb.prepare("SELECT r.record_json FROM content_historical_records r JOIN content_historical_links l USING(source_site,source_table,source_key) WHERE l.subject_table='music_cover_proposals' AND l.subject_key='[\"rejection-selected\"]' AND json_extract(r.record_json,'$.values.event_type')='proposal.rejected'").first<string>("record_json");
      expect(material).not.toBeNull();expect(JSON.parse(material!)).toMatchObject({sourceSite:"otw",kind:"event",values:{aggregate_type:"proposal",event_type:"proposal.rejected",detail_json:{resultCode:"duplicate"}}});expect(material).not.toContain("pending-admin");
    }
  } finally {await db.prepare("DROP TRIGGER IF EXISTS task44_proposal_event_abort").run();fixture.close();}
},20000);
it.each(["source","source_moved","native","native_referenced"] as const)("task4.4 preserves actual channel deletion and original FK result (%s)",async scenario=>{
  await seedPublicationCatalog();
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,created_at,updated_at) VALUES('channel-delete-fixture','youtube',?,'Disposable channel','member_music','approved',1,1,1)").bind(`UC${"d".repeat(22)}`),
    sourceDb.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('channel-delete-fixture','publication-singer')"),
  ]);
  const {routeSource,routeTarget}=await routeControls(),native=scenario.startsWith("native"),fixture=await pendingAdminFixture(native?"luvdia":"otw"),database=native?targetDb:sourceDb;
  fixture.runtime.YOUTUBE_API_KEY="";
  const id=scenario==="native_referenced"?"publication-channel":"channel-delete-fixture";
  const request=async()=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/channels?id=${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":`channel-delete-${scenario}`},body:JSON.stringify({expectedVersion:0})}),fixture.runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    if(scenario==="source_moved") await activate();
    const response=await request();expect(response.status,await response.clone().text()).toBe(scenario==="source"?200:409);
    if(scenario==="source_moved") {expect(await response.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});expect(await sourceDb.prepare("SELECT id FROM music_channels WHERE id=?").bind(id).first("id")).toBe(id);return;}
    if(native) {
      const operationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.delete.mutate'").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      expect(await targetDb.prepare("SELECT id FROM music_channels WHERE id=?").bind(id).first("id")).toBe(id);await activate();
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      const receipt=await routeTarget.readCatalogDeleteReceipt(operationId);expect(receipt?.operation.outcome?.outcome).toBe(scenario==="native_referenced"?"failed":"committed");
      if(scenario==="native_referenced") {expect(receipt?.failure?.message).toContain("FOREIGN KEY constraint failed");expect((await request()).status).toBe(422);expect(await targetDb.prepare("SELECT id FROM music_channels WHERE id=?").bind(id).first("id")).toBe(id);return;}
    }
    const result=await (await request()).json();expect(result).toMatchObject({data:{id}});
    expect(await database.prepare("SELECT id FROM music_channels WHERE id=?").bind(id).first()).toBeNull();
    expect(await database.prepare("SELECT count(*) n FROM music_channel_entities WHERE channel_id=?").bind(id).first("n")).toBe(0);
    expect(await database.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id=? AND event_type='channel.deleted'").bind(id).first("n")).toBe(1);
  } finally {fixture.close();}
},20000);
it.each(["source_dictionary","native","native_duplicate"] as const)("task4.4 preserves actual standalone song creation receipt (%s)",async scenario=>{
  await seedPublicationCatalog();
  const {routeSource,routeTarget}=await routeControls(),native=scenario!=="source_dictionary",fixture=await pendingAdminFixture(native?"luvdia":"otw");
  fixture.runtime.YOUTUBE_API_KEY="";
  const database=native?targetDb:sourceDb,key="song-creation-original-request-001";
  const body={slug:"new-standalone-song",title:"New standalone song",isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:"unknown",aliases:[{alias:"New alias",locale:null,aliasKind:null}],originalArtists:[{entityId:"publication-singer",creditOrder:0,isPrimary:true}],tags:["New tag"]};
  const request=async(value=body,requestKey=key)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/songs`,{method:"POST",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":requestKey},body:JSON.stringify(value)}),fixture.runtime);
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    if(!native) {
      await activate();const journal=await routeSource.readJournal(plan.id);
      const response=await request();expect(response.status,await response.clone().text()).toBe(201);
      expect(await database.prepare("SELECT count(*) n FROM music_songs WHERE slug=?").bind(body.slug).first("n")).toBe(1);
      expect(await targetDb.prepare("SELECT count(*) n FROM music_songs WHERE slug=?").bind(body.slug).first("n")).toBe(0);
      expect(await routeSource.readJournal(plan.id)).toEqual(journal);return;
    }
    const response=await request();expect(response.status,await response.clone().text()).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
    expect(await database.prepare("SELECT count(*) n FROM music_songs WHERE slug=?").bind(body.slug).first("n")).toBe(0);
    const operationId=(await database.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.song.create'").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
    expect(JSON.stringify(operation)).not.toContain("pending-admin");
    await expect(routeTarget.receiveOperation(operation)).rejects.toThrow(/Native song/);
    const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
    await activate();
    if(scenario==="native_duplicate") {
      const independent=await request({...body,title:"Independent saved song"},"independent-song-creation-002");expect(independent.status,await independent.clone().text()).toBe(201);
    }
    const revision=await database.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first<number>("revision");
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
    expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
    const receipt=(await routeTarget.readSongCreationReceipt(operationId))!;
    expect(receipt.operation.outcome).toMatchObject({outcome:scenario==="native_duplicate"?"failed":"committed",sideEffectReconciled:true});
    const replay=await request();expect(replay.status).toBe(scenario==="native_duplicate"?422:201);
    if(scenario==="native_duplicate") {
      expect(receipt.failure?.message).toContain("UNIQUE constraint failed");expect(receipt.result).toBeNull();
      expect(await database.prepare("SELECT title FROM music_songs WHERE slug=?").bind(body.slug).first("title")).toBe("Independent saved song");
      expect(await database.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision")).toBe(revision);
    } else {
      const result=await replay.json();expect(result).toEqual(receipt.result);
      expect(result).toMatchObject({data:{id:receipt.command.ids.songId,title:body.title,version:0,tags:body.tags,aliases:body.aliases,originalArtists:[{entityId:"publication-singer",creditOrder:0,isPrimary:true}]}});
      expect(await database.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id=? AND event_type='song.created'").bind(receipt.command.ids.songId).first("n")).toBe(1);
      const audits=(await database.prepare("SELECT resource_id FROM admin_audit_logs WHERE event_type='otw_play.song.created'").all<{resource_id:string}>()).results;
      expect(audits.length).toBeGreaterThan(0);expect(audits.every(audit=>audit.resource_id===receipt.command.ids.songId)).toBe(true);
      expect(await database.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision")).toBe(Number(revision)+1);
    }
    const finalRevision=await database.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision");
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);
    expect(message.ack).toHaveBeenCalledTimes(2);expect(await database.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision")).toBe(finalRevision);
  } finally {fixture.close();}
},20000);
it.each(["source_publish","source_withdraw","source_fence_race","source_moved_independent","batch_failure","native_publish","native_withdraw","native_conflict","native_invalid"] as const)("task4.4 preserves original performance publication API and whole batch (%s)",async scenario=>{
  const native=scenario.startsWith("native"),withdraw=scenario.endsWith("withdraw"),initial=withdraw?"published":"draft",final=withdraw?"withdrawn":"published";
  await seedPublicationCatalog(initial,scenario==="native_invalid");
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture(native?"luvdia":"otw");fixture.runtime.YOUTUBE_API_KEY="";
  const db=native?targetDb:sourceDb,key="actual-publication-request-001";
  const request=async(id="publication-selected",version=0,target=final,requestKey=key,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/performances/${id}/${target==="published"?"publish":"withdraw"}`,{method:"POST",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":requestKey},body:JSON.stringify({expectedVersion:version})}),runtime);
  const snapshot=async(database:D1Database)=>JSON.stringify(await Promise.all(["music_performances","music_performance_participants","music_performance_sources","music_catalog_meta","music_public_read_model_meta","music_public_performance_sort_keys"].map(table=>database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results))));
  try {
    const before=await snapshot(db),events=Number(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id='publication-selected'").first("n"));
    if(scenario==="batch_failure") await db.prepare("CREATE TRIGGER task44_publication_abort BEFORE INSERT ON music_catalog_events WHEN NEW.event_type='performance.published' BEGIN SELECT RAISE(ABORT,'Injected original publication event failure'); END").run();
    if(scenario==="source_moved_independent") {
      await routeSource.freeze(plan.id,Date.now());const journal=await routeSource.readJournal(plan.id);
      const moved=await request();expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});expect(await snapshot(db)).toBe(before);
      expect((await request("publication-other",0,"published","actual-independent-publication-002")).status).toBe(200);
      expect(await db.prepare("SELECT publication_status FROM music_performances WHERE id='publication-selected'").first("publication_status")).toBe("draft");expect(await routeSource.readJournal(plan.id)).toEqual(journal);return;
    }
    const response=await request("publication-selected",0,final,key,scenario==="source_fence_race"?{...fixture.runtime,otw_db:interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now()))}:fixture.runtime);
    if(scenario==="batch_failure" || scenario==="source_fence_race" || scenario==="native_invalid") {
      expect(response.status,await response.clone().text()).toBe(scenario==="source_fence_race"?409:422);expect(await snapshot(db)).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;
    }
    expect(response.status,await response.clone().text()).toBe(native?409:200);let result:unknown=native?null:await response.json();
    if(native) {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});expect(await snapshot(db)).toBe(before);
      const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      if(scenario==="native_conflict") expect((await request("publication-selected",0,"published","actual-newer-publication-002")).status).toBe(200);
      message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      if(scenario==="native_conflict") {expect((await routeTarget.exportOperation(plan.id,operationId)).outcome?.outcome).toBe("conflicted");expect(await db.prepare("SELECT publication_status,version FROM music_performances WHERE id='publication-selected'").first()).toEqual({publication_status:"published",version:1});return;}
      result=await (await request()).json();expect(await sourceDb.prepare("SELECT publication_status FROM music_performances WHERE id='publication-selected'").first("publication_status")).toBe(initial);
    }
    expect(result).toMatchObject({data:{id:"publication-selected",publicationStatus:final,version:1,participants:[{displayName:"Selected Singer"}],sources:[{source:{externalId:"PubVideo001"},isPrimary:true}]}});
    const catalogResponse=await handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/catalog`,{headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`}}),fixture.runtime);
    const catalog=await catalogResponse.json<{data:{performances:Array<{id:string}>}}>();expect((result as {data:unknown}).data).toEqual(catalog.data.performances.find(value=>value.id==="publication-selected"));
    expect(Number(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id='publication-selected'").first("n"))).toBe(events+1);
    const saved=await snapshot(db);expect(await (await request()).json()).toEqual(result);expect(await snapshot(db)).toBe(saved);
    if(!native) {
      const header=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) {expect(JSON.stringify(operation)).not.toContain("pending-admin");await routeTarget.receiveOperation(operation);}
      for(const commit of await routeSource.exportProjectedCommits(plan.id,header.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect(await targetDb.prepare("SELECT publication_status FROM music_performances WHERE id='publication-selected'").first("publication_status")).toBe(final);
    }
  } finally {await db.prepare("DROP TRIGGER IF EXISTS task44_publication_abort").run();fixture.close();}
},20000);
it.each(["source_performance","source_song","source_fence_race","source_moved_song","native_performance","native_song","native_newer_publication","native_entity","native_referenced"] as const)("task4.4 preserves actual catalog deletion and original cascade (%s)",async scenario=>{
  await seedPublicationCatalog();
  if(scenario==="native_referenced") await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,linked_performance_id) VALUES('delete-linked-candidate','PubVideo001','converted',1,1,999,1,1,'publication-selected')").run();
  const kind=scenario==="native_entity"?"entity":scenario.endsWith("song")?"song":"performance",native=scenario.startsWith("native");
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture(native?"luvdia":"otw");fixture.runtime.YOUTUBE_API_KEY="";
  const db=native?targetDb:sourceDb,key="actual-catalog-delete-request-001";
  let id=kind==="song"?"publication-song":"publication-selected";
  const headers=async()=>({Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`,"Content-Type":"application/json","Idempotency-Key":key});
  const request=async(runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/play/admin/${kind==="entity"?"entities":kind==="song"?"songs":"performances"}/${id}`,{method:"DELETE",headers:await headers(),body:JSON.stringify({expectedVersion:0})}),runtime);
  const snapshot=async()=>JSON.stringify(await Promise.all(["music_songs","music_entities","music_performances","music_performance_participants","music_performance_sources","music_media_sources","music_catalog_meta","music_public_read_model_meta","music_public_performance_sort_keys"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(value=>value.results))));
  const activate=async()=>{await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);};
  try {
    if(kind==="entity") {
      await activate();
      const created=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/entities",{method:"POST",headers:{...await headers(),"Idempotency-Key":"actual-delete-entity-creation-002"},body:JSON.stringify({memberUid:null,entityKind:"person",displayName:"Disposable external",slug:"disposable-external"})}),fixture.runtime);
      expect(created.status,await created.clone().text()).toBe(201);id=(await created.json<{data:{id:string}}>()).data.id;
    }
    const before=await snapshot();
    if(scenario==="source_moved_song") await routeSource.freeze(plan.id,Date.now());
    const response=await request(scenario==="source_fence_race"?{...fixture.runtime,otw_db:interleave(db,"batch",()=>routeSource.freeze(plan.id,Date.now()))}:fixture.runtime);
    if(scenario==="source_moved_song" || scenario==="source_fence_race") {
      expect(response.status,await response.clone().text()).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});expect(await snapshot()).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);return;
    }
    expect(response.status,await response.clone().text()).toBe(native && kind!=="entity"?409:200);
    let result=native && kind!=="entity"?null:await response.json();
    if(native && kind!=="entity") {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});expect(await snapshot()).toBe(before);
      const operationId=(await db.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='otw-play.delete.mutate'").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();await activate();
      if(scenario==="native_newer_publication") {
        const changed=await handleWorkerFetch(new Request("http://localhost:5174/api/play/admin/performances/publication-selected/publish",{method:"POST",headers:{...await headers(),"Idempotency-Key":"newer-publication-before-delete-003"},body:JSON.stringify({expectedVersion:0})}),fixture.runtime);expect(changed.status).toBe(200);
      }
      message.retry.mockClear();await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
      if(scenario==="native_referenced") {
        const failed=await routeTarget.readCatalogDeleteReceipt(operationId);
        expect(failed?.operation.outcome).toMatchObject({outcome:"failed",sideEffectReconciled:true});expect(failed?.failure?.message).toContain("FOREIGN KEY constraint failed");expect(failed?.result).toBeNull();
        expect(await snapshot()).toBe(before);expect(await db.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id=?").bind(operationId).first("n")).toBe(0);
        const retry=await request();expect(retry.status).toBe(422);expect(await retry.json()).toMatchObject({error:{code:"PLAY_ADMIN_VALIDATION_FAILED"}});return;
      }
      if(scenario==="native_newer_publication") {expect((await routeTarget.exportOperation(plan.id,operationId)).outcome?.outcome).toBe("conflicted");expect(await db.prepare("SELECT publication_status FROM music_performances WHERE id=?").bind(id).first("publication_status")).toBe("published");return;}
      result=await (await request()).json();expect(await sourceDb.prepare("SELECT count(*) n FROM music_performances WHERE id='publication-selected'").first("n")).toBe(1);
    }
    expect(result).toMatchObject({data:{id},catalogRevision:expect.any(Number)});
    const table=kind==="entity"?"music_entities":kind==="song"?"music_songs":"music_performances";
    expect(await db.prepare(`SELECT count(*) n FROM ${table} WHERE id=?`).bind(id).first("n")).toBe(0);
    if(kind!=="entity") {
      expect(await db.prepare("SELECT count(*) n FROM music_performance_participants WHERE performance_id='publication-selected'").first("n")).toBe(0);
      expect(await db.prepare("SELECT count(*) n FROM music_performance_sources WHERE performance_id='publication-selected'").first("n")).toBe(0);
      expect(await db.prepare("SELECT count(*) n FROM music_media_sources WHERE id='publication-source'").first("n")).toBe(!native && kind==="performance"?1:0);
    }
    const saved=await snapshot();expect(await (await request()).json()).toEqual(result);expect(await snapshot()).toBe(saved);
    if(!native) {
      const header=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
      for(const commit of await routeSource.exportProjectedCommits(plan.id,header.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect(await targetDb.prepare("SELECT count(*) n FROM music_performances WHERE id='publication-selected'").first("n")).toBe(0);
    }
  } finally {fixture.close();}
},20000);
async function collectorFixture() {
  const started=Date.parse("2026-10-15T13:00:00+09:00"),date="2026-10-14",rangeStart=Date.parse(`${date}T00:00:00+09:00`);
  await sourceDb.batch([
    ...[1,2,3].map(uid=>sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=?").bind(`https://chzzk.naver.com/${String.fromCharCode(96+uid).repeat(32)}`,uid)),
    sourceDb.prepare("INSERT INTO members(uid,code,name,url_chzzk) VALUES(90,'other','Unrelated',?)").bind(`https://chzzk.naver.com/${"d".repeat(32)}`),
    ...[2,3,90].map(uid=>sourceDb.prepare("INSERT INTO schedule_day_assessments(member_uid,date,channel_id,checked_at,range_start,range_end,scan_status,broadcast_seen,decision) VALUES(?,?,?,?,?,?,'complete',?,?)").bind(uid,date,(uid===90?"d":String.fromCharCode(96+uid)).repeat(32),started,rangeStart,rangeStart+86400000,uid===3?0:1,uid===3?"none":"pending")),
    ...[2,3,90].map(uid=>sourceDb.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,title,status,action_type,candidate_kind) VALUES(?,? ,?,'Original holiday','휴방','create','holiday_suggestion')").bind(uid,uid===90?"Private unrelated member":`Selected ${uid}`,date)),
  ]);
  return {started,date};
}
it.each(["source","batch_failure","fence_race","source_moved_independent","source_cache_overlap","native","native_conflict"] as const)("task4.4 preserves the actual X redaction owning batch and result (%s)",async scenario=>{
  const withCache=scenario!=="source_moved_independent",native=scenario.startsWith("native"),postId="10001",previewId="10002";
  const value=(id:string)=>JSON.stringify({id,text:`Original ${id}`,username:id==="10004"?"other":"hayu",...(id===previewId?{quote:{postId,post:{id:postId,text:"Original preview"}},reply:{postId,post:{id:postId,text:"Original reply"}},links:[{url:"https://x.com/hayu/status/10001",title:"Original link preview",linkedPost:{id:postId,text:"Original link"}}]}:{})});
  await sourceDb.batch([
    sourceDb.prepare("UPDATE members SET url_twitter='@hayu' WHERE uid=1"),
    ...[postId,previewId,"10004"].map(id=>sourceDb.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES(?,?,?,?,?,1)").bind(id,id==="10004"?"other":"hayu",id==="10004"?"other":"hayu",value(id),"2026-10-15")),
    sourceDb.prepare("INSERT INTO x_post_facts(post_id,member_uid,member_name_snapshot,post_type,created_at,first_seen_at,updated_at) VALUES(?,1,'Selected','post',1,1,1)").bind(postId),
    sourceDb.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,hydrated_at,lease_token,lease_until,created_at,updated_at) VALUES(?,'quote',?,'hydrated',1,'old-local-lease',999,1,1)").bind(previewId,postId),
    ...(withCache?[sourceDb.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:redaction-fixture','posts',?,1,999999)").bind(JSON.stringify({posts:[JSON.parse(value(postId))]}))]:[]),
  ]);
  const {routeSource,routeTarget}=await routeControls(withCache?[{table:"x_api_cache",key:'["x:redaction-fixture"]',disposition:"include",reason:"Task-owned selected retained post cache"}]:[]);
  const fixture=await pendingAdminFixture(native?"luvdia":"otw"),db=native?targetDb:sourceDb;
  const snapshot=async(database:D1Database)=>Promise.all(["x_posts","x_post_facts","x_post_references","x_api_cache"].map(table=>database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results)));
  const before=await snapshot(sourceDb),auditBefore=await db.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first<number>("n");
  const request=async(id=postId,runtime=fixture.runtime)=>handleWorkerFetch(new Request(`http://localhost:${native?5174:5173}/api/x/posts/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${await fixture.token(native?"luvdia-pending-admin":"otw-pending-admin")}`}}),runtime);
  try {
    if(scenario==="batch_failure" || scenario==="fence_race") {
      if(scenario==="batch_failure") await sourceDb.prepare("CREATE TRIGGER ct_x_redaction_audit_failure BEFORE INSERT ON admin_audit_logs WHEN NEW.event_type='x_post.redacted' BEGIN SELECT RAISE(ABORT,'Injected original audit failure'); END").run();
      const runtime=scenario==="batch_failure"?fixture.runtime:{...fixture.runtime,otw_db:interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now()))};
      const response=await request(postId,runtime);expect(response.status).toBe(scenario==="fence_race"?409:500);
      if(scenario==="fence_race") expect(await response.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});
      expect(await snapshot(sourceDb)).toEqual(before);expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
      expect(await sourceDb.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first("n")).toBe(auditBefore);return;
    }
    if(scenario.startsWith("source_")) {
      await routeSource.freeze(plan.id,Date.now());
      const moved=await request(scenario==="source_cache_overlap"?"10004":postId);expect(moved.status).toBe(409);expect(await moved.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});expect(await snapshot(sourceDb)).toEqual(before);
      expect(await db.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first("n")).toBe(auditBefore);
      if(scenario==="source_moved_independent") {expect((await request("10004")).status).toBe(200);expect(await sourceDb.prepare("SELECT value FROM x_posts WHERE id='10004'").first("value")).toBe("{}");expect(await sourceDb.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first("value")).toBe(value(postId));}
      return;
    }
    const response=await request();expect(response.status,await response.clone().text()).toBe(native?409:200);
    if(native) {
      expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
      expect(await targetDb.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first("value")).toBe(value(postId));expect(await snapshot(sourceDb)).toEqual(before);
      const operationId=(await targetDb.prepare("SELECT operation_id FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='x-posts.redact'").first<string>("operation_id"))!,operation=await routeTarget.exportOperation(plan.id,operationId);
      const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      if(scenario==="native_conflict") expect((await request(previewId)).status).toBe(200);
      const auditsBeforeQueue=await targetDb.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first<number>("n");
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();
      const outcome=await routeTarget.exportOperation(plan.id,operationId);expect(outcome.outcome?.outcome).toBe(scenario==="native_conflict"?"conflicted":"committed");
      const committed=await snapshot(targetDb),audits=await targetDb.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first<number>("n");
      expect(audits).toBe(auditsBeforeQueue!+(scenario==="native_conflict"?0:1));
      await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledTimes(2);expect(await snapshot(targetDb)).toEqual(committed);
      expect(await targetDb.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first("n")).toBe(audits);expect(await snapshot(sourceDb)).toEqual(before);
      if(scenario==="native_conflict") {expect(await targetDb.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first("value")).toBe(value(postId));return;}
    }
    expect(await db.prepare("SELECT value,hidden_reason FROM x_posts WHERE id=?").bind(postId).first()).toEqual({value:"{}",hidden_reason:"admin"});
    expect(await db.prepare("SELECT hidden_reason FROM x_post_facts WHERE post_id=?").bind(postId).first("hidden_reason")).toBe("admin");
    const preview=JSON.parse((await db.prepare("SELECT value FROM x_posts WHERE id=?").bind(previewId).first<string>("value"))!);expect(preview.quote.post).toBeNull();expect(preview.reply.post).toBeNull();expect(preview.links[0]).not.toHaveProperty("linkedPost");expect(preview.links[0]).not.toHaveProperty("title");
    expect(await db.prepare("SELECT resolution_state,lease_token,lease_until FROM x_post_references WHERE source_post_id=?").bind(previewId).first()).toEqual({resolution_state:"terminal",lease_token:null,lease_until:null});expect(await db.prepare("SELECT count(*) n FROM x_api_cache WHERE type='posts'").first("n")).toBe(0);
    expect(await db.prepare("SELECT actor_id,status,success_count FROM admin_audit_logs WHERE event_type='x_post.redacted' AND resource_id=? ORDER BY id DESC LIMIT 1").bind(postId).first()).toEqual({actor_id:native?"luvdia-pending-admin":"otw-pending-admin",status:"success",success_count:1});
    if(!native) {
      expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='x-posts.local_redaction' AND json_extract(outcome_json,'$.outcome')='committed'").first("n")).toBe(1);expect((await request()).status).toBe(200);
      const header=await routeSource.describeBaseline(plan.id);await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
      for(const operation of await routeSource.exportFrozenOperations(plan.id)) {expect(JSON.stringify(operation)).not.toContain("otw-pending-admin");await routeTarget.receiveOperation(operation);}
      for(const commit of await routeSource.exportProjectedCommits(plan.id,header.boundary)) await routeTarget.installProjectedCommit(commit);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect(await targetDb.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first("value")).toBe("{}");expect(await targetDb.prepare("SELECT count(*) n FROM admin_audit_logs WHERE event_type='x_post.redacted'").first("n")).toBe(0);
    }
  } finally {fixture.close();await sourceDb.prepare("DROP TRIGGER IF EXISTS ct_x_redaction_audit_failure").run();for(const database of [sourceDb,targetDb]) await database.prepare("DELETE FROM admin_audit_logs WHERE event_type='x_post.redacted' AND actor_id IN ('otw-pending-admin','luvdia-pending-admin') AND resource_id IN ('10001','10002','10004')").run();}
});
it("standalone collector preserves its whole candidate and both global holiday batches",async()=>{
  const {started,date}=await collectorFixture();
  await sourceDb.prepare("DELETE FROM content_transitions").run();
  await targetDb.prepare("DELETE FROM content_transitions").run();
  await sourceDb.prepare("INSERT INTO schedule_broadcast_observations(vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at) VALUES('chzzk:actual-candidate',1,?,'Actual collected title',?,?,3600,?,?)").bind("a".repeat(32),Date.parse(`${date}T12:00:00+09:00`),Date.parse(`${date}T13:00:00+09:00`),started,started).run();
  const clock=vi.spyOn(Date,"now").mockReturnValue(started);
  try {
    const result=await autoUpdateSchedules(getDb({otw_db:sourceDb} as Env),3,{skipScan:true,matchTarget:{memberUid:1,date},collectorWriter:new D1CollectorTransitionWriter(source,"otw")});
    expect(result).toMatchObject({updated:1,obsoletePending:2});
    expect((await sourceDb.prepare("SELECT member_uid,candidate_kind FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:1,candidate_kind:"missing_schedule"},{member_uid:3,candidate_kind:"holiday_suggestion"}]);
    expect((await sourceDb.prepare("SELECT member_uid,decision FROM schedule_day_assessments ORDER BY member_uid").all()).results).toEqual([{member_uid:2,decision:"none"},{member_uid:3,decision:"pending"},{member_uid:90,decision:"none"}]);
    expect((await sourceDb.prepare("SELECT member_uid,action FROM update_logs ORDER BY id").all()).results).toEqual([{member_uid:1,action:"auto_collected"},{member_uid:2,action:"candidate_obsolete"},{member_uid:90,action:"candidate_obsolete"},{member_uid:3,action:"auto_collected"}]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  } finally {clock.mockRestore();}
});
it("timed OTW cutoff keeps global holiday cleanup site-local and leaves selected raw history intact",async()=>{
  const {started,date}=await collectorFixture();
  await sourceDb.prepare("DELETE FROM content_transitions").run();
  await targetDb.prepare("DELETE FROM content_transitions").run();
  const selectedBefore=(await sourceDb.prepare("SELECT * FROM pending_schedules WHERE member_uid IN (2,3) ORDER BY member_uid").all()).results;
  const assessmentsBefore=(await sourceDb.prepare("SELECT * FROM schedule_day_assessments WHERE member_uid IN (2,3) ORDER BY member_uid").all()).results;
  const clock=vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-10-18T15:00:00Z"));
  try {
  const result=await reconcileHolidaySuggestions(sourceDb,{memberUid:90,date},started,new D1CollectorTransitionWriter(source,"otw"));
  expect(result).toMatchObject({created:0,withdrawn:1});
  expect((await sourceDb.prepare("SELECT * FROM pending_schedules WHERE member_uid IN (2,3) ORDER BY member_uid").all()).results).toEqual(selectedBefore);
  expect((await sourceDb.prepare("SELECT * FROM schedule_day_assessments WHERE member_uid IN (2,3) ORDER BY member_uid").all()).results).toEqual(assessmentsBefore);
  expect((await sourceDb.prepare("SELECT member_uid,action FROM update_logs").all()).results).toEqual([{member_uid:90,action:"candidate_obsolete"}]);
  } finally {clock.mockRestore();}
});
it("task4.4 rejects a collector affected-set phantom atomically and continues a fence-winning global cleanup locally",async()=>{
  const {started,date}=await collectorFixture();const {routeSource}=await routeControls();
  const before=(await sourceDb.prepare("SELECT * FROM pending_schedules ORDER BY id").all()).results;
  const raced=new D1TransitionRepository(interleave(sourceDb,"batch",async()=>{
    await sourceDb.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,title,status,action_type,candidate_kind) VALUES(90,'Unrelated',?,'Concurrent holiday','휴방','create','holiday_suggestion')").bind("2026-10-13").run();
  }),"otw","otw-db", null, null, catalogImportProjection);
  await expect(reconcileHolidaySuggestions(sourceDb,{memberUid:1,date},started,new D1CollectorTransitionWriter(raced,"otw"))).rejects.toThrow(/changed|conflict|변경/i);
  expect((await sourceDb.prepare("SELECT * FROM pending_schedules WHERE date=? ORDER BY id").bind(date).all()).results).toEqual(before);
  expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(0);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  const fenceRaced=new D1TransitionRepository(interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now())),"otw","otw-db", null, null, catalogImportProjection);
  const result=await reconcileHolidaySuggestions(sourceDb,{memberUid:90,date},started,new D1CollectorTransitionWriter(fenceRaced,"otw"));
  expect(result).toMatchObject({withdrawn:2,created:0});
  expect((await sourceDb.prepare("SELECT member_uid FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:2},{member_uid:3}]);
});

it("maintenance_native_collector refuses unowned work and commits the original global batch once",async()=>{
  const {started,date}=await collectorFixture(),{routeSource,routeTarget}=await routeControls([],true);
  const writer=new D1CollectorTransitionWriter(routeTarget,"luvdia");
  const before=(await targetDb.prepare("SELECT * FROM pending_schedules ORDER BY id").all()).results;
  await expect(reconcileHolidaySuggestions(targetDb,{memberUid:1,date},started,writer)).rejects.toMatchObject({code:'CONTENT_MAINTENANCE'});
  expect((await targetDb.prepare("SELECT * FROM pending_schedules ORDER BY id").all()).results).toEqual(before);
  expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
  const send=vi.fn(),runtime={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",OTW_OPS_BACKGROUND_QUEUE:{send},CONTENT_TRANSITION_PEER:undefined} as unknown as Env;
  await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  await reconcileHolidaySuggestions(targetDb,{memberUid:1,date},started,writer);
  expect((await targetDb.prepare("SELECT member_uid FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:3}]);
  expect((await targetDb.prepare("SELECT member_uid,action FROM update_logs ORDER BY id").all()).results).toEqual([{member_uid:2,action:"candidate_obsolete"},{member_uid:3,action:"auto_collected"}]);
  const operations=(await targetDb.prepare('SELECT operation_id,payload_hash FROM content_transition_operations').all<{operation_id:string;payload_hash:string}>()).results;
  expect(operations.length).toBeGreaterThan(0);
  for(const op of operations){const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:op.operation_id,payloadHash:op.payload_hash},ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();}
  expect(await targetDb.prepare('SELECT count(*) n FROM update_logs').first('n')).toBe(2);expect(send).not.toHaveBeenCalled();
  expect((await sourceDb.prepare("SELECT member_uid FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:2},{member_uid:3},{member_uid:90}]);
});

it("task4.4 admits the actual CHZZK scan before provider IO and commits observations with its original assessment",async()=>{
  const channel="a".repeat(32),started=Date.parse("2026-10-15T13:00:00+09:00");
  await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();await capturing();
  const clock=vi.spyOn(Date,"now").mockReturnValue(started);
  const fetchVideosBatch=vi.fn(async()=>{
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='schedules.chzzk_scan'").first("n")).toBe(1);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_attempts WHERE state='started'").first("n")).toBe(1);
    expect(await sourceDb.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n")).toBe(0);
    return [{channelId:channel,content:{data:[{videoId:"scan-vod",videoTitle:"Original provider page",publishDateAt:started-60_000,duration:3600,thumbnailImageUrl:null}]}}];
  });
  const fetchLiveStatus=vi.fn(async()=>({content:{status:"CLOSE",openDate:null},debug:{}}));
  const provider={fetchVideosBatch,fetchLiveStatus} as unknown as ChzzkVideoCatalog;
  const writer=new D1ChzzkScanTransitionWriter(source,new D1ChzzkReadJournal(sourceDb,"otw","source-db"),"otw",async()=>{throw new Error("Source must not use peer before fence");});
  try {
    const result=await scanAndPersistRecentChzzkObservations(getDb({otw_db:sourceDb} as Env),3,[channel],sourceDb,provider,writer,"actual-source-scan");
    expect(result).toMatchObject({channels:1,observations:1,channelResults:[{channelId:channel,status:"complete"}]});
    expect(await sourceDb.prepare("SELECT title,first_seen_at,last_seen_at FROM schedule_broadcast_observations WHERE vod_id='chzzk:scan-vod'").first()).toEqual({title:"Original provider page",first_seen_at:started,last_seen_at:started});
    expect(await sourceDb.prepare("SELECT checked_at,scan_status FROM schedule_day_assessments WHERE member_uid=1").first()).toEqual({checked_at:started,scan_status:"complete"});
    expect(await sourceDb.prepare("SELECT count(DISTINCT commit_seq) n FROM content_transition_journal WHERE row_table IN ('schedule_broadcast_observations','schedule_day_assessments')").first("n")).toBe(1);
    const again=await scanAndPersistRecentChzzkObservations(getDb({otw_db:sourceDb} as Env),3,[channel],sourceDb,provider,writer,"actual-source-scan");
    expect(again).toEqual(result);expect(fetchVideosBatch).toHaveBeenCalledTimes(1);expect(fetchLiveStatus).toHaveBeenCalledTimes(1);
  } finally {clock.mockRestore();}
});
it.each([false,true])("task4.4 retains a scheduled scan stage without acknowledging its unfinished original continuations (source phantom: %s)",async(phantom)=>{
  const {started,date}=await collectorFixture();
  const channel="a".repeat(32);await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();
  const {routeSource,routeTarget}=await routeControls(),jobs=new D1ScheduledJobRepository(sourceDb);
  const run=await jobs.createRun({jobType:"schedule_auto_update",source:"scheduled",idempotencyKey:"original-stage-run"});
  await jobs.addItems(run.id,[{targetKey:"original-scan",phase:"scan",lane:"auto-update",continuation:{channelIds:[channel]}}]);
  const item=await sourceDb.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND phase='scan'").bind(run.id).first<string>("id");
  const input=chzzkScanAdmission("original-stage"),operation=await routeSource.admitChzzkScan({...input,payload:{...input.payload,startedAt:started,parent:{kind:"scheduled",runId:run.id,itemId:item!}}});
  const fetchVideos=vi.spyOn(chzzkVideoCatalog,"fetchVideosBatch").mockResolvedValue([{channelId:channel,content:{data:[{videoId:"parent-candidate",videoTitle:"Original parent observation",publishDateAt:Date.parse(`${date}T13:00:00+09:00`),duration:3600,thumbnailImageUrl:null}]}}] as never);
  const fetchLive=vi.spyOn(chzzkVideoCatalog,"fetchLiveStatus").mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}} as never);
  const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId:operation.operationId,payloadHash:operation.payloadHash},ack:vi.fn(),retry:vi.fn()};
  try {
    await handleWorkerQueue({queue:"otw-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,{...siteEnv("otw"),otw_db:sourceDb} as Env);
    expect((await routeSource.exportOperation(plan.id,operation.operationId)).outcome).toBeNull();
    const stage=await routeSource.readChzzkScanStage(plan.id,operation.operationId);
    expect(stage).toMatchObject({parent:{kind:"scheduled",runId:run.id,itemId:item},owner:{site:"otw",resource:"otw-db",generation:1}});
    expect(stage!.targets).toEqual([{key:`bing_hayu:${date}`,memberUid:1,memberCode:"bing_hayu",date}]);
    await expect(routeSource.recordOutcome(plan.id,operation.operationId,{outcome:"failed",sideEffectReconciled:true,detail:"Premature scan-only terminal",chzzkScan:stage!.completion})).rejects.toThrow(/continuation/);
    expect(await sourceDb.prepare("SELECT count(*) n FROM auto_update_runs WHERE started_at=?").bind(input.payload.startedAt).first("n")).toBe(0);
    await handleWorkerQueue({queue:"otw-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,{...siteEnv("otw"),otw_db:sourceDb} as Env);
    expect(fetchVideos).toHaveBeenCalledTimes(1);expect(fetchLive).toHaveBeenCalledTimes(1);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    const sourceJournal=await routeSource.readJournal(plan.id);
    const sourceWriter=await D1ChzzkCollectorWriter.create(phantom?new D1TransitionRepository(interleave(sourceDb,"batch",async()=>{
      await sourceDb.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,title,status,action_type,candidate_kind) VALUES(90,'Unrelated','2026-10-13','Concurrent holiday','휴방','create','holiday_suggestion')").run();
    }),"otw","otw-db", null, null, catalogImportProjection):routeSource,plan.id,operation.operationId,stage!.targets[0].key);
    const sourcePortion=await reconcileHolidaySuggestions(sourceDb,{memberUid:1,date},started,sourceWriter);
    expect(sourcePortion).toMatchObject({created:0,withdrawn:phantom?0:1});expect(sourceWriter.hasConflicts).toBe(phantom);
    const sourceAudit=await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n");
    expect(await reconcileHolidaySuggestions(sourceDb,{memberUid:1,date},started,sourceWriter)).toEqual(sourcePortion);
    expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(sourceAudit);
    expect(await routeSource.readJournal(plan.id)).toEqual(sourceJournal);
    expect((await sourceDb.prepare("SELECT member_uid FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:2},{member_uid:3},...(phantom?[{member_uid:90},{member_uid:90}]:[])]);
    expect((await relayBindings.TARGET_RELAY.receiveOperation(plan.id,operation.operationId,operation.payloadHash)).accepted).toBe(true);
    const baseline=await routeSource.describeBaseline(plan.id);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,baseline.boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    const targetRuntime={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY} as unknown as Env;
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetRuntime);
    expect(await routeTarget.readChzzkScanStage(plan.id,operation.operationId)).toEqual(stage);
    expect((await routeTarget.exportOperation(plan.id,operation.operationId)).outcome).toBeNull();
    expect(fetchVideos).toHaveBeenCalledTimes(1);expect(fetchLive).toHaveBeenCalledTimes(1);
    const targetWriter=await D1ChzzkCollectorWriter.create(routeTarget,plan.id,operation.operationId,stage!.targets[0].key);
    const originalMatch=await routeTarget.prepareChzzkMatchInput(plan.id,operation.operationId,stage!.targets[0].key);
    const match=()=>autoUpdateSchedules(getDb({otw_db:targetDb} as Env),originalMatch.rangeDays,{skipScan:true,matchTarget:originalMatch.target,originalInput:originalMatch.input,collectorWriter:targetWriter});
    const targetPortion=await match();
    expect(targetPortion).toMatchObject({updated:1,obsoletePending:1});
    const targetAudit=await targetDb.prepare("SELECT count(*) n FROM update_logs").first("n");
    expect(await match()).toEqual(targetPortion);
    expect(await targetDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(targetAudit);
    expect((await targetDb.prepare("SELECT member_uid FROM pending_schedules ORDER BY member_uid").all()).results).toEqual([{member_uid:1},{member_uid:3}]);
    expect(await sourceDb.prepare("SELECT decision FROM schedule_day_assessments WHERE member_uid=3").first("decision")).toBe("none");
    await expect(routeTarget.readOutcomeReceipt(plan.id,"operation",operation.operationId)).rejects.toThrow(/continuation/);
    await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));
    await expect(routeTarget.complete(plan.id)).rejects.toThrow(/Frozen work/);
  } finally {fetchVideos.mockRestore();fetchLive.mockRestore();}
});
it.each(["terminal_failure","delivery_failure"] as const)("task4.4 atomically separates original match admission from no-admission disposition (%s)",async(scenario)=>{
  const {started,date}=await collectorFixture(),channel="a".repeat(32),{routeSource}=await routeControls(),jobs=new D1ScheduledJobRepository(sourceDb);
  const run=await jobs.createRun({jobType:"schedule_auto_update",source:"scheduled",idempotencyKey:`original-admission-race:${scenario}`});
  const [itemId]=await jobs.addItems(run.id,[{targetKey:"scan",phase:"scan",lane:"auto-update",continuation:{channelIds:[channel]}}]);
  const item=(await jobs.claimItem(itemId))!,clock=vi.spyOn(Date,"now").mockReturnValue(started);
  const provider={fetchVideosBatch:async()=>[{channelId:channel,content:{data:[{videoId:"admission-race",videoTitle:"Original",publishDateAt:scenario==="terminal_failure"?NaN:started-86400000,duration:3600,thumbnailImageUrl:null}]}}],fetchLiveStatus:async()=>({content:{status:"CLOSE",openDate:null},debug:{}})} as unknown as ChzzkVideoCatalog;
  const writer=new D1ChzzkScanTransitionWriter(routeSource,new D1ChzzkReadJournal(sourceDb,"otw","otw-db"),"otw",async()=>{throw new Error("No source peer before fence");});
  try {
    const result=await scanAndPersistRecentChzzkObservations(getDb({otw_db:sourceDb} as Env),3,[channel],sourceDb,provider,writer,itemId,{kind:"scheduled",runId:run.id,itemId});
    const operationId=`chzzk-scan:${itemId}:${plan.id}`,stage=(await routeSource.readChzzkScanStage(plan.id,operationId))!,child=stage.targets[0];expect(child.date).toBe(date);
    const match={targetKey:`member:1:date:${date}`,phase:"match",lane:"auto-update" as const,continuation:{memberUid:1,date,transition:{transitionId:plan.id,operationId,childKey:child.key}}};
    const before=(await sourceDb.prepare("SELECT * FROM pending_schedules ORDER BY id").all()).results;
    if(scenario==="terminal_failure") await jobs.completeItem(item,{status:"failed",result:{...result,attempted:1,succeeded:0,failed:1,queryFailed:0,incomplete:1}});
    else await jobs.markItemDeadLetter(itemId,"legacy_delivery_failure_after_owner_stage");
    const race=await Promise.allSettled([jobs.addItems(run.id,[match]),routeSource.closeUnadmittedChzzkChildren(run.id)]);
    expect(race.map(outcome=>outcome.status)).toEqual(["rejected","fulfilled"]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=? AND phase='match'").bind(run.id).first("n")).toBe(0);
    const disposition=await routeSource.readChzzkChildResult(plan.id,operationId,child.key);
    if(scenario==="terminal_failure") expect(disposition).toMatchObject({status:"failed",notAdmitted:{scanItemId:itemId,status:"failed"},result:{updated:0,obsoletePending:0}});
    else {
      expect(disposition).toBeNull();
      await jobs.recoverOriginalTransitionDelivery(run.id);const recovered=(await jobs.claimItem(itemId))!;
      await jobs.completeItem(recovered,{status:"succeeded",result:{...result,attempted:1,succeeded:1,failed:0,queryFailed:0,incomplete:0}});
      const admitted=await Promise.allSettled([jobs.addItems(run.id,[match]),routeSource.closeUnadmittedChzzkChildren(run.id)]);
      expect(admitted.map(outcome=>outcome.status)).toEqual(["fulfilled","fulfilled"]);
      expect(await sourceDb.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=? AND phase='match'").bind(run.id).first("n")).toBe(1);
      expect(await routeSource.readChzzkChildResult(plan.id,operationId,child.key)).toBeNull();
    }
    expect((await sourceDb.prepare("SELECT * FROM pending_schedules ORDER BY id").all()).results).toEqual(before);
    expect((await routeSource.readChzzkScanStage(plan.id,operationId))!.targets).toEqual(stage.targets);
  } finally {clock.mockRestore();}
});
it("task4.4 rejects an unknown original scheduled parent without admitting a provider request",async()=>{
  const channel="a".repeat(32);await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();await capturing();
  const input=chzzkScanAdmission("unknown-parent");
  await expect(source.admitChzzkScan({...input,payload:{...input.payload,parent:{kind:"scheduled",runId:"missing-run",itemId:"missing-item"}}})).rejects.toThrow();
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests").first("n")).toBe(0);
});
it("task4.4 retains one original CHZZK read response when late source completion races target recovery",async()=>{
  const channel="a".repeat(32);await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();
  const {routeSource}=await routeControls(),admitted=await routeSource.admitChzzkScan(chzzkScanAdmission("scan-original"));
  const journal=new D1ChzzkReadJournal(sourceDb,"otw","otw-db"),key=`videos:${channel}:0`,started=Date.now();
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests").first("n")).toBe(4);
  await expect(routeSource.admit(chzzkScanAdmission("bypass"))).rejects.toThrow(/registration/);
  const first=await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,started);expect(first.claimed).toBe(true);
  await routeSource.freeze(plan.id,started);
  expect((await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,started+30001)).claimed).toBe(false);
  const retry=await journal.claimFrozenOriginal(plan.id,admitted.operationId,admitted.payloadHash,key,started+30001);expect(retry.claimed).toBe(true);
  const response=(title:string)=>({kind:"videos" as const,videos:[{videoId:"original-video",videoTitle:title,publishDateAt:started,duration:3600,thumbnailImageUrl:null}]});
  const finish=(claim:typeof first.receipt,title:string)=>journal.complete(plan.id,admitted.operationId,admitted.payloadHash,key,claim.requestHash,claim.attempt,claim.claim!,response(title),started+30002);
  const result=await finish(first.receipt,"Late original response");expect(result.response).toEqual(response("Late original response"));
  expect((await finish(retry.receipt,"Changed retry response")).response).toEqual(result.response);
  expect((await sourceDb.prepare("SELECT attempt,state FROM content_transition_chzzk_attempts ORDER BY attempt").all()).results).toEqual([{attempt:1,state:"response_committed"},{attempt:2,state:"superseded"}]);
  const before=(await sourceDb.prepare("SELECT * FROM content_transition_chzzk_attempts ORDER BY attempt").all()).results;
  expect((await journal.claimFrozenOriginal(plan.id,admitted.operationId,admitted.payloadHash,key,started+70000)).claimed).toBe(false);
  await finish(first.receipt,"Late original response");expect((await sourceDb.prepare("SELECT * FROM content_transition_chzzk_attempts ORDER BY attempt").all()).results).toEqual(before);
  await expect(journal.complete(plan.id,admitted.operationId,admitted.payloadHash,key,first.receipt.requestHash,1,"forged-claim",response("forged"),started+1)).rejects.toThrow(/attempt/);
  await expect(journal.read(plan.id,admitted.operationId,"wrong-hash",key)).rejects.toThrow(/identity/);
  await expect(journal.claimFrozenOriginal(plan.id,admitted.operationId,admitted.payloadHash,`videos:${channel}:3`,started+70000)).rejects.toThrow(/registered/);
  await expect(sourceDb.prepare("INSERT INTO schedule_broadcast_observations(vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at) VALUES('late',1,?,'Forbidden',1,2,1,1,1)").bind(channel).run()).rejects.toThrow(/fenced/);
  expect(await sourceDb.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n")).toBe(0);
});
it("task4.4 records an uncertain CHZZK attempt before retry and keeps the first durable replacement response",async()=>{
  const channel="a".repeat(32);await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();
  await capturing();const admitted=await source.admitChzzkScan(chzzkScanAdmission("scan-crash")),journal=new D1ChzzkReadJournal(sourceDb,"otw","source-db"),key=`videos:${channel}:0`;
  const first=await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,now);expect(first.claimed).toBe(true);
  expect((await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,now+1)).claimed).toBe(false);
  const retry=await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,now+30001);expect(retry.claimed).toBe(true);
  expect(await sourceDb.prepare("SELECT state FROM content_transition_chzzk_attempts WHERE attempt=1").first("state")).toBe("uncertain");
  const changed={kind:"videos" as const,videos:[{videoId:"replacement",videoTitle:"Provider changed after lost response",publishDateAt:now,duration:1,thumbnailImageUrl:null}]};
  const receipt=await journal.complete(plan.id,admitted.operationId,admitted.payloadHash,key,retry.receipt.requestHash,retry.receipt.attempt,retry.receipt.claim!,changed,now+30002);
  expect(receipt.response).toEqual(changed);expect((await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,now+90000)).claimed).toBe(false);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_attempts").first("n")).toBe(2);
});
it("task4.4 recovers a dead original CHZZK read through the actual Queue and releases only its resolved old drain",async()=>{
  const channel="a".repeat(32),started=Date.parse("2026-10-15T13:00:00+09:00");
  await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();
  const {routeSource,routeTarget}=await routeControls();
  const admitted=await routeSource.admitChzzkScan({...chzzkScanAdmission("dead-original-read"),payload:{...chzzkScanAdmission("dead-original-read").payload,startedAt:started}});
  const journal=new D1ChzzkReadJournal(sourceDb,"otw","otw-db"),key=`videos:${channel}:0`;
  const dead=await journal.claimLocal(plan.id,admitted.operationId,admitted.payloadHash,key,Date.now()-60000);
  expect(dead.claimed).toBe(true);
  await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
  expect((await relayBindings.TARGET_RELAY.receiveOperation(plan.id,admitted.operationId,admitted.payloadHash)).accepted).toBe(true);
  await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  const video=vi.spyOn(chzzkVideoCatalog,"fetchVideosBatch").mockResolvedValue([{channelId:channel,content:{data:[{videoId:"replacement-vod",videoTitle:"Changed replacement after dead GET",publishDateAt:started-1000,duration:3600,thumbnailImageUrl:null}]}}] as unknown as Awaited<ReturnType<ChzzkVideoCatalog["fetchVideosBatch"]>>);
  const live=vi.spyOn(chzzkVideoCatalog,"fetchLiveStatus").mockResolvedValue({content:{status:"CLOSE",openDate:null},debug:{}} as Awaited<ReturnType<NonNullable<ChzzkVideoCatalog["fetchLiveStatus"]>>>);
  const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId:admitted.operationId,payloadHash:admitted.payloadHash},ack:vi.fn(),retry:vi.fn()};
  const runtime={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CONTENT_TRANSITION_PEER:relayBindings.SOURCE_RELAY} as unknown as Env;
  try {
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,runtime);
    expect(message.retry).not.toHaveBeenCalled();expect(message.ack).toHaveBeenCalledTimes(1);
    expect(video).toHaveBeenCalledTimes(1);expect(live).toHaveBeenCalledTimes(1);
    expect(await targetDb.prepare("SELECT title FROM schedule_broadcast_observations WHERE vod_id='chzzk:replacement-vod'").first("title")).toBe("Changed replacement after dead GET");
    expect(await sourceDb.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n")).toBe(0);
    const resolved=await sourceDb.prepare("SELECT state,uncertain_at,resolved_at,superseded_by_response_hash FROM content_transition_chzzk_attempts WHERE operation_id=? AND request_key=? AND attempt=1").bind(admitted.operationId,key).first<{state:string;uncertain_at:number;resolved_at:number;superseded_by_response_hash:string}>();
    expect(resolved?.state).toBe("superseded");expect(resolved?.uncertain_at).toBeGreaterThan(0);expect(resolved?.resolved_at).toBeGreaterThan(0);expect(resolved?.superseded_by_response_hash).toHaveLength(64);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_chzzk_requests WHERE operation_id=? AND disposition IS NULL").bind(admitted.operationId).first("n")).toBe(0);
    await routeTarget.admit({...admission("continuing-native-backlog"),subject:{table:"schedules",key:"[319]"},payload:{...admission("continuing-native-backlog").payload,input:{...admission("continuing-native-backlog").payload.input,id:319}}});
    await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);
    expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE source_seq IS NULL AND outcome_json IS NULL").first("n")).toBe(1);
    const before=await routeTarget.readJournal(plan.id),checkpoint=await sourceDb.prepare("SELECT checkpoints_json FROM content_transitions WHERE id=?").bind(plan.id).first("checkpoints_json");
    await journal.complete(plan.id,admitted.operationId,admitted.payloadHash,key,dead.receipt.requestHash,dead.receipt.attempt,dead.receipt.claim!,{kind:"videos",videos:[{videoId:"lost-original",videoTitle:"Late distinct old response",publishDateAt:started,duration:1200,thumbnailImageUrl:null}]},Date.now());
    expect(await routeTarget.readJournal(plan.id)).toEqual(before);expect(await sourceDb.prepare("SELECT checkpoints_json FROM content_transitions WHERE id=?").bind(plan.id).first("checkpoints_json")).toEqual(checkpoint);
    expect(await sourceDb.prepare("SELECT state FROM content_transition_chzzk_attempts WHERE operation_id=? AND request_key=? AND attempt=1").bind(admitted.operationId,key).first("state")).toBe("superseded");
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,runtime);
    expect(video).toHaveBeenCalledTimes(1);expect(live).toHaveBeenCalledTimes(1);expect(message.ack).toHaveBeenCalledTimes(2);
  } finally {video.mockRestore();live.mockRestore();}
});
async function liveFixtureRequest(fixture:Awaited<ReturnType<typeof pendingAdminFixture>>,site:"otw"|"luvdia",channels:string[],sub=`${site}-pending-admin`,version="live-approved") {
  const origin=site==="otw"?"http://localhost:5173":"http://localhost:5174";
  const key=new URL(`${origin}/api/live-status`);key.searchParams.set("channelIds",[...channels].sort().join(","));key.searchParams.set("responseVersion","2");
  await caches.default.put(new Request(key),Response.json({snapshotVersion:"live-approved",items:channels.map(liveFixtureItem)},{headers:{"Cache-Control":"public, max-age=45"}}));
  return handleWorkerFetch(new Request(`${origin}/api/operations/live-schedule/auto-fill`,{method:"POST",headers:{Authorization:`Bearer ${await fixture.token(sub)}`,"Content-Type":"application/json"},body:JSON.stringify({channelIds:channels,snapshotVersion:version})}),fixture.runtime);
}
it("task4.4 reaches live-fill through its admin cached snapshot and keeps unrelated members running after a fence",async()=>{
  const channel="a".repeat(32),other="b".repeat(32);
  await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`),sourceDb.prepare("INSERT INTO members(uid,code,name,url_chzzk) VALUES(90,'other','Other',?)").bind(`https://chzzk.naver.com/${other}`)]);
  const {routeSource}=await routeControls(),fixture=await pendingAdminFixture("otw",interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now())));
  try {
    expect((await liveFixtureRequest(fixture,"otw",[channel],"ordinary-member")).status).toBe(403);
    expect((await liveFixtureRequest(fixture,"otw",[channel],"otw-pending-admin","old-snapshot")).status).toBe(409);
    const response=await liveFixtureRequest(fixture,"otw",[channel,other]);expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({scheduleAutoFill:{updated:1,feedback:[{memberUid:1,code:"CONTENT_MOVED"}]}});
    expect((await sourceDb.prepare("SELECT member_uid,title FROM schedules").all()).results).toEqual([{member_uid:90,title:"Live b"}]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs WHERE member_uid=1").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  } finally {fixture.close();}
});
it("task4.4 recovers admitted native live-fill from its original snapshot without another provider call",async()=>{
  const channel="a".repeat(32);await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`).run();
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture("luvdia");
  try {
    const response=await liveFixtureRequest(fixture,"luvdia",[channel]);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({scheduleAutoFill:{updated:0,feedback:[{memberUid:1,code:"CONTENT_ACCEPTED"}]}});
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
    const message={body:fixture.send.mock.calls[0][0],ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.retry).toHaveBeenCalledOnce();
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    fixture.send.mockResolvedValue(undefined);await recoverTransitionWork(fixture.runtime);expect(fixture.send.mock.calls[1][0]).toEqual(message.body);
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();
    const schedule=await targetDb.prepare("SELECT id,title,start_time FROM schedules WHERE member_uid=1").first<{id:number;title:string;start_time:string}>();expect(schedule).toMatchObject({title:"Live a",start_time:"13:00"});
    expect(await targetDb.prepare("SELECT schedule_id,actor_id,actor_name FROM update_logs WHERE action='schedule_auto_created'").first()).toEqual({schedule_id:schedule!.id,actor_id:null,actor_name:null});
    const journal=await routeTarget.readJournal(plan.id);expect(journal.map(row=>row.table)).toEqual(expect.arrayContaining(["schedules","update_logs"]));
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledTimes(2);expect(await routeTarget.readJournal(plan.id)).toEqual(journal);
    expect(await sourceDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
  } finally {fixture.close();}
});
it("task4.4 conflicts the original live-fill after a newer source tail instead of replacing it",async()=>{
  const channel="a".repeat(32);await sourceDb.batch([sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${channel}`),sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,start_time,title,status) VALUES(701,1,'2026-10-15','12:00',' ','방송')")]);
  const {routeSource,routeTarget}=await routeControls(),fixture=await pendingAdminFixture("luvdia");
  try {
    expect(await (await liveFixtureRequest(fixture,"luvdia",[channel])).json()).toMatchObject({scheduleAutoFill:{updated:0,feedback:[{code:"CONTENT_ACCEPTED"}]}});
    const original=fixture.send.mock.calls[0][0],header=await routeSource.describeBaseline(plan.id);
    expect((await sourceRouteSave({id:701,member_uid:1,date:"2026-10-15",start_time:"19:00",title:"Newer source edit",status:"방송"})).status).toBe(200);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    for(const operation of await routeSource.exportFrozenOperations(plan.id)) await routeTarget.receiveOperation(operation);
    for(const commit of await routeSource.exportProjectedCommits(plan.id,header.boundary)) await routeTarget.installProjectedCommit(commit);
    await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    const message={body:original,ack:vi.fn(),retry:vi.fn()};await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();
    expect((await routeTarget.exportOperation(plan.id,original.operationId)).outcome).toMatchObject({outcome:"conflicted",sideEffectReconciled:true});
    expect((await targetDb.prepare("SELECT title,start_time FROM schedules WHERE member_uid=1").all()).results).toEqual([{title:"Newer source edit",start_time:"19:00"}]);
    expect(await targetDb.prepare("SELECT count(*) n FROM update_logs WHERE action='schedule_auto_updated'").first("n")).toBe(0);
  } finally {fixture.close();}
});
it("task4.4 reaches pending reject reset reopen empty and holiday native batches through the actual admin entry",async()=>{
  await sourceDb.prepare("UPDATE members SET url_chzzk=? WHERE uid=1").bind(`https://chzzk.naver.com/${"a".repeat(32)}`).run();
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(702,1,'2026-10-16',NULL,'방송'),(705,1,'2026-10-19','Existing match','방송'),(706,1,'2026-10-20',NULL,'방송')"),
    ...[802,803,804,805,806,807,808].map((id,index)=>sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,start_time,title,status,action_type,vod_id,existing_schedule_id,candidate_kind) VALUES(?,1,'Selected member',?,'20:00',?,'방송',?,?,?,?)").bind(id,`2026-10-${16+index}`,id===805?"Existing match":"Pending branch",id===802?"update":"create",id>=807?null:`pending-${id}`,id===802?702:id===806?706:null,id===805?"missing_schedule":id>=807?"holiday_suggestion":null)),
    ...["2026-10-21","2026-10-22"].map(date=>sourceDb.prepare("INSERT INTO schedule_day_assessments(member_uid,date,channel_id,checked_at,range_start,range_end,scan_status,broadcast_seen,decision) VALUES(1,?,?,1,0,100,'complete',0,'suggested')").bind(date,"a".repeat(32))),
  ]);
  const {routeSource}=await routeControls();const fixture=await pendingAdminFixture("otw");
  try {
    expect((await fixture.request("802/approve",{},"ordinary-member")).status).toBe(403);
    expect((await fixture.request("802/approve",{},"otw-pending-admin","https://wrong.example")).status).toBe(401);
    const requests:[[string,unknown],string][]=[[["802/approve",{}],"update"],[["803/reject",{reasonNote:"Actual rejection"}],"reject"],[["804/reset-processed",{}],"reset_processed"],[["805/approve",{}],"candidate_obsolete"],[["806/apply-empty-target",{}],"update"],[["807/approve",{}],"create"],[["808/reject",{reasonNote:"Not a holiday"}],"reject"]];
    for(const [[path,body],action] of requests) {const response=await fixture.request(path,body);expect(response.status,path).toBe(200);expect(await response.json()).toMatchObject({success:true,action});}
    const rejection=await sourceDb.prepare("SELECT id,actor_id,reason_note FROM schedule_candidate_rejections WHERE vod_id='pending-803'").first<{id:number;actor_id:string;reason_note:string}>();
    expect(rejection).toMatchObject({actor_id:"otw-pending-admin",reason_note:"Actual rejection"});
    const reopen=await fixture.request(`rejections/${rejection!.id}/reopen`);expect(reopen.status).toBe(200);
    expect(await sourceDb.prepare("SELECT count(*) n FROM schedule_candidate_rejections").first("n")).toBe(0);
    expect((await sourceDb.prepare("SELECT decision,decided_by FROM schedule_day_assessments ORDER BY date").all()).results).toEqual([{decision:"approved",decided_by:"otw-pending-admin"},{decision:"rejected",decided_by:"otw-pending-admin"}]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs WHERE actor_id='otw-pending-admin'").first("n")).toBe(8);
    expect(await sourceDb.prepare("SELECT count(*) n FROM pending_schedules").first("n")).toBe(1);
    const fence=await routeSource.freeze(plan.id,Date.now());expect(fence.operationBoundary).toBeGreaterThan(0);
    const frozen=await routeSource.exportFrozenOperations(plan.id);expect(frozen).toHaveLength(8);expect(frozen.every(item=>item.outcome?.outcome==="committed")).toBe(true);
    expect(JSON.stringify(frozen)).not.toMatch(/Actual rejection|otw-pending-admin|actor_ip/);
    const moved=await fixture.request("actions",{action:"reset_processed",ids:[804]});expect(await moved.json()).toMatchObject({success:false,successCount:0,results:[{error:"CONTENT_MOVED"}]});
  } finally {fixture.close();}
});

it("maintenance_native_pending refuses admission then preserves owning approval and retry",async()=>{
  await sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,start_time,title,status,action_type,vod_id) VALUES(801,1,'Selected member','2026-10-15','20:00','Target pending approval','방송','create','pending-native-801')").run();
  const {routeSource,routeTarget}=await routeControls([],true),fixture=await pendingAdminFixture('luvdia');fixture.runtime.CONTENT_TRANSITION_PEER=undefined;
  try {
    const denied=await fixture.request('actions',{action:'approve',ids:[801]});expect(denied.status).toBe(503);expect(await denied.json()).toMatchObject({error:{code:'CONTENT_MAINTENANCE'}});
    expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);expect(fixture.send).not.toHaveBeenCalled();
    expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(0);expect(await targetDb.prepare('SELECT count(*) n FROM pending_schedules').first('n')).toBe(1);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    expect((await fixture.request('actions',{action:'approve',ids:[801]},'ordinary-user')).status).toBe(403);
    await targetDb.prepare("CREATE TRIGGER task44_pending_maintenance_abort BEFORE INSERT ON update_logs WHEN NEW.action='approve' BEGIN SELECT RAISE(ABORT,'pending_approval_atomic'); END").run();
    try {await fixture.request('actions',{action:'approve',ids:[801]});expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(0);expect(await targetDb.prepare('SELECT count(*) n FROM pending_schedules').first('n')).toBe(1);}finally{await targetDb.prepare('DROP TRIGGER task44_pending_maintenance_abort').run();}
    const response=await fixture.request('actions',{action:'approve',ids:[801]});expect(response.status,await response.clone().text()).toBe(200);expect(await response.json()).toMatchObject({success:true,successCount:1,failedCount:0});
    const original=(await targetDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations WHERE json_extract(outcome_json,'$.outcome')='committed'").first<{operation_id:string;payload_hash:string}>())!;
    const schedule=await targetDb.prepare('SELECT id,title FROM schedules').first<{id:number;title:string}>();expect(schedule?.title).toBe('Target pending approval');
    expect(await targetDb.prepare("SELECT actor_id,schedule_id FROM update_logs WHERE action='approve'").first()).toEqual({actor_id:'luvdia-pending-admin',schedule_id:schedule!.id});
    expect(await targetDb.prepare('SELECT count(*) n FROM pending_schedules').first('n')).toBe(0);expect(await sourceDb.prepare('SELECT count(*) n FROM pending_schedules').first('n')).toBe(1);
    const journal=await routeTarget.readJournal(plan.id);expect(journal.map(row=>row.table)).toEqual(expect.arrayContaining(['schedules','pending_schedules','update_logs']));
    const deletion=journal.find(row=>row.table==='pending_schedules'&&row.row_key==='[801]'&&row.after_json===null);expect(JSON.parse(deletion!.before_json!)).toMatchObject({id:801,title:'Target pending approval'});
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:original.operation_id,payloadHash:original.payload_hash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();
    expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(1);expect(await routeTarget.readJournal(plan.id)).toEqual(journal);
    expect(await routeTarget.abortTargetBeforeActivation(plan.id,Date.now())).toBeNull();expect(await relayBindings.SOURCE_RELAY.resumeSourceAfterAbort(plan.id)).toEqual({resumed:false,reason:'target_not_aborted'});
    expect((await routeSource.readTransition(plan.id)).phase).toBe('source_fenced');expect(await targetDb.prepare('SELECT title FROM schedules').first('title')).toBe('Target pending approval');
  }finally{fixture.close();}
});

it("task4.4 seeds installed target capture atomically with final activation and preserves retry identity",async()=>{
  await sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,title,status,action_type) VALUES(801,1,'Selected','2026-10-15','Installed pending','방송','create')").run();
  const {routeSource,routeTarget}=await routeControls();const fence=await routeSource.freeze(plan.id,Date.now());await routeTarget.installFence(fence);await transferStaticProof();await routeTarget.installCommittedState(plan.id);
  const installation=await targetDb.prepare("SELECT installation_json FROM content_transitions WHERE id='move'").first<string>("installation_json");
  const raced=new D1TransitionRepository(interleave(targetDb,"batch",async()=>{await targetDb.prepare("UPDATE content_transitions SET installation_json=NULL WHERE id='move'").run();}),"luvdia","luvdia-db", null, null, catalogImportProjection);
  await expect(raced.activate(plan.id)).rejects.toThrow();
  expect((await routeTarget.readTransition(plan.id)).phase).toBe("source_fenced");
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_images").first("n")).toBe(0);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id='target-capture-start'").first("n")).toBe(0);
  await targetDb.prepare("UPDATE content_transitions SET installation_json=? WHERE id='move'").bind(installation).run();
  await routeTarget.activate(plan.id);const initial=await routeTarget.readJournal(plan.id);await routeTarget.activate(plan.id);expect(await routeTarget.readJournal(plan.id)).toEqual(initial);
  const writer=new D1PendingScheduleRepository(targetDb,new D1PendingTransitionWriter(routeTarget,"luvdia"));
  const result=await writer.resetProcessed((await writer.findById(801))!,{actorId:"target-admin",actorName:null,actorIp:null});expect(result.success).toBe(true);
  const change=(await routeTarget.readJournal(plan.id)).find(row=>row.table==="pending_schedules" && row.before_json!==null);
  expect(JSON.parse(change!.before_json!)).toMatchObject({title:"Installed pending",processed_reset_at:null});
  expect(JSON.parse(change!.after_json!).processed_reset_at).toBeTruthy();
  expect(await sourceDb.prepare("SELECT processed_reset_at FROM pending_schedules WHERE id=801").first("processed_reset_at")).toBeNull();
  const afterNative=await routeTarget.readJournal(plan.id),images=(await targetDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results;
  await routeTarget.activate(plan.id);expect(await routeTarget.readJournal(plan.id)).toEqual(afterNative);expect((await targetDb.prepare("SELECT * FROM content_transition_images ORDER BY row_table,row_key").all()).results).toEqual(images);
  await routeTarget.acknowledgeSourceArchive(await routeSource.archiveSource(plan.id));await routeTarget.complete(plan.id);await routeTarget.activate(plan.id);
  expect((await routeTarget.readTransition(plan.id)).phase).toBe("complete");expect(await routeTarget.readJournal(plan.id)).toEqual(afterNative);
});
it("task4.4 rolls back the full pending batch when the fence wins and continues unrelated bulk work",async()=>{
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Unrelated')"),
    sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,start_time,title,status,action_type,vod_id) VALUES(801,1,'Selected','2026-10-15','20:00','Selected candidate','방송','create','selected-pending'),(802,90,'Unrelated','2026-10-15','20:00','Unrelated candidate','방송','create','unrelated-pending')"),
  ]);
  const {routeSource}=await routeControls();
  const fixture=await pendingAdminFixture("otw",interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now())));
  try {
    const raced=await fixture.request("801/approve");expect(raced.status).toBe(409);expect(await raced.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});
    expect(await sourceDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
    const mixed=await fixture.request("actions",{action:"approve",ids:[801,802]});
    expect(await mixed.json()).toMatchObject({success:false,successCount:1,failedCount:1,results:[{id:801,success:false,error:"CONTENT_MOVED"},{id:802,success:true,action:"create"}]});
    expect((await sourceDb.prepare("SELECT member_uid,title FROM schedules").all()).results).toEqual([{member_uid:90,title:"Unrelated candidate"}]);
    expect(await sourceDb.prepare("SELECT title FROM pending_schedules WHERE id=801").first("title")).toBe("Selected candidate");
  } finally {fixture.close();}
});
it("task4.4 rejects a pending approval phantom without false admission or partial audit",async()=>{
  await sourceDb.prepare("INSERT INTO pending_schedules(id,member_uid,member_name,date,start_time,title,status,action_type,vod_id) VALUES(801,1,'Selected','2026-10-15','20:00','Old candidate','방송','create','phantom-pending')").run();
  await routeControls();
  const fixture=await pendingAdminFixture("otw",interleave(sourceDb,"batch",async()=>{
    expect((await sourceRouteSave({member_uid:1,date:"2026-10-15",title:"Concurrent source schedule",status:"방송",start_time:"21:00"})).status).toBe(200);
  }));
  try {
    const response=await fixture.request("801/approve");expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_CONFLICT"}});
    expect((await sourceDb.prepare("SELECT title FROM schedules").all()).results).toEqual([{title:"Concurrent source schedule"}]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs WHERE action='approve'").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='pending.local'").first("n")).toBe(0);
    expect(await sourceDb.prepare("SELECT title FROM pending_schedules WHERE id=801").first("title")).toBe("Old candidate");
  } finally {fixture.close();}
});
it.each(["fenced", "archived"])("task4.4 features only editable source notices with %s history", async mode => {
  await sourceDb.batch([
    sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,is_home_visible) VALUES(601,'Selected history','[1]',1),(602,'Ordinary previous','[]',1),(603,'Ordinary chosen','[]',0)"),
  ]);
  await ready(); await source.freeze(plan.id, now);
  if (mode === "archived") await source.archiveSource(plan.id);
  const history = await sourceDb.prepare("SELECT * FROM notices WHERE id=601").first();
  const gateway = new D1NoticeGateway(getDb({otw_db:sourceDb} as Env), undefined, false, undefined, new D1NoticeTransitionWriter(source,"otw"));
  expect(await gateway.feature(603)).toBe(true);
  expect(await sourceDb.prepare("SELECT * FROM notices WHERE id=601").first()).toEqual(history);
  expect((await sourceDb.prepare("SELECT id,is_home_visible FROM notices WHERE id IN (602,603) ORDER BY id").all()).results).toEqual([{id:602,is_home_visible:0},{id:603,is_home_visible:1}]);
  const before = (await sourceDb.prepare("SELECT * FROM notices ORDER BY id").all()).results;
  await expect(gateway.feature(601)).rejects.toMatchObject({code:"CONTENT_MOVED"});
  expect((await sourceDb.prepare("SELECT * FROM notices ORDER BY id").all()).results).toEqual(before);
});
it("task4.4 commits complete source notice commands atomically and transfers only terminal local facts",async()=>{
  await ready();
  const gateway=new D1NoticeGateway(getDb({otw_db:sourceDb} as Env),undefined,false,undefined,new D1NoticeTransitionWriter(source,"otw"));
  const input={content:"Original notice",links:[],imageUrls:[],relatedMemberUids:[1],type:"notice",isActive:true,startedAt:null,endedAt:null};
  expect(await gateway.create(input)).toEqual({status:"success"});
  const id=(await sourceDb.prepare("SELECT id FROM notices WHERE content='Original notice'").first<number>("id"))!;
  expect(await gateway.update(id,{...input,content:"Edited notice",isActive:false})).toEqual({status:"success"});
  expect(await gateway.feature(id)).toBe(true);
  expect(await sourceDb.prepare("SELECT content,is_active,is_home_visible FROM notices WHERE id=?").bind(id).first()).toEqual({content:"Edited notice",is_active:0,is_home_visible:1});
  expect(await gateway.remove(id)).toEqual({status:"success"});
  expect(await sourceDb.prepare("SELECT id FROM notices WHERE id=?").bind(id).first()).toBeNull();
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(outcome_json,'$.outcome')='committed'").first("n")).toBe(4);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_commits WHERE operation_id<>'baseline' AND sealed=1").first("n")).toBe(4);
  await target.installFence(await source.freeze(plan.id,now));
  const operations=await source.exportFrozenOperations(plan.id);
  expect(JSON.stringify(operations)).not.toContain("Original notice");
  expect(JSON.stringify(operations)).not.toContain("Edited notice");
  for(const operation of operations) {
    await target.receiveOperation(operation);
    await expect(target.receiveOperation({...operation,outcome:null})).rejects.toThrow(/committed local/);
  }
  await expect(source.admit({...admission("forged-notice"),codec:{id:"notices.local",version:1},subject:{table:"notices",key:"[null]"},payload:{action:"feature",affectedIds:[id]}})).rejects.toThrow(/atomic source/);
});
it("task4.4 rejects notice affected-set phantoms and a fence winning the source batch",async()=>{
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,is_home_visible) VALUES(601,'Selected','[1]',1),(602,'Ordinary','[]',0)").run();
  await ready();
  const raced=interleave(sourceDb,"batch",()=>sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,is_home_visible) VALUES(603,'New ordinary row','[]',1)").run());
  const raceRepository=new D1TransitionRepository(raced,"otw","source-db","otw-bucket",sourceAvailability, catalogImportProjection);
  const gateway=new D1NoticeGateway(getDb({otw_db:raced} as Env),undefined,false,undefined,new D1NoticeTransitionWriter(raceRepository,"otw"));
  await expect(gateway.feature(602)).rejects.toMatchObject({code:"CONTENT_CONFLICT"});
  expect((await sourceDb.prepare("SELECT id,is_home_visible FROM notices ORDER BY id").all()).results).toEqual([{id:601,is_home_visible:1},{id:602,is_home_visible:0},{id:603,is_home_visible:1}]);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  const fenced=interleave(sourceDb,"batch",()=>source.freeze(plan.id,now));
  const fencedRepository=new D1TransitionRepository(fenced,"otw","source-db","otw-bucket",sourceAvailability, catalogImportProjection);
  const frozenGateway=new D1NoticeGateway(getDb({otw_db:fenced} as Env),undefined,false,undefined,new D1NoticeTransitionWriter(fencedRepository,"otw"));
  await expect(frozenGateway.feature(601)).rejects.toMatchObject({code:"CONTENT_MOVED"});
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
});

it("maintenance_native_notice refuses early feature writes and keeps owner batch atomic",async()=>{
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,is_home_visible) VALUES(601,'Selected previous','[1]',1),(602,'Selected next','[2]',0)").run();
  const {routeSource,routeTarget}=await routeControls([],true),fixture=await pendingAdminFixture('luvdia');fixture.runtime.CONTENT_TRANSITION_PEER=undefined;
  const request=async(actor='luvdia-pending-admin')=>handleWorkerFetch(new Request('http://localhost:5174/api/notices/featured',{method:'PUT',headers:{Authorization:`Bearer ${await fixture.token(actor)}`,'Content-Type':'application/json'},body:JSON.stringify({id:602})}),fixture.runtime);
  try {
    const before=(await targetDb.prepare('SELECT id,is_home_visible FROM notices ORDER BY id').all()).results;
    expect((await request()).status).toBe(503);expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);expect(fixture.send).not.toHaveBeenCalled();
    expect((await targetDb.prepare('SELECT id,is_home_visible FROM notices ORDER BY id').all()).results).toEqual(before);
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    expect((await request('ordinary-user')).status).toBe(403);
    await targetDb.prepare("CREATE TRIGGER task44_notice_maintenance_abort BEFORE UPDATE ON notices WHEN NEW.id=602 AND NEW.is_home_visible=1 BEGIN SELECT RAISE(ABORT,'notice_atomic'); END").run();
    try{expect((await request()).status).toBeGreaterThanOrEqual(400);expect((await targetDb.prepare('SELECT id,is_home_visible FROM notices ORDER BY id').all()).results).toEqual(before);}finally{await targetDb.prepare('DROP TRIGGER task44_notice_maintenance_abort').run();}
    const response=await request();expect(response.status,await response.clone().text()).toBe(200);
    expect((await targetDb.prepare('SELECT id,is_home_visible FROM notices ORDER BY id').all()).results).toEqual([{id:601,is_home_visible:0},{id:602,is_home_visible:1}]);
    expect((await sourceDb.prepare('SELECT id,is_home_visible FROM notices ORDER BY id').all()).results).toEqual(before);
    const original=(await targetDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations WHERE json_extract(outcome_json,'$.outcome')='committed'").first<{operation_id:string;payload_hash:string}>())!;
    const message={body:{type:'content-transition.operation',version:1,transitionId:plan.id,operationId:original.operation_id,payloadHash:original.payload_hash},ack:vi.fn(),retry:vi.fn()},journal=await routeTarget.readJournal(plan.id);
    await Promise.all([1,2].map(()=>handleWorkerQueue({queue:'luvdia-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,fixture.runtime)));
    expect(message.ack).toHaveBeenCalledTimes(2);expect(message.retry).not.toHaveBeenCalled();expect(await routeTarget.readJournal(plan.id)).toEqual(journal);
  }finally{fixture.close();}
});

it("task4.4 keeps the normal source schedule save atomic and durably admitted during capture",async()=>{
  await sourceDb.prepare("DELETE FROM content_transitions").run();
  const routeSource=new D1TransitionRepository(sourceDb,"otw","otw-db","otw-bucket",sourceAvailability, catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  await routeSource.prepare({...plan,sourceResource:"otw-db"});
  await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(701,1,'2026-10-15','Previous day status','휴방')").run();
  await capturing(routeSource);
  const response=await handleWorkerFetch(new Request("http://localhost:5173/api/schedules/save",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({member_uid:1,date:"2026-10-15",title:"Actual route save",status:"방송"}),
  }),{...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket"} as unknown as Env);
  expect(response.status).toBe(200);
  const result=await response.json() as {success:boolean;scheduleId:number;deletedIds:number[]};
  expect(result).toMatchObject({success:true,deletedIds:[701]});
  expect(await sourceDb.prepare("SELECT title,status FROM schedules WHERE id=?").bind(result.scheduleId).first()).toEqual({title:"Actual route save",status:"방송"});
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(outcome_json,'$.outcome')='committed'").first("n")).toBe(1);
  expect(await sourceDb.prepare("SELECT count(DISTINCT commit_seq) n FROM content_transition_journal WHERE commit_seq>(SELECT seq FROM content_transition_commits WHERE operation_id='baseline')").first("n")).toBe(1);
});
it("task4.4 rejects malformed original request identities before any schedule admission or mutation",async()=>{
  await routeControls();
  for(const key of ["","short","x".repeat(101),"spaces are invalid"]) {
    const response=await handleWorkerFetch(new Request("http://localhost:5173/api/schedules/save",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({member_uid:1,date:"2026-10-15",title:"Must not save",status:"방송"})}),{...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket"} as unknown as Env);
    expect(response.status).toBe(400);
  }
  expect(await sourceDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
});
async function prepareRouteControls(extraClassifications:TransitionPlan["classifications"]=[]) {
  await sourceDb.prepare("DELETE FROM content_transitions").run();await targetDb.prepare("DELETE FROM content_transitions").run();
  const routePlan={...plan,classifications:[...plan.classifications,...extraClassifications],sourceResource:"otw-db",targetResource:"luvdia-db"};
  const routeSource=new D1TransitionRepository(sourceDb,"otw","otw-db","otw-bucket",sourceAvailability, catalogImportProjection,new D1AiReviewAdoption(sourceDb));
  const routeTarget=new D1TransitionRepository(targetDb,"luvdia","luvdia-db","luvdia-bucket",targetAvailability, catalogImportProjection);
  await routeSource.prepare(routePlan);await routeTarget.prepare(routePlan);
  return {routeSource,routeTarget};
}
async function routeControls(extraClassifications:TransitionPlan["classifications"]=[],maintenance=false) {
  const {routeSource,routeTarget}=await prepareRouteControls(extraClassifications);
  if(maintenance){await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());}
  await capturing(routeSource);
  await installInactiveBaseline(routeSource,routeTarget);
  await routeSource.acknowledgeIngress(await routeTarget.openIngress(plan.id,"route-ready",Date.now()+60000),Date.now());
  return {routeSource,routeTarget};
}
const sourceRouteSave=(body:unknown,db=sourceDb)=>handleWorkerFetch(new Request("http://localhost:5173/api/schedules/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),{...bindings,...siteEnv(),otw_db:db,SITE_ASSET_BUCKET_NAME:"otw-bucket"} as unknown as Env);
it.each(['songs','entities'] as const)('preserves the final SQL maintenance HTTP refusal and original catalog rows (%s)',async kind=>{
  await seedPublicationCatalog();
  const {routeSource}=await prepareRouteControls(),fixture=await pendingAdminFixture('otw');fixture.runtime.YOUTUBE_API_KEY='';
  const body=kind==='entities'?{id:'publication-singer',expectedVersion:0,memberUid:1,entityKind:'person',displayName:'Forbidden late identity',slug:'publication-singer',archived:false}:{id:'publication-song',expectedVersion:0,slug:'publication-song',title:'Forbidden late song',isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:'unknown',aliases:[],originalArtists:[{subject:{kind:'entity',entityId:'publication-singer'},creditOrder:0,isPrimary:true}],tags:[]};
  const snapshot=async()=>JSON.stringify(await Promise.all(['music_entities','music_songs','music_catalog_events','music_catalog_meta','music_public_read_model_meta','music_search_terms','music_search_grams','music_search_gram_stats'].map(table=>sourceDb.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().then(result=>result.results))));
  const before=await snapshot();let stopped=false;
  const db=interleave(sourceDb,`UPDATE music_${kind}`,async()=>{stopped=true;await routeSource.beginMaintenance(plan.id,Date.now(),await relayBindings.TARGET_RELAY.describe(plan.id));await routeSource.stopMaintenance(plan.id,Date.now());});
  try {
    const response=await handleWorkerFetch(new Request(`http://localhost:5173/api/play/admin/${kind}`,{method:'PUT',headers:{Authorization:`Bearer ${await fixture.token('otw-pending-admin')}`,'Content-Type':'application/json','Idempotency-Key':`publication-final-maintenance-${kind}`},body:JSON.stringify(body)}),{...fixture.runtime,otw_db:db});
    expect(stopped).toBe(true);expect(response.status,await response.clone().text()).toBe(503);expect(await response.json()).toMatchObject({error:{code:'CONTENT_MAINTENANCE'}});expect(response.headers.get('Cache-Control')).toContain('no-store');expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(await snapshot()).toBe(before);expect(await sourceDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
  } finally {fixture.close();}
},20000);
it("task4.4 rolls back source admission with the whole normal save when the fence wins",async()=>{
  await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(701,1,'2026-10-15','Unchanged','휴방')").run();
  const {routeSource}=await routeControls();
  const auditBefore=await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n");
  const response=await sourceRouteSave({member_uid:1,date:"2026-10-15",title:"Racing save",status:"방송"},interleave(sourceDb,"batch",()=>routeSource.freeze(plan.id,Date.now())));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({error:{code:"CONTENT_MOVED"}});
  expect(await sourceDb.prepare("SELECT title FROM schedules WHERE id=701").first("title")).toBe("Unchanged");
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(auditBefore);
});
it("task4.4 protects newly appearing conflict rows in the normal source member-day save",async()=>{
  await routeControls();
  const body={member_uid:1,date:"2026-10-15",title:"Outdated full-day save",status:"휴방"};
  const response=await sourceRouteSave(body,interleave(sourceDb,"batch",async()=>{
    const concurrent=await sourceRouteSave({...body,title:"Concurrent broadcast",status:"방송"});
    expect(concurrent.status).toBe(200);
  }));
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_CONFLICT"}});
  expect((await sourceDb.prepare("SELECT title FROM schedules").all()).results).toEqual([{title:"Concurrent broadcast"}]);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(1);
});
it("task4.4 commits a source scope exit with its same ID and full conflicts before the fence",async()=>{
  await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Unrelated')").run();
  await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(701,1,'2026-10-15','Selected','방송'),(702,90,'2026-10-15','Private unrelated day','휴방')").run();
  await sourceDb.prepare("INSERT INTO update_logs(schedule_id,member_uid,schedule_date,action,title) VALUES(701,1,'2026-10-15','create','Original selected audit')").run();
  const {routeSource,routeTarget}=await routeControls();
  const response=await sourceRouteSave({id:701,member_uid:90,date:"2026-10-15",title:"Private new unrelated title",status:"방송"});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({success:true,scheduleId:701,deletedIds:[702]});
  expect(await sourceDb.prepare("SELECT member_uid,title FROM schedules WHERE id=701").first()).toEqual({member_uid:90,title:"Private new unrelated title"});
  const fence=await routeSource.freeze(plan.id,Date.now());await routeTarget.installFence(fence);
  const operations=await routeSource.exportFrozenOperations(plan.id);
  expect(operations).toHaveLength(1);
  expect(JSON.stringify(operations)).not.toContain("Private");
  expect(operations[0]).toMatchObject({codec:{id:"schedules.local"},outcome:{outcome:"committed"}});
  await routeTarget.receiveOperation(operations[0]);
  await expect(routeTarget.receiveOperation({...operations[0],outcome:null})).rejects.toThrow(/committed local/);
  await expect(routeSource.admit({...admission("forged-local"),codec:{id:"schedules.local",version:1}})).rejects.toThrow(/atomic source/);
  expect((await routeSource.exportProjectedCommits(plan.id,0)).flatMap(commit=>commit.changes).some(change=>change.before?.table==="schedules" && change.before.key==="[701]" && change.after===null)).toBe(true);
});
it("task4.4 preserves selected historical audit without importing its unrelated current schedule",async()=>{
  await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Private member')").run();
  await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(701,90,'2026-10-15','Private current schedule','방송'),(702,1,'2026-10-15','Selected current schedule','방송')").run();
  await sourceDb.prepare("INSERT INTO update_logs(id,schedule_id,member_uid,schedule_date,action,title,actor_id) VALUES(801,701,1,'2026-10-14','update','Selected historical fact','Private original actor'),(802,702,1,'2026-10-15','create','Selected current fact','Private original actor')").run();
  const raw=await sourceDb.prepare("SELECT * FROM schedules ORDER BY id").all(),history=await sourceDb.prepare("SELECT * FROM update_logs ORDER BY id").all();
  const {routeSource,routeTarget}=await routeControls();
  const header=await routeSource.describeBaseline(plan.id);await routeTarget.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof routeSource.exportBaselinePage>>["next"]|0=0;
  do {const page=await routeSource.exportBaselinePage(header,cursor);await routeTarget.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await routeTarget.materializeBaselinePage(plan.id)) { /* original baseline flow */ }
  await routeTarget.finalizeBaseline(plan.id);
  expect((await targetDb.prepare("SELECT id,title FROM schedules ORDER BY id").all()).results).toEqual([{id:702,title:"Selected current schedule"}]);
  expect((await targetDb.prepare("SELECT schedule_id,title,actor_id FROM update_logs ORDER BY id").all()).results).toEqual([{schedule_id:701,title:"Selected historical fact",actor_id:null},{schedule_id:702,title:"Selected current fact",actor_id:null}]);
  expect((await sourceDb.prepare("SELECT * FROM schedules ORDER BY id").all()).results).toEqual(raw.results);
  expect((await sourceDb.prepare("SELECT * FROM update_logs ORDER BY id").all()).results).toEqual(history.results);
});
it.each(["create","update","scope-exit"])("task4.4 returns the original committed source %s receipt after the fence without another write",async(mode)=>{
  if(mode!=="create") await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(701,1,'2026-10-15','Before request','방송')").run();
  if(mode==="scope-exit") await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Private member')").run();
  const {routeSource}=await routeControls();
  const body={...(mode!=="create"?{id:701}:{}),member_uid:mode==="scope-exit"?90:1,date:"2026-10-15",title:"One accepted request",status:"방송"};
  const save=()=>handleWorkerFetch(new Request("http://localhost:5173/api/schedules/save",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"schedule-retry-original-0001"},body:JSON.stringify(body)}),{...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket"} as unknown as Env);
  const first=await save();expect(first.status).toBe(200);const receipt=await first.json();
  await routeSource.freeze(plan.id,Date.now());
  const auditBefore=await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n");
  const retry=await save();expect(retry.status).toBe(200);expect(await retry.json()).toEqual(receipt);
  expect(await sourceDb.prepare("SELECT count(*) n FROM schedules WHERE title='One accepted request'").first("n")).toBe(1);
  expect(await sourceDb.prepare("SELECT count(*) n FROM update_logs").first("n")).toBe(auditBefore);
  expect(JSON.stringify(await routeSource.exportFrozenOperations(plan.id))).not.toContain("sourceReceipt");
  body.title="Changed request with the same key";
  const mismatch=await save();expect(mismatch.status).toBe(409);expect(await mismatch.json()).toMatchObject({error:{code:"CONTENT_CONFLICT"}});
});
it("task4.4 admits a new target schedule only through its own verified Clerk boundary",async()=>{
  const {routeSource,routeTarget}=await routeControls();clearAuthCachesForTests();
  const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"local-boundary-fixture",alg:"RS256",use:"sig"};
  const encode=(value:string|ArrayBuffer)=>btoa(String.fromCharCode(...(typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const token=async(issuer:string)=>{const content=`${encode(JSON.stringify({alg:"RS256",kid:jwk.kid}))}.${encode(JSON.stringify({iss:issuer,azp:"http://localhost:5174",sub:"target-local-user",exp:Math.floor(Date.now()/1000)+300}))}`;return `${content}.${encode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(content)))}`;};
  const spy=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>{if(String(input)!=="https://luvdia.local-clerk.example/.well-known/jwks.json") throw new Error("Unexpected external fixture IO");return Response.json({keys:[jwk]});});
  try {
    const send=vi.fn().mockRejectedValueOnce(new Error("Queue send lost after durable admission")).mockResolvedValue(undefined);
    const create=vi.fn();
    const targetEnv={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CLERK_ISSUER:"https://luvdia.local-clerk.example",CLERK_AUTHORIZED_PARTIES:"http://localhost:5174",OTW_OPS_BACKGROUND_QUEUE:{send},SCHEDULED_OPERATIONS_WORKFLOW:{create}} as unknown as Env;
    const request=(authorization?:string)=>handleWorkerFetch(new Request("http://localhost:5174/api/schedules/save",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"target-native-original-0001","X-Actor-Id":"target-local-user",...(authorization?{Authorization:`Bearer ${authorization}`}:{})},body:JSON.stringify({member_uid:1,date:"2026-10-15",title:"Native target input",status:"방송"})}),targetEnv);
    expect((await request()).status).toBe(403);
    expect((await request(await token("https://otw.local-clerk.example"))).status).toBe(403);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
    const response=await request(await token("https://luvdia.local-clerk.example"));expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
    expect(await targetDb.prepare("SELECT generation,outcome_json FROM content_transition_operations").first()).toEqual({generation:2,outcome_json:null});
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
    const pending=(await targetDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations").first<{operation_id:string;payload_hash:string}>())!;
    await targetDb.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'").run();
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.UTC(2026,9,15,1,3)} as ScheduledController,targetEnv);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual({type:"content-transition.operation",version:1,transitionId:plan.id,operationId:pending.operation_id,payloadHash:pending.payload_hash});
    expect(create).not.toHaveBeenCalled();
    const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId:pending.operation_id,payloadHash:pending.payload_hash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,{...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket"} as unknown as Env);
    expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalled();
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));
    const header=await routeSource.describeBaseline(plan.id);await routeTarget.beginBaseline(header);
    let cursor:Awaited<ReturnType<typeof routeSource.exportBaselinePage>>["next"]|0=0;
    do {const page=await routeSource.exportBaselinePage(header,cursor);await routeTarget.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
    while(await routeTarget.materializeBaselinePage(plan.id)) { /* actual bounded installer */ }
    await routeTarget.finalizeBaseline(plan.id);await transferStaticProof();
    await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,{...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket"} as unknown as Env);
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(await targetDb.prepare("SELECT title FROM schedules").first("title")).toBe("Native target input");
    expect(await targetDb.prepare("SELECT actor_id FROM update_logs").first("actor_id")).toBe("target-local-user");
    const originalResult=await request(await token("https://luvdia.local-clerk.example"));expect(originalResult.status).toBe(200);
    expect(await originalResult.json()).toMatchObject({success:true,action:"create"});
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(1);
  } finally {spy.mockRestore();clearAuthCachesForTests();}
});
it("task4.4 admits native D-day create without a reserved ID and returns its original target-local result",async()=>{
  const {routeSource,routeTarget}=await routeControls();clearAuthCachesForTests();
  const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"dday-fixture",alg:"RS256",use:"sig"};
  const encode=(value:string|ArrayBuffer)=>btoa(String.fromCharCode(...(typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const token=async(sub:string,iss="https://luvdia.local-clerk.example")=>{const content=`${encode(JSON.stringify({alg:"RS256",kid:jwk.kid}))}.${encode(JSON.stringify({iss,azp:"http://localhost:5174",sub,exp:Math.floor(Date.now()/1000)+300}))}`;return `${content}.${encode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(content)))}`;};
  const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>{if(String(input)!=="https://luvdia.local-clerk.example/.well-known/jwks.json") throw new Error("Unexpected external fixture IO");return Response.json({keys:[jwk]});});
  try {
    const send=vi.fn().mockResolvedValue(undefined);
    const targetEnv={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",CLERK_ISSUER:"https://luvdia.local-clerk.example",CLERK_AUTHORIZED_PARTIES:"http://localhost:5174",CLERK_ADMIN_IDS:"own-admin",OTW_OPS_BACKGROUND_QUEUE:{send}} as unknown as Env;
    const body={title:"Native target anniversary",date:"2026-10-15",type:"event"};
    const request=(authorization:string)=>handleWorkerFetch(new Request("http://localhost:5174/api/ddays",{method:"POST",headers:{Authorization:`Bearer ${authorization}`,"Content-Type":"application/json","Idempotency-Key":"native-dday-original-0001"},body:JSON.stringify(body)}),targetEnv);
    expect((await request(await token("own-member"))).status).toBe(403);
    expect((await request(await token("own-admin","https://otw.local-clerk.example"))).status).toBe(401);
    const before=(await targetDb.prepare("SELECT * FROM ddays ORDER BY id").all()).results;
    await expect(targetDb.prepare("INSERT INTO ddays(title,date) VALUES('Bypass native owner','2026-10-15')").run()).rejects.toThrow(/final_owner_required/);
    const admin=await token("own-admin");
    const accepted=await request(admin);expect(accepted.status).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
    expect((await request(admin)).status).toBe(409);
    expect((await targetDb.prepare("SELECT * FROM ddays ORDER BY id").all()).results).toEqual(before);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(1);
    const operation=(await targetDb.prepare("SELECT operation_id,payload_hash,generation,envelope_json FROM content_transition_operations").first<{operation_id:string;payload_hash:string;generation:number;envelope_json:string}>())!;
    expect(operation.generation).toBe(2);expect(JSON.parse(operation.envelope_json).nativeReceipt.result).toBeNull();
    const message={body:send.mock.calls[0][0],ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
    expect(message.ack).not.toHaveBeenCalled();
    await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
    expect(message.ack).toHaveBeenCalledOnce();
    const created=await targetDb.prepare("SELECT id,title FROM ddays WHERE title=?").bind(body.title).first<{id:number;title:string}>();expect(created).not.toBeNull();
    const receipt=JSON.parse((await targetDb.prepare("SELECT envelope_json FROM content_transition_operations WHERE operation_id=?").bind(operation.operation_id).first<string>("envelope_json"))!).nativeReceipt;
    expect(receipt).toMatchObject({actorId:"own-admin",result:{success:true,id:created!.id}});
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_journal WHERE row_table='ddays' AND row_key=? AND after_json IS NOT NULL").bind(JSON.stringify([created!.id])).first("n")).toBe(1);
    const retry=await request(admin);expect(retry.status).toBe(201);expect(await retry.text()).toBe("Created");
    expect(await targetDb.prepare("SELECT count(*) n FROM ddays WHERE title=?").bind(body.title).first("n")).toBe(1);
    body.title="Changed body on original key";const conflict=await request(admin);expect(conflict.status).toBe(409);expect(await conflict.json()).toMatchObject({error:{code:"CONTENT_CONFLICT"}});
    const update=()=>handleWorkerFetch(new Request("http://localhost:5174/api/ddays",{method:"PUT",headers:{Authorization:`Bearer ${admin}`,"Content-Type":"application/json","Idempotency-Key":"native-dday-update-0001"},body:JSON.stringify({...body,id:created!.id})}),targetEnv);
    expect((await update()).status).toBe(200);expect((await update()).status).toBe(200);
    expect(await targetDb.prepare("SELECT title FROM ddays WHERE id=?").bind(created!.id).first("title")).toBe(body.title);
    const remove=()=>handleWorkerFetch(new Request(`http://localhost:5174/api/ddays?id=${created!.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${admin}`,"Idempotency-Key":"native-dday-delete-0001"}}),targetEnv);
    expect((await remove()).status).toBe(200);expect((await remove()).status).toBe(200);
    expect(await targetDb.prepare("SELECT id FROM ddays WHERE id=?").bind(created!.id).first()).toBeNull();
    expect((await targetDb.prepare("SELECT before_json,after_json FROM content_transition_journal WHERE row_table='ddays' AND row_key=? ORDER BY seq").bind(JSON.stringify([created!.id])).all()).results).toHaveLength(3);
    expect(await sourceDb.prepare("SELECT count(*) n FROM ddays WHERE title IN (?,?)").bind("Native target anniversary",body.title).first("n")).toBe(0);
  } finally {fetch.mockRestore();clearAuthCachesForTests();}
});
it("task4.4 keeps selected source D-day writes atomic and new source rows subject to classification",async()=>{
  await sourceDb.prepare("DELETE FROM content_transitions").run();await targetDb.prepare("DELETE FROM content_transitions").run();
  await sourceDb.prepare("INSERT INTO ddays(id,title,date,type) VALUES(900,'Selected D-day','2026-10-15','event')").run();
  const classified={...plan,classifications:[...plan.classifications,{table:"ddays",key:"[900]",disposition:"include" as const,reason:"Approved anniversary"}]};
  await source.prepare(classified);await target.prepare(classified);await ready();
  const writer=new D1DDayRepository(getDb({otw_db:sourceDb} as Env),false,new D1DDayTransitionWriter(source,"otw",{actorId:"source-admin",requestId:"source-dday-update-0001"}));
  const input={title:"Updated selected D-day",date:"2026-10-15",type:"event",description:null,color:null};
  expect(await writer.update(900,input)).toBe(true);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE json_extract(envelope_json,'$.codec.id')='ddays.local' AND json_extract(outcome_json,'$.outcome')='committed'").first("n")).toBe(1);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_journal WHERE row_table='ddays' AND row_key='[900]' AND commit_seq>(SELECT seq FROM content_transition_commits WHERE operation_id='baseline')").first("n")).toBe(1);
  const newWriter=new D1DDayRepository(getDb({otw_db:sourceDb} as Env),false,new D1DDayTransitionWriter(source,"otw",{actorId:"source-admin"}));
  expect(await newWriter.create({...input,title:"New unclassified D-day"})).toBe(true);
  const newId=await sourceDb.prepare("SELECT id FROM ddays WHERE title='New unclassified D-day'").first<number>("id");
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  expect(await newWriter.remove(newId!)).toBe(true);
  const racing=new D1DDayRepository(getDb({otw_db:interleave(sourceDb,"batch",()=>source.freeze(plan.id,now))} as Env),false,new D1DDayTransitionWriter(new D1TransitionRepository(interleave(sourceDb,"batch",()=>source.freeze(plan.id,now)),"otw","source-db", null, null, catalogImportProjection),"otw",{actorId:"source-admin"}));
  await expect(racing.update(900,{...input,title:"Too late"})).rejects.toMatchObject({code:"CONTENT_MOVED"});
  expect(await sourceDb.prepare("SELECT title FROM ddays WHERE id=900").first("title")).toBe(input.title);
  expect(await writer.update(900,input)).toBe(true); // Original source receipt survives the fence.
  await expect(newWriter.remove(900)).rejects.toMatchObject({code:"CONTENT_MOVED"});
  expect((await newWriter.list()).some(row=>row.id===900)).toBe(false);
  expect(JSON.stringify(await source.exportFrozenOperations(plan.id))).not.toContain("source-admin");
});
it("task4.4 transfers only original persisted receipts through two actual named Worker bindings",async()=>{
  const {routeSource}=await routeControls();
  const accepted=await routeSource.admit(admission("binding-original"));
  const readiness=await relayBindings.SOURCE_RELAY.connectIngress(plan.id);
  expect(await routeSource.readReadiness(plan.id)).toEqual(readiness);
  await routeSource.freeze(plan.id,Date.now());
  await relayBindings.TARGET_RELAY.receiveFence(plan.id);
  expect(await relayBindings.TARGET_RELAY.receiveOperation(plan.id,accepted.operationId,"forged-hash")).toEqual({accepted:false,reason:"original_receipt_mismatch"});
  const receipt=await relayBindings.TARGET_RELAY.receiveOperation(plan.id,accepted.operationId,accepted.payloadHash);
  expect(receipt).toEqual({accepted:true,receipt:{operationId:accepted.operationId,payloadHash:accepted.payloadHash}});
  expect(await relayBindings.TARGET_RELAY.receiveOperation(plan.id,accepted.operationId,accepted.payloadHash)).toEqual(receipt);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE operation_id='binding-original' AND transferred=1").first("n")).toBe(1);
  expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
  for(const worker of [relayBindings.SOURCE_WORKER,relayBindings.TARGET_WORKER]) {
    const response=await worker.fetch(new Request("http://localhost/api/content-transition/receive-operation",{method:"POST",headers:{"Content-Type":"application/json","X-Peer-Site":"otw",Authorization:"Bearer fake-clerk"},body:JSON.stringify(accepted)}));
    expect(response.status).toBe(404);
  }
});
it("task4.4 recovers lost transfer and outcome replies without repeating the owning save",async()=>{
  await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','Original source','방송')").run();
  const {routeSource,routeTarget}=await routeControls();
  const accepted=await routeSource.admit(admission("lost-transfer-reply"));
  await relayBindings.SOURCE_RELAY.connectIngress(plan.id);
  await routeSource.freeze(plan.id,Date.now());await relayBindings.TARGET_RELAY.receiveFence(plan.id);
  const event={cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.UTC(2026,9,15,1,3)} as ScheduledController;
  for(const db of [sourceDb,targetDb]) await db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'").run();
  let loseTransfer=true;
  const sourceEnv={...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket",SCHEDULED_OPERATIONS_WORKFLOW:{create:vi.fn()},CONTENT_TRANSITION_PEER:{
    describe:(id:string)=>relayBindings.TARGET_RELAY.describe(id),
    receiveOperation:async(id:string,operationId:string,hash:string)=>{const result=await relayBindings.TARGET_RELAY.receiveOperation(id,operationId,hash);if(loseTransfer) {loseTransfer=false;throw new Error("Lost transfer reply after durable receipt");}return result;},
  }} as unknown as Env;
  for(const peer of [undefined,relayBindings.SOURCE_RELAY]) {
    await expect(handleScheduledWorkflowCron(event,{...sourceEnv,CONTENT_TRANSITION_PEER:peer})).rejects.toThrow(/recovery failed/);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  }
  await targetDb.prepare("CREATE UNIQUE INDEX ct_mismatched_schema_fixture ON content_transitions(local_resource)").run();
  await expect(handleScheduledWorkflowCron(event,sourceEnv)).rejects.toThrow(/recovery failed/);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  await targetDb.prepare("DROP INDEX ct_mismatched_schema_fixture").run();
  await expect(handleScheduledWorkflowCron(event,sourceEnv)).rejects.toThrow(/recovery failed/);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE transferred=1").first("n")).toBe(1);
  await handleScheduledWorkflowCron(event,sourceEnv);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(1);
  const send=vi.fn().mockResolvedValue(undefined);
  let loseOutcome=true;
  const targetEnv={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",OTW_OPS_BACKGROUND_QUEUE:{send},SCHEDULED_OPERATIONS_WORKFLOW:{create:vi.fn()},CONTENT_TRANSITION_PEER:{
    describe:(id:string)=>relayBindings.SOURCE_RELAY.describe(id),
    acknowledgeOutcome:async(id:string,kind:"operation"|"file",recordId:string)=>{const receipt=await relayBindings.SOURCE_RELAY.acknowledgeOutcome(id,kind,recordId);if(loseOutcome){loseOutcome=false;throw new Error("Lost outcome reply after source acknowledgement");}return receipt;},
  }} as unknown as Env;
  await handleScheduledWorkflowCron(event,targetEnv);
  expect(send).toHaveBeenCalledExactlyOnceWith({type:"content-transition.operation",version:1,transitionId:plan.id,operationId:accepted.operationId,payloadHash:accepted.payloadHash});
  const message={body:send.mock.calls[0][0],ack:vi.fn(),retry:vi.fn()};
  await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
  expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalledOnce();
  const header=await routeSource.describeBaseline(plan.id);await routeTarget.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof routeSource.exportBaselinePage>>["next"]|0=0;
  do {const page=await routeSource.exportBaselinePage(header,cursor);await routeTarget.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await routeTarget.materializeBaselinePage(plan.id)) { /* original bounded installer */ }
  await routeTarget.finalizeBaseline(plan.id);await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
  await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
  expect(message.ack).not.toHaveBeenCalled();expect(message.retry).toHaveBeenCalledTimes(2);
  expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("accepted edit");
  expect(await sourceDb.prepare("SELECT outcome_acknowledged FROM content_transition_operations").first("outcome_acknowledged")).toBe(1);
  expect(await targetDb.prepare("SELECT outcome_acknowledged FROM content_transition_operations").first("outcome_acknowledged")).toBe(0);
  const audit=await targetDb.prepare("SELECT * FROM update_logs").all();
  await handleScheduledWorkflowCron(event,targetEnv);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await targetDb.prepare("SELECT outcome_acknowledged FROM content_transition_operations").first("outcome_acknowledged")).toBe(1);
  await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
  expect(message.ack).toHaveBeenCalledOnce();
  expect((await targetDb.prepare("SELECT * FROM update_logs").all()).results).toEqual(audit.results);
  await handleScheduledWorkflowCron(event,sourceEnv);
  expect(await sourceDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("Original source");
});
it("task4.4 continues recovery past a failed item and the first bounded page with collection disabled",async()=>{
  const {routeTarget}=await routeControls();
  for(let index=0;index<51;index++) {
    await routeTarget.admitNativeSchedule({...admission(`native-${index}`),codec:{id:"schedules.mutate",version:1},subject:{table:"schedules",key:"[null]"},payload:{action:"create",input:{id:null,member_uid:1,date:"2026-10-15",start_time:null,title:`Pending ${index}`,status:"방송"}}},{actorId:"validated-target-fixture",actorName:null,actorIp:null});
  }
  await targetDb.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'").run();
  const send=vi.fn().mockRejectedValueOnce(new Error("One delivery failure")).mockResolvedValue(undefined),create=vi.fn();
  const runtime={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",OTW_OPS_BACKGROUND_QUEUE:{send},SCHEDULED_OPERATIONS_WORKFLOW:{create}} as unknown as Env;
  const event={cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:Date.UTC(2026,9,15,1,3)} as ScheduledController;
  await expect(handleScheduledWorkflowCron(event,runtime)).rejects.toThrow(/recovery failed/);
  expect(send).toHaveBeenCalledTimes(51);expect(send.mock.calls[50][0]).toMatchObject({operationId:"native-50"});
  expect(create).not.toHaveBeenCalled();
  expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE outcome_json IS NULL").first("n")).toBe(51);
  await handleScheduledWorkflowCron(event,runtime);
  expect(send.mock.calls[51][0]).toEqual(send.mock.calls[0][0]);
  expect(send).toHaveBeenCalledTimes(102);
});
it.each(["correct","delete"])("fix1 rejects unresolved sealed file history after current notice %s and replays the same history after origin approval",async(mode)=>{
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(905,'history','[1]','[\"/profile/bing_hayu.webp\"]')").run();
  await ready();
  const header=await source.describeBaseline(plan.id);
  await source.admit(admission("history-unknown"));
  await source.commit(plan.id,"history-unknown",1,[sourceDb.prepare("UPDATE notices SET image_urls='[\"https://history.example/profile/bing_hayu.webp\"]' WHERE id=905")]);
  await source.admit(admission("history-fix"));
  await source.commit(plan.id,"history-fix",1,[sourceDb.prepare(mode==="delete"?"DELETE FROM notices WHERE id=905":"UPDATE notices SET image_urls='[\"/profile/bing_hayu.webp\"]' WHERE id=905")]);
  const sealed=await sourceDb.prepare("SELECT before_json,after_json FROM content_transition_journal WHERE row_table='notices' AND row_key='[905]' ORDER BY seq").all();
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  await expect(source.exportProjectedCommits(plan.id,header.boundary)).rejects.toThrow(/classification/);
  const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[],"history-approved",{receiptId:"history-reviewed",protocol:1,manifestDigest:"history-approved"},[{kind:"external",origin:"https://history.example",reason:"Approved external-only original history"}]);
  await target.acceptManifestRevision(revision);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"history-ready",2000),now);
  await target.installFence(await source.freeze(plan.id,now));
  await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* actual bounded installer */ }
  await target.finalizeBaseline(plan.id);
  expect((await source.describeBaseline(plan.id)).fileInventory).toEqual(header.fileInventory);
  await transferStaticProof();
  expect(await targetDb.prepare("SELECT plan_json,manifest_revision,expected_digest FROM content_transition_file_inventories WHERE transition_id=? AND state='received'").bind(plan.id).first()).toEqual({plan_json:JSON.stringify(header.fileInventory!.plan),manifest_revision:header.fileInventory!.manifestRevision,expected_digest:header.fileInventory!.digest});
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) await target.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=905").first("image_urls")).toBe(mode==="delete"?null:'["/profile/bing_hayu.webp"]');
  expect((await sourceDb.prepare("SELECT before_json,after_json FROM content_transition_journal WHERE row_table='notices' AND row_key='[905]' ORDER BY seq").all()).results).toEqual(sealed.results);
});
it.each(["/profile//bing_hayu.webp","/profile/bing_hayu.webp/","/r2-assets/notices//thumbnails/a.webp"])("fix1 rejects noncanonical slash path at the actual final fence: %s",async(raw)=>{
  await ready();
  await source.admit(admission("slash"));
  await source.commit(plan.id,"slash",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(906,'slash','[1]',?)").bind(JSON.stringify([raw]))]);
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
});
async function ready() {
  await capturing();
  await installInactiveBaseline();
  const receipt = await target.openIngress(plan.id, "ingress-1", 1000);
  await source.acknowledgeIngress(receipt, now);
  return receipt;
}
it("task4.4 rejects legacy receiver readiness on the current installed schema before ACK and fence",async()=>{
  await capturing();await installInactiveBaseline();
  const current=await target.openIngress(plan.id,"compiled-receiver",1000);
  const legacy={...current} as Record<string,unknown>;delete legacy.receiverContract;
  const before=await sourceDb.prepare("SELECT phase,readiness_json,fence_json FROM content_transitions").first();
  await expect(source.acknowledgeIngress(legacy as unknown as typeof current,now)).rejects.toThrow(/receiver/i);
  expect(await sourceDb.prepare("SELECT phase,readiness_json,fence_json FROM content_transitions").first()).toEqual(before);
  await source.acknowledgeIngress(current,now);
  await sourceDb.prepare("UPDATE content_transitions SET readiness_json=? WHERE id=?").bind(JSON.stringify(legacy),plan.id).run();
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/receiver/i);
  expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions").first("fence_json")).toBeNull();
  await sourceDb.prepare("UPDATE content_transitions SET readiness_json=? WHERE id=?").bind(JSON.stringify(current),plan.id).run();
  const racing=new D1TransitionRepository(interleave(sourceDb,"batch",()=>sourceDb.prepare("UPDATE content_transitions SET readiness_json=? WHERE id=?").bind(JSON.stringify(legacy),plan.id).run()),"otw","source-db", null, null, catalogImportProjection);
  await expect(racing.freeze(plan.id,now)).rejects.toThrow();
  expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions").first("fence_json")).toBeNull();
  await targetDb.prepare("UPDATE content_transitions SET readiness_json=? WHERE id=?").bind(JSON.stringify(legacy),plan.id).run();
  await expect(target.admit(admission("legacy-native-rejected"))).rejects.toThrow(/receiver/);
  expect(await target.readOperation(plan.id,"legacy-native-rejected")).toBeNull();
});
it("review corrections accept extra performance indexes through the named peer and reject contract schema changes",async()=>{
  const {routeSource,routeTarget}=await routeControls();
  const runtime={...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket",CONTENT_TRANSITION_PEER:relayBindings.TARGET_RELAY} as unknown as Env;
  const sourceSchema=await routeSource.describePeer(plan.id);
  await targetDb.prepare("CREATE INDEX ct_performance_only_fixture ON content_transitions(local_resource)").run();
  try {
    expect((await relayBindings.TARGET_RELAY.describe(plan.id)).schemaDigest).toBe(sourceSchema.schemaDigest);
    await expect(transitionPeer(runtime,plan.id,"source")).resolves.toBeDefined();
    await relayBindings.SOURCE_RELAY.connectIngress(plan.id);
    const before=await routeSource.readReadiness(plan.id);
    for(const difference of [
      {create:"CREATE UNIQUE INDEX ct_unique_contract_fixture ON content_transitions(local_resource)",drop:"DROP INDEX ct_unique_contract_fixture"},
      {create:"CREATE TRIGGER ct_protective_contract_fixture BEFORE UPDATE OF local_resource ON content_transitions BEGIN SELECT RAISE(ABORT,'protected_resource'); END",drop:"DROP TRIGGER ct_protective_contract_fixture"},
    ]) {
      await targetDb.prepare(difference.create).run();
      try {
        expect((await relayBindings.TARGET_RELAY.describe(plan.id)).schemaDigest).not.toBe(sourceSchema.schemaDigest);
        await expect(transitionPeer(runtime,plan.id,"source")).rejects.toThrow(/runtime\/schema\/receiver/);
        expect(await routeSource.readReadiness(plan.id)).toEqual(before);
        expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions").first("fence_json")).toBeNull();
        expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
      } finally {await targetDb.prepare(difference.drop).run();}
    }
    // Exercise an actual control column and verify exact schema restoration in
    // this isolated fixture after the negative check.
    const originalSql=await targetDb.prepare("SELECT sql FROM sqlite_master WHERE name='content_transition_operations'").first<string>("sql");
    await targetDb.prepare("ALTER TABLE content_transition_operations ADD COLUMN review_required TEXT").run();
    try {
      await expect(transitionPeer(runtime,plan.id,"source")).rejects.toThrow(/runtime\/schema\/receiver/);
      expect(await routeSource.readReadiness(plan.id)).toEqual(before);
    } finally {await targetDb.prepare("ALTER TABLE content_transition_operations DROP COLUMN review_required").run();}
    expect(await targetDb.prepare("SELECT sql FROM sqlite_master WHERE name='content_transition_operations'").first("sql")).toBe(originalSql);
    await routeSource.freeze(plan.id,Date.now());await relayBindings.TARGET_RELAY.receiveFence(plan.id);
    await routeTarget.admit(admission("native-with-performance-index"));
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(0);
  } finally {await targetDb.prepare("DROP INDEX ct_performance_only_fixture").run();}
},20000);
it("task4.4 rejects a same-schema peer missing the compiled receiver contract",async()=>{
  const {routeSource,routeTarget}=await routeControls();
  const own=await routeSource.describePeer(plan.id),actual=await routeTarget.describePeer(plan.id);
  expect(actual.schemaDigest).toBe(own.schemaDigest);
  const before=await routeSource.readReadiness(plan.id);
  for(const contract of [undefined,"older-compiled-contract"]) {
    const runtime={...bindings,...siteEnv(),SITE_ASSET_BUCKET_NAME:"otw-bucket",CONTENT_TRANSITION_PEER:{describe:async()=>({...actual,receiverContract:contract})}} as unknown as Env;
    await expect(transitionPeer(runtime,plan.id,"source")).rejects.toThrow(/receiver/);
  }
  expect(await routeSource.readReadiness(plan.id)).toEqual(before);
  expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions").first("fence_json")).toBeNull();
});
it("task4.4 rejects native readiness before actual inactive baseline installation",async()=>{
  await capturing();
  await expect(target.openIngress(plan.id,"too-early",1000)).rejects.toThrow(/baseline/);
  expect(await target.readReadiness(plan.id)).toBeNull();
  expect(await source.readReadiness(plan.id)).toBeNull();
});
it("task4.4 rejects a deprecated installed member through original reference validation",async()=>{
  await sourceDb.prepare("UPDATE members SET is_deprecated=1 WHERE uid=1").run();
  await capturing();await installInactiveBaseline();
  const gateway=new D1NoticeGateway(getDb({otw_db:targetDb} as Env));
  expect(await gateway.areRelatedMembersValid([1])).toBe(false);
  expect(await gateway.areRelatedMembersValid([99999])).toBe(false);
  await expect(target.openIngress(plan.id,"deprecated",1000)).rejects.toThrow(/valid target members/);
  expect(await target.readReadiness(plan.id)).toBeNull();
});
it("task4.4 atomically rejects readiness when complete baseline proof changes before its CAS",async()=>{
  await capturing();await installInactiveBaseline();
  const raced=new D1TransitionRepository(interleave(targetDb,"SET phase='target_ingress_ready'",()=>targetDb.prepare("UPDATE content_transition_baselines SET receipt_json=NULL WHERE transition_id='move'").run()),"luvdia","target-db", null, null, catalogImportProjection);
  await expect(raced.openIngress(plan.id,"lost-proof",1000)).rejects.toThrow(/race/);
  expect(await target.readReadiness(plan.id)).toBeNull();expect(await source.readReadiness(plan.id)).toBeNull();
});
it("task4.4 hides inactive target data at the actual Worker read entry",async()=>{
  await routeControls();
  const targetEnv={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",ASSETS:bindings.TARGET_ASSETS} as unknown as Env;
  expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(3);
  const response=await handleWorkerFetch(new Request("http://localhost:5174/api/members",{headers:{"X-Actor-Id":"admin","Host":"otw-schedule.info"}}),targetEnv);
  expect(response.status).toBe(403);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("task4.4 keeps prepared baseline internal until verified readiness and preserves owning notice validation",async()=>{
  await sourceDb.prepare("DELETE FROM content_transitions").run();await targetDb.prepare("DELETE FROM content_transitions").run();
  const ownPlan={...plan,sourceResource:"otw-db",targetResource:"luvdia-db"};
  const from=new D1TransitionRepository(sourceDb,"otw","otw-db","otw-bucket",sourceAvailability, catalogImportProjection);
  const to=new D1TransitionRepository(targetDb,"luvdia","luvdia-db","luvdia-bucket",targetAvailability, catalogImportProjection);
  await from.prepare(ownPlan);await to.prepare(ownPlan);await capturing(from);
  const header=await from.describeBaseline(plan.id);await to.beginBaseline(header);
  await expect(to.openIngress(plan.id,"header-only",Date.now()+60000)).rejects.toThrow(/baseline/);
  let cursor:Awaited<ReturnType<typeof from.exportBaselinePage>>["next"]|0=0;
  do {const page=await from.exportBaselinePage(header,cursor);await to.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await to.materializeBaselinePage(plan.id)) { /* actual prepared installation */ }
  await expect(to.openIngress(plan.id,"without-readback",Date.now()+60000)).rejects.toThrow(/baseline/);
  await to.finalizeBaseline(plan.id);
  expect((await to.readTransition(plan.id)).phase).toBe("prepared");
  expect(await to.readReadiness(plan.id)).toBeNull();expect(await from.readReadiness(plan.id)).toBeNull();
  await expect(targetDb.prepare("UPDATE members SET name='Premature edit' WHERE uid=1").run()).rejects.toThrow(/final_owner_required/);
  await expect(targetDb.prepare("INSERT INTO schedules(member_uid,date,status) VALUES(1,'2026-10-15','방송')").run()).rejects.toThrow(/final_owner_required/);
  clearAuthCachesForTests();
  const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"inactive-target-fixture",alg:"RS256",use:"sig"};
  const encode=(value:string|ArrayBuffer)=>btoa(String.fromCharCode(...(typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const token=async(sub:string,iss="https://luvdia.local-clerk.example")=>{const content=`${encode(JSON.stringify({alg:"RS256",kid:jwk.kid}))}.${encode(JSON.stringify({iss,azp:"http://localhost:5174",sub,exp:Math.floor(Date.now()/1000)+300}))}`;return `${content}.${encode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(content)))}`;};
  const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>{if(String(input)!=="https://luvdia.local-clerk.example/.well-known/jwks.json") throw new Error("Unexpected external fixture IO");return Response.json({keys:[jwk]});});
  const cache=vi.spyOn(caches.default,"match");
  const cacheWrite=vi.spyOn(caches.default,"put");
  try {
    const targetEnv={...bindings,...siteEnv("luvdia"),otw_db:targetDb,SITE_ASSET_BUCKET_NAME:"luvdia-bucket",ASSETS:bindings.TARGET_ASSETS,CLERK_ISSUER:"https://luvdia.local-clerk.example",CLERK_AUTHORIZED_PARTIES:"http://localhost:5174",CLERK_ADMIN_IDS:"own-admin",OTW_OPS_BACKGROUND_QUEUE:{send:vi.fn()}} as unknown as Env;
    const read=(path:string,authorization?:string,method="GET")=>handleWorkerFetch(new Request(`http://localhost:5174${path}`,{method,headers:{...(authorization?{Authorization:`Bearer ${authorization}`}:{})}}),targetEnv);
    const member=await token("own-member"),admin=await token("own-admin"),wrong=await token("own-admin","https://otw.local-clerk.example");
    expect((await read("/api/members",member)).status).toBe(403);
    const inspection=await read("/api/members",admin);expect(inspection.status).toBe(200);expect(inspection.headers.get("Cache-Control")).toBe("private, no-store");
    for(const path of ["/api/members","/api/schedule-board?startDate=2026-10-15&endDate=2026-10-15","/api/notices","/api/site-content?path=%2F","/api/play/catalog","/sitemap.xml","/profile/bing_hayu.webp","/profile/%62ing_hayu.webp","/r2-assets/notices/thumbnails/early.webp"]) {
      for(const method of ["GET","HEAD"]) {const response=await read(path,wrong,method);expect(response.status).toBe(403);expect(response.headers.get("Cache-Control")).toBe("private, no-store");}
    }
    expect(cache).not.toHaveBeenCalled();
    const privateContent=await read("/api/site-content?path=%2F",admin);expect(privateContent.status).toBe(200);
    expect(cache).not.toHaveBeenCalled();expect(cacheWrite).not.toHaveBeenCalled();
    await from.acknowledgeIngress(await to.openIngress(plan.id,"real-baseline",Date.now()+60000),Date.now());
    expect((await read("/api/members",member)).status).toBe(200);
    expect((await read("/api/members?archive=1",member)).status).toBe(403);
    const normalImage=await read("/profile/bing_hayu.webp",member);expect(normalImage.status).toBe(200);expect(normalImage.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await read("/profile/bing_hayu.webp?archive=1",member)).status).toBe(403);
    const save=(uids:number[])=>handleWorkerFetch(new Request("http://localhost:5174/api/notices",{method:"POST",headers:{Authorization:`Bearer ${admin}`,"Content-Type":"application/json"},body:JSON.stringify({content:"Native notice while owner pending",related_member_uids:uids})}),targetEnv);
    expect((await save([99999])).status).toBe(400);
    const accepted=await save([1]);expect(accepted.status).toBe(409);expect(await accepted.json()).toMatchObject({error:{code:"CONTENT_ACCEPTED"}});
    expect(await targetDb.prepare("SELECT count(*) n FROM notices").first("n")).toBe(0);
    const original=(await targetDb.prepare("SELECT operation_id,payload_hash FROM content_transition_operations").first<{operation_id:string;payload_hash:string}>())!;
    await from.admit(admission("late-source"));await from.commit(plan.id,"late-source",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-15','Late source tail','방송')")]);
    const fence=await from.freeze(plan.id,Date.now());await to.installFence(fence);
    for(const envelope of await from.exportFrozenOperations(plan.id)) await to.receiveOperation(envelope);
    for(const commit of await from.exportProjectedCommits(plan.id,header.boundary)) await to.installProjectedCommit(commit);
    await transferStaticProof();await to.installCommittedState(plan.id);await to.activate(plan.id);
    expect((await read("/api/members")).status).toBe(200);
    const message={body:{type:"content-transition.operation",version:1,transitionId:plan.id,operationId:original.operation_id,payloadHash:original.payload_hash},ack:vi.fn(),retry:vi.fn()};
    await handleWorkerQueue({queue:"luvdia-ops-background",messages:[message]} as unknown as MessageBatch<unknown>,targetEnv);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(await targetDb.prepare("SELECT content FROM notices").first("content")).toBe("Native notice while owner pending");
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("Late source tail");
  } finally {fetch.mockRestore();cache.mockRestore();cacheWrite.mockRestore();clearAuthCachesForTests();}
});
it.each(["/%GG%2f..%2fprofile/bing_hayu.webp","/%ff%2f..%2fprofile/bing_hayu.webp","/\\foreign.example/../../profile/bing_hayu.webp","/\t\\foreign.example/../../profile/bing_hayu.webp","/\n\\foreign.example/../../profile/bing_hayu.webp","/\r\\foreign.example/../../profile/bing_hayu.webp","/%5cforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp","/%2fforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp"].flatMap(raw=>["current","corrected history"].map(mode=>({raw,mode}))))("fix2 rejects an authority-changing path in actual D1 $mode $raw while source work continues",async({mode,raw})=>{
  await ready();
  await source.admit(admission("authority-path"));
  await source.commit(plan.id,"authority-path",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(908,'authority','[1]',?)").bind(JSON.stringify([raw]))]);
  if(mode==="corrected history") {
    await source.admit(admission("authority-correction"));
    await source.commit(plan.id,"authority-correction",1,[sourceDb.prepare("UPDATE notices SET image_urls='[]' WHERE id=908")]);
  }
  const original=(await sourceDb.prepare("SELECT * FROM content_transition_journal WHERE row_table='notices' AND row_key='[908]' ORDER BY seq").all()).results;
  const before=await sourceDb.prepare("SELECT * FROM content_transitions WHERE id=?").bind(plan.id).first();
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  expect(await sourceDb.prepare("SELECT * FROM content_transitions WHERE id=?").bind(plan.id).first()).toEqual(before);
  await source.admit(admission("ordinary-after-authority"));
  const command=await source.readExecutableCommand(plan.id,"ordinary-after-authority");
  await source.commit(plan.id,"ordinary-after-authority",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,start_time,title,status) VALUES(?,?,?,?,?,?)").bind(fixtureScheduleInput(command.payload).id,fixtureScheduleInput(command.payload).member_uid,fixtureScheduleInput(command.payload).date,fixtureScheduleInput(command.payload).start_time,fixtureScheduleInput(command.payload).title,fixtureScheduleInput(command.payload).status)]);
  expect(await sourceDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("accepted edit");
  expect((await sourceDb.prepare("SELECT * FROM content_transition_journal WHERE row_table='notices' AND row_key='[908]' ORDER BY seq").all()).results).toEqual(original);
});
async function installInactiveBaseline(from=source,to=target) {
  const header=await from.describeBaseline(plan.id);
  await to.beginBaseline(header);
  let cursor: Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do { const page=await from.exportBaselinePage(header,cursor); await to.stageBaselinePage(page); cursor=page.next; } while(cursor.ordinal<header.rows);
  while(await to.materializeBaselinePage(plan.id)) { /* bounded pages */ }
  await to.finalizeBaseline(plan.id);
  return header;
}
async function installTail() {
  const header=await installInactiveBaseline();
  const costs=[];
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) costs.push(await target.installProjectedCommit(commit));
  await transferStaticProof();
  return costs;
}
async function transferStaticProof() {
  const row=(await sourceDb.prepare("SELECT plan_json,manifest_revision,fence_json FROM content_transitions WHERE id=?").bind(plan.id).first<{plan_json:string;manifest_revision:number;fence_json:string}>())!;
  if(!row.fence_json) return; // Copy/replay may precede the final availability fence.
  const context:FileAvailabilityContext={plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,fence:JSON.parse(row.fence_json)};
  for(let offset=0;;) {const page=await sourceAvailability.exportInventoryPage(context,offset);await targetAvailability.receiveInventoryPage(context,page);offset=page.next.ordinal;if(offset===page.header.rows) break;}
  for(const observation of await sourceAvailability.observeStatic(context)) await targetAvailability.receiveSourceStatic(context,observation);
}
async function transferAndActivate() {
  const fence = await source.freeze(plan.id, now);
  await target.installFence(fence);
  for (const envelope of await source.exportFrozenOperations(plan.id)) await target.receiveOperation(envelope);
  for (const envelope of await source.exportFrozenFileIntents(plan.id)) await target.receiveFileIntent(envelope);
  await installTail();
  await target.installCommittedState(plan.id);
  await target.activate(plan.id);
  return fence;
}

/** Delay only the indicated real D1 write; all reads and both competing writes
 * still run through the actual repository and D1 runtime. */
function interleave(db:D1Database,match:string|"batch",competing:()=>Promise<unknown>):D1Database {
  let fired=false;
  const sqlByStatement=new WeakMap<D1PreparedStatement,string>();
  const before=async(sql:string)=>{if(!fired && (match==="batch" || sql.includes(match))) {fired=true;await competing();}};
  const statement=(value:D1PreparedStatement,sql:string):D1PreparedStatement=>{const wrapped=new Proxy(value,{get(target,key){
    if(key==="bind") return (...args:unknown[])=>statement(target.bind(...args),sql);
    if(key==="run") return async()=>{await before(sql);return target.run();};
    const member=Reflect.get(target,key);return typeof member==="function"?member.bind(target):member;
  }});sqlByStatement.set(wrapped,sql);return wrapped;};
  return new Proxy(db,{get(target,key){
    if(key==="prepare") return (sql:string)=>statement(target.prepare(sql),sql);
    if(key==="batch") return async(values:D1PreparedStatement[])=>{if(match==="batch") await before("");else for(const value of values) await before(sqlByStatement.get(value)??"");return target.batch(values);};
    const member=Reflect.get(target,key);return typeof member==="function"?member.bind(target):member;
  }});
}

it("fix1 reads late sealed file history inside the fence batch and rolls back all fence state",async()=>{
  await ready();
  const before=await sourceDb.prepare("SELECT phase,fence_json,manifest_revision,manifest_digest,readiness_json,checkpoint_revision FROM content_transitions WHERE id=?").bind(plan.id).first();
  const raced=new D1TransitionRepository(interleave(sourceDb,"batch",async()=>{
    await source.admit(admission("late-file"));
    await source.commit(plan.id,"late-file",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(907,'late history','[1]','[\"https://late.example/profile/bing_hayu.webp\"]')")]);
    await source.admit(admission("late-correction"));
    await source.commit(plan.id,"late-correction",1,[sourceDb.prepare("DELETE FROM notices WHERE id=907")]);
  }),"otw","source-db", null, null, catalogImportProjection);
  await expect(raced.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  expect(await sourceDb.prepare("SELECT phase,fence_json,manifest_revision,manifest_digest,readiness_json,checkpoint_revision FROM content_transitions WHERE id=?").bind(plan.id).first()).toEqual(before);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE generation=1 AND outcome_json IS NOT NULL").first("n")).toBe(2);
  await source.admit(admission("ordinary-after-file-conflict"));
  await source.commit(plan.id,"ordinary-after-file-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
});

describe("real D1 transition control", () => {
  it("fix2 admits a known nonselected schedule into scope and transfers only its selected committed image",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated private member')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14','Private prior title','방송')"),
    ]);
    await ready();
    const requested={...admission("scope-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,input:{...admission("unused").payload.input,id:7,title:"Selected correction"}}};
    const accepted=await source.admit(requested);
    expect(accepted.payload.expectedRows).toEqual([]);
    expect(JSON.stringify(accepted)).not.toContain("Private prior title");
    expect(JSON.stringify(accepted)).not.toContain("sourceCommand");
    expect(fixtureScheduleInput(accepted.payload).member_uid).toBe(11);
    const localState=await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceCommand.payload.expectedRows[0].member_uid') member_uid,json_extract(envelope_json,'$.sourceCommand.payload.expectedRows[0].title') title FROM content_transition_operations WHERE operation_id='scope-entry'").first();
    expect(localState).toEqual({member_uid:90,title:"Private prior title"});
    const command=await source.readExecutableCommand(plan.id,"scope-entry");
    await source.commit(plan.id,"scope-entry",1,[sourceDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(fixtureScheduleInput(command.payload).member_uid,fixtureScheduleInput(command.payload).title,fixtureScheduleInput(command.payload).id)]);
    expect(await sourceDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:1,title:"Selected correction"});
    await transferAndActivate();
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"Selected correction"});
    expect((await targetDb.prepare("SELECT uid FROM members ORDER BY uid").all()).results).toEqual([{uid:11},{uid:12},{uid:13}]);
    expect(JSON.stringify(await target.exportOperation(plan.id,"scope-entry"))).not.toContain("Private prior title");
  });
  it("fix2 preserves held scope-entry absence across source progress and conflicts with a newer native target edit",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14','Outside scope','방송')"),
    ]);
    await ready();
    const held={...admission("held-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,input:{...admission("unused").payload.input,id:7,title:"Held correction"}}};
    const original=await source.admit(held);
    await source.admit({...held,operationId:"source-entry",idempotencyKey:"source-entry",payload:{...held.payload,input:{...held.payload.input,title:"Source correction"}}});
    await source.commit(plan.id,"source-entry",1,[sourceDb.prepare("UPDATE schedules SET member_uid=1,title='Source correction' WHERE id=7")]);
    expect(await source.admit(held)).toEqual(original);
    await transferAndActivate();
    const current={...held,operationId:"native-edit",idempotencyKey:"native-edit",payload:{...held.payload,input:{...held.payload.input,member_uid:11,title:"New target edit"}}};
    const native=await target.admit(current);
    expect(native.payload.expectedRows).toEqual([expect.objectContaining({member_uid:11,title:"Source correction"})]);
    await target.commit(plan.id,"native-edit",2,[targetDb.prepare("UPDATE schedules SET title='New target edit' WHERE id=7")]);
    const executable=await target.readExecutableCommand(plan.id,"held-entry");
    await expect(target.commit(plan.id,"held-entry",2,[targetDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(fixtureScheduleInput(executable.payload).member_uid,fixtureScheduleInput(executable.payload).title,fixtureScheduleInput(executable.payload).id)])).rejects.toThrow(/Expected/);
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"New target edit"});
    expect((await target.exportOperation(plan.id,"held-entry")).payload.expectedRows).toEqual([]);
    expect((await target.exportOperation(plan.id,"held-entry")).outcome?.outcome).toBe("conflicted");
    expect(await targetDb.prepare("SELECT count(*) FROM members").first("count(*)")).toBe(3);
  });
  it.each(["unknown-member","unsupported-image"] as const)("fix2 never interprets %s as valid prior absence",async(kind)=>{
    if(kind==="unsupported-image") await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated')").run();
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14',?,'방송')").bind(kind==="unsupported-image"?new Uint8Array([0,1]).buffer:"Valid text").run();
    await ready();
    await expect(source.admit({...admission("invalid-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,input:{...admission("unused").payload.input,id:7}}})).rejects.toThrow();
    expect(await source.readOperation(plan.id,"invalid-entry")).toBeNull();
  });
  it("fix1 merges source progress after early operation and file reception without re-execution",async()=>{
    await ready();
    await source.admit(admission("early"));
    await source.recordFileIntent(plan.id,"early",{intentId:"early-file",logicalKey:"file",versionKey:"v/file",previousVersion:null,hash:null,size:null,status:"unknown"});
    const early=await source.exportOperation(plan.id,"early"),earlyFile=await source.exportFileIntent(plan.id,"early-file");
    await target.receiveOperation(early);await target.receiveFileIntent(earlyFile);
    await source.recordAttempt(plan.id,"early",{identity:"provider-early",status:"completed"});
    await source.recordFileObservation(plan.id,"early-file",{transitionId:plan.id,intentId:"early-file",generation:1,site:"otw",resource:"otw-bucket",objectVersion:null,copiedFromEvidenceId:null,evidenceId:"absent",versionKey:"v/file",result:"absent",hash:null,size:null,observedAt:101});
    await source.recordFileOutcome(plan.id,"early-file","absent","failed","Upload was absent");
    await source.commit(plan.id,"early",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','Completed on source','방송')")]);
    await transferAndActivate();
    expect((await target.exportOperation(plan.id,"early")).attempt).toEqual({identity:"provider-early",status:"completed"});
    expect((await target.exportOperation(plan.id,"early")).outcome).toMatchObject({outcome:"committed",sideEffectReconciled:true});
    expect((await target.exportFileIntent(plan.id,"early-file")).outcome).toEqual({outcome:"failed",detail:"Upload was absent",sideEffectReconciled:true});
    await target.receiveOperation(early);await target.receiveFileIntent(earlyFile);
    await expect(target.readExecutableCommand(plan.id,"early")).rejects.toThrow(/terminal/);
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("Completed on source");
  });
  it("fix1 requires a frozen source export after an early transfer before activating",async()=>{
    await ready();await source.admit(admission("early-pending"));
    const early=await source.exportOperation(plan.id,"early-pending");await target.receiveOperation(early);
    await target.installFence(await source.freeze(plan.id,now));await installTail();await target.installCommittedState(plan.id);
    await target.receiveOperation(early);
    await expect(target.activate(plan.id)).rejects.toThrow(/transferred/);
    await target.receiveOperation(await source.exportOperation(plan.id,"early-pending"));await target.activate(plan.id);
    await target.recordAttempt(plan.id,"early-pending",{identity:"target-attempt",status:"completed"});
    await target.recordOutcome(plan.id,"early-pending",{outcome:"failed",detail:"Target handled",sideEffectReconciled:true});
    await target.receiveOperation(early);
    expect((await target.exportOperation(plan.id,"early-pending")).attempt?.identity).toBe("target-attempt");
    expect((await target.exportOperation(plan.id,"early-pending")).outcome?.detail).toBe("Target handled");
  });
  it("fix1 preserves a schedule save expected state across handoff and rejects a late overwrite",async()=>{
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','Original','방송')").run();
    await ready();await source.admit(admission("held-schedule"));await transferAndActivate();
    await target.admit({...admission("new-schedule"),payload:{...admission("x").payload,input:{...admission("x").payload.input,title:"New edit"}}});
    await target.commit(plan.id,"new-schedule",2,[targetDb.prepare("UPDATE schedules SET title='New edit' WHERE id=1")]);
    const accepted=await target.exportOperation(plan.id,"new-schedule");
    expect(await target.admit({...admission("new-schedule"),payload:{...admission("x").payload,input:{...admission("x").payload.input,title:"New edit"}}})).toEqual(accepted);
    await expect(target.commit(plan.id,"held-schedule",2,[targetDb.prepare("UPDATE schedules SET title='Old held save' WHERE id=1")])).rejects.toThrow(/Expected/);
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("New edit");
    expect((await target.exportOperation(plan.id,"held-schedule")).outcome?.outcome).toBe("conflicted");
  });
  it("fix1 requires a final file seal and preserves target outcome against stale file retransmission",async()=>{
    await ready();await source.admit(admission("file-seal"));
    await source.recordFileIntent(plan.id,"file-seal",{intentId:"sealed-file",logicalKey:"image",versionKey:"version/image",previousVersion:null,hash:null,size:null,status:"unknown"});
    await target.receiveOperation(await source.exportOperation(plan.id,"file-seal"));
    const early=await source.exportFileIntent(plan.id,"sealed-file");await target.receiveFileIntent(early);
    const fence=await source.freeze(plan.id,now);await target.installFence(fence);
    await target.receiveOperation(await source.exportOperation(plan.id,"file-seal"));
    await installTail();await target.installCommittedState(plan.id);
    await expect(target.activate(plan.id)).rejects.toThrow(/transferred/);
    const sealed=await source.exportFileIntent(plan.id,"sealed-file");
    await expect(target.receiveFileIntent({...sealed,sourceFence:{...fence,boundary:fence.boundary+1}})).rejects.toThrow(/fence/);
    expect(await targetDb.prepare("SELECT transferred FROM content_transition_file_intents WHERE intent_id='sealed-file'").first("transferred")).toBe(0);
    await target.receiveFileIntent(sealed);await target.activate(plan.id);
    await target.recordFileObservation(plan.id,"sealed-file",{transitionId:plan.id,intentId:"sealed-file",generation:1,site:"luvdia",resource:"luvdia-bucket",objectVersion:null,copiedFromEvidenceId:null,evidenceId:"target-absent",versionKey:"version/image",result:"absent",hash:null,size:null,observedAt:101});
    await target.recordFileOutcome(plan.id,"sealed-file","target-absent","failed","Target confirmed absent");
    await target.receiveFileIntent(early);await target.receiveFileIntent(sealed);
    expect((await target.exportFileIntent(plan.id,"sealed-file")).outcome).toEqual({outcome:"failed",detail:"Target confirmed absent",sideEffectReconciled:true});
  });
  it.each([false,true])("fix1 renews expired readiness with prior source ACK=%s",async(acknowledged)=>{
    await capturing();await installInactiveBaseline();const old=await target.openIngress(plan.id,"expiring",101);
    if(acknowledged) await source.acknowledgeIngress(old,100);
    await expect(source.acknowledgeIngress(old,102)).rejects.toThrow(/expired/);
    const renewed=await target.openIngress(plan.id,"renewed",1000);
    expect(renewed.receiptId).toBe("renewed");
    expect(await target.openIngress(plan.id,"renewed",1000)).toEqual(renewed);
    await source.acknowledgeIngress(renewed,102);
    expect(await source.readReadiness(plan.id)).toEqual(renewed);
    await expect(source.acknowledgeIngress(old,100)).rejects.toThrow();
    expect((await source.freeze(plan.id,102)).manifestDigest).toBe(plan.manifestDigest);
  });
  it.each(["ack","freeze"] as const)("fix1 rejects stale %s after a classification revision without fencing source",async(action)=>{
    const old=await ready();
    await sourceDb.prepare("INSERT INTO ddays(id,title,date) VALUES(900,'Ambiguous','2026-10-14')").run();
    const concurrent=async()=>{
      const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[{table:"ddays",key:"[900]",disposition:"exclude",reason:"Reviewed unrelated"}],"next-manifest",{receiptId:"next-protection",protocol:1,manifestDigest:"next-manifest"});
      await target.acceptManifestRevision(revision);
      if(action==="freeze") await source.acknowledgeIngress(await target.openIngress(plan.id,"next-ready",2000),now);
    };
    // For ACK, renew the old manifest receipt so this is a real replacement.
    const receipt=action==="ack"?await target.openIngress(plan.id,"old-renewal",1500):old;
    const raced=new D1TransitionRepository(interleave(sourceDb,action==="ack"?"SET phase='target_ingress_ready'":"SET phase=iif",concurrent),"otw","source-db", null, null, catalogImportProjection);
    await expect(action==="ack"?raced.acknowledgeIngress(receipt,now):raced.freeze(plan.id,now)).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions WHERE id='move'").first("fence_json")).toBeNull();
    expect((await source.readTransition(plan.id)).manifestDigest).toBe("next-manifest");
    await source.admit(admission("after-race"));await source.commit(plan.id,"after-race",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    await source.acknowledgeIngress(await target.openIngress(plan.id,"next-ready",2000),now);
    const fence=await source.freeze(plan.id,now);expect(fence.manifestDigest).toBe("next-manifest");await target.installFence(fence);
  });
  it("fix1 rejects target renewal when a classification revision wins the write race",async()=>{
    await ready();await target.admit(admission("target-accepted"));
    await sourceDb.prepare("INSERT INTO ddays(id,title,date) VALUES(900,'Ambiguous','2026-10-14')").run();
    const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[{table:"ddays",key:"[900]",disposition:"exclude",reason:"Reviewed unrelated"}],"renewal-revision",{receiptId:"renewal-protection",protocol:1,manifestDigest:"renewal-revision"});
    const raced=new D1TransitionRepository(interleave(targetDb,"SET phase='target_ingress_ready'",()=>target.acceptManifestRevision(revision)),"luvdia","target-db", null, null, catalogImportProjection);
    await expect(raced.openIngress(plan.id,"stale-renewal",1500)).rejects.toThrow(/race/);
    expect(await target.readReadiness(plan.id)).toBeNull();
    expect((await target.exportOperation(plan.id,"target-accepted")).outcome).toBeNull();
    const fresh=await target.openIngress(plan.id,"fresh-revision",2000);await source.acknowledgeIngress(fresh,now);
    expect((await source.freeze(plan.id,now)).manifestDigest).toBe("renewal-revision");
  });
  it("fix1 retains terminal attempt state when a stale callback writes after completion",async()=>{
    await ready();await source.admit(admission("attempt-race"));
    await source.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"unknown"});
    const raced=new D1TransitionRepository(interleave(sourceDb,"SET attempt_json=?",()=>source.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"completed"})),"otw","source-db", null, null, catalogImportProjection);
    await expect(raced.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"unknown"})).rejects.toThrow();
    expect((await source.exportOperation(plan.id,"attempt-race")).attempt?.status).toBe("completed");
  });
  it("fix1 derives committed reconciliation from the attempt in the actual business transaction",async()=>{
    await ready();await source.admit(admission("commit-race"));
    const raced=new D1TransitionRepository(interleave(sourceDb,"batch",()=>source.recordAttempt(plan.id,"commit-race",{identity:"arriving",status:"unknown"})),"otw","source-db", null, null, catalogImportProjection);
    await raced.commit(plan.id,"commit-race",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    const actual=await source.exportOperation(plan.id,"commit-race");
    expect(actual.attempt?.status).toBe("unknown");expect(actual.outcome?.sideEffectReconciled).toBe(false);
    await transferAndActivate();await expect(target.readOutcomeReceipt(plan.id,"operation","commit-race")).rejects.toThrow(/reconciled/);
    await expect(target.complete(plan.id)).rejects.toThrow();
  });
  it("fix1 refuses reconciled disposition when an unknown attempt arrives before its write",async()=>{
    await ready();await source.admit(admission("outcome-race"));
    const raced=new D1TransitionRepository(interleave(sourceDb,"SET outcome_json=?",()=>source.recordAttempt(plan.id,"outcome-race",{identity:"arriving",status:"unknown"})),"otw","source-db", null, null, catalogImportProjection);
    await expect(raced.recordOutcome(plan.id,"outcome-race",{outcome:"failed",detail:"No effect",sideEffectReconciled:true})).rejects.toThrow();
    expect((await source.exportOperation(plan.id,"outcome-race")).outcome).toBeNull();
  });
  it("keeps sanitized source command coordinates local and executes the projected command only under target ownership",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,1,'2026-10-14','Source held','방송')").run();
    await ready();
    const operation={...admission("real-schedule-command"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,input:{...admission("unused").payload.input,id:7,title:"Projected actual edit",actorUserId:"private-source-actor"}}};
    await source.admit(operation);
    const local=await source.readExecutableCommand(plan.id,operation.operationId);
    expect(fixtureScheduleInput(local.payload).member_uid).toBe(1);
    expect(JSON.stringify(local)).not.toContain("private-source-actor");
    const wire=await source.exportOperation(plan.id,operation.operationId);
    expect(fixtureScheduleInput(wire.payload).member_uid).toBe(11);
    expect(JSON.stringify(wire)).not.toContain("sourceCommand");
    await target.receiveOperation(wire);
    await expect(target.readExecutableCommand(plan.id,operation.operationId)).rejects.toThrow(/fenced/);
    await transferAndActivate();
    await expect(source.readExecutableCommand(plan.id,operation.operationId)).rejects.toThrow(/fenced/);
    const command=await target.readExecutableCommand(plan.id,operation.operationId);
    await target.commit(plan.id,operation.operationId,2,[targetDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(fixtureScheduleInput(command.payload).member_uid as number,fixtureScheduleInput(command.payload).title as string,fixtureScheduleInput(command.payload).id as number)]);
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"Projected actual edit"});
    expect(await sourceDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:1,title:"Source held"});
  });
  it("rejects forged identity proofs and normalized name/alias ambiguity without closing source work",async()=>{
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Ｋａｙ！')"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('identity-conflict','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify({participants:[{subject:{kind:"member",memberUid:1}},{subject:{kind:"member",memberUid:90}},{subject:{kind:"entity",entityId:"different-kay"}}]})),
      sourceDb.prepare("INSERT INTO music_entities(id,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('different-kay','person','Distinct original','distinct original','different-kay',1,1)"),
    ]);
    await ready();
    await source.admit(admission("late-identity-collision"));
    await source.commit(plan.id,"late-identity-collision",1,[sourceDb.prepare("UPDATE music_entities SET display_name='Kay',normalized_name='kay' WHERE id='different-kay'")]);
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/identity\/name\/alias/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    await source.admit(admission("forged-identity"));
    const tail=await sourceDb.prepare("SELECT max(seq) n FROM content_transition_journal").first("n");
    await expect(source.commit(plan.id,"forged-identity",1,[sourceDb.prepare("UPDATE schedules SET title='should rollback'"),sourceDb.prepare("UPDATE content_transition_identity_proofs SET normalized_name='forged' WHERE member_uid=90")])).rejects.toThrow(/internal_proof|binding_immutable/);
    expect(await sourceDb.prepare("SELECT max(seq) n FROM content_transition_journal").first("n")).toBe(tail);
    expect(await sourceDb.prepare("SELECT normalized_name FROM content_transition_identity_proofs WHERE member_uid=90").first("normalized_name")).toBe("kay");
    await source.admit(admission("resolve-name"));
    await source.commit(plan.id,"resolve-name",1,[sourceDb.prepare("UPDATE music_entities SET display_name='Distinct person',normalized_name='distinct person' WHERE id='different-kay'"),sourceDb.prepare("INSERT INTO music_entity_aliases(entity_id,alias,normalized_alias) VALUES('different-kay','Kay!','kay')")]);
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/identity\/name\/alias/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    await source.admit(admission("resolve-alias"));
    await source.commit(plan.id,"resolve-alias",1,[sourceDb.prepare("DELETE FROM music_entity_aliases WHERE entity_id='different-kay'")]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_identity_conflicts WHERE reason='ambiguous historical alias'").first<number>("n")).toBeGreaterThan(0);
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/normalized external name collision/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/immutable identity.*commit_seq.*row_key/);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("after-immutable-conflict"));
    await source.commit(plan.id,"after-immutable-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
  });
  it("binds external member persona to sealed facts across canonical entity appearance and deletion",async()=>{
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Ｋａｙ！')"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('persona-candidate','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify({participants:[{subject:{kind:"member",memberUid:1}},{subject:{kind:"member",memberUid:90}}]})),
    ]);
    await ready();
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/identity|manifest/);
    await source.validateIdentityProjection(plan.id);
    await installTail();
    const projected=JSON.parse((await targetDb.prepare("SELECT review_input_json FROM music_ingestion_candidates WHERE id='persona-candidate'").first<string>("review_input_json"))!);
    const entityId=projected.participants[1].subject.entityId;
    expect(entityId).toMatch(/^external-[a-f0-9]{64}$/);
    expect(await targetDb.prepare("SELECT member_uid,display_name,normalized_name FROM music_entities WHERE id=?").bind(entityId).first()).toEqual({member_uid:null,display_name:"Ｋａｙ！",normalized_name:"kay"});
    await source.admit(admission("canonical-appears"));
    await source.commit(plan.id,"canonical-appears",1,[sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('later-canonical',90,'person','Canonical Kay','canonical kay','later-canonical',1,1)"),sourceDb.prepare("INSERT INTO music_entity_aliases(entity_id,alias,normalized_alias) VALUES('later-canonical','Kay alias','kay alias')")]);
    await installTail();
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Canonical Kay");
    expect(await targetDb.prepare("SELECT entity_id FROM music_entity_aliases WHERE normalized_alias='kay alias'").first("entity_id")).toBe(entityId);
    await source.admit(admission("canonical-deleted"));
    await source.commit(plan.id,"canonical-deleted",1,[sourceDb.prepare("DELETE FROM music_entities WHERE id='later-canonical'")]);
    await installTail();
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Ｋａｙ！");
    expect(await targetDb.prepare("SELECT count(*) n FROM music_entity_aliases WHERE entity_id=?").bind(entityId).first("n")).toBe(0);
    await source.admit(admission("persona-change"));
    await source.commit(plan.id,"persona-change",1,[sourceDb.prepare("UPDATE members SET name='Kay current' WHERE uid=90")]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/identity|manifest/);
    await source.admit(admission("source-still-writable"));
    await source.commit(plan.id,"source-still-writable",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
    await source.validateIdentityProjection(plan.id);
    const identityCost=await sourceDb.prepare("SELECT * FROM content_transition_identity_conflicts WHERE transition_id=?").bind(plan.id).all();
    expect(identityCost.results).toEqual([]);
    console.info("actual identity history validation",JSON.stringify(identityCost.meta));
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(3);
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Kay current");
  });
  it("keeps immutable invalid JSON history fenced from handoff after current source work is corrected", async () => {
    const known={participants:[{subject:{kind:"member",memberUid:1},participantRole:"vocal",creditOrder:0,creditNameSnapshot:"Bing"}]};
    const unknown={...known,futureExecutionPayload:{actor:"private"}};
    await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('unknown-json','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify(unknown)).run();
    await expect(source.prepare(plan)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await expect(capturing()).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(known)).run();
    await ready();
    await source.admit(admission("missing-member-reference"));
    await source.commit(plan.id,"missing-member-reference",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify({participants:[...known.participants,{subject:{kind:"member",memberUid:999},participantRole:"vocal",creditOrder:1,creditNameSnapshot:"Unknown"}]}))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("unknown-reference"));
    await source.commit(plan.id,"unknown-reference",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify({...known,song:{kind:"existing",songId:"missing-song"}}))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("new-json"));
    await source.commit(plan.id,"new-json",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(unknown))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("resolve-json"));
    await source.commit(plan.id,"resolve-json",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(known))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/immutable JSON.*commit_seq.*unknown-json/);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("source-after-json-conflict"));
    await source.commit(plan.id,"source-after-json-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
  });
  it("prepares an empty new target and materializes only its three approved owned member identities", async () => {
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(0);
    await target.prepare(plan);
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect((await targetDb.prepare("SELECT uid,code FROM members ORDER BY uid").all()).results).toEqual(plan.members.map(({code,targetUid})=>({uid:targetUid,code})));
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baseline_rows WHERE row_table='members' AND installed=1").first("n")).toBe(3);
    await target.prepare(plan);
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(3);
  });
  it("rejects a pre-existing target roster instead of adopting it as identity bootstrap", async () => {
    await targetDb.prepare("DELETE FROM content_transitions").run();
    await targetDb.prepare("INSERT INTO members(uid,code,name) VALUES(1,'bing_hayu','Unowned')").run();
    await expect(target.prepare(plan)).rejects.toThrow(/unowned|roster/);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transitions").first("n")).toBe(0);
  });
  it("captures known JSON dependencies and selected X handles without requiring a derived fact", async () => {
    const review={song:{kind:"existing",songId:"json-song"},participants:[{subject:{kind:"member",memberUid:1},participantRole:"vocal",creditOrder:0,creditNameSnapshot:"Bing"},{subject:{kind:"entity",entityId:"json-entity"},participantRole:"vocal",creditOrder:1,creditNameSnapshot:"External"}]};
    await sourceDb.batch([
      sourceDb.prepare("UPDATE members SET url_twitter='https://www.x.com/Hayu?lang=ko' WHERE uid=1"),
      sourceDb.prepare("UPDATE members SET url_twitter='@Lili' WHERE uid=2"),
      sourceDb.prepare("INSERT INTO music_entities(id,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('json-entity','person','External','external','json-entity',1,1),('actor-private-entity','person','Actor private entity','actor private entity','actor-private-entity',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('json-song','json-song','JSON Song','json song','json-song',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('json-candidate','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify(review)),
      sourceDb.prepare("INSERT INTO music_catalog_events(id,aggregate_type,aggregate_id,event_type,actor_kind,actor_user_id,detail_json,created_at) VALUES('private-json-event','song','json-song','song.updated','admin','private-scalar',?,1)").bind(JSON.stringify({songId:"json-song",actorUserId:{privateValue:"private-nested",entityId:"actor-private-entity"}})),
      sourceDb.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('held-post','hayu','hayu',?,'2026-10-14',1)").bind(JSON.stringify({id:"held-post",text:"Held without fact",username:"hayu"})),
      sourceDb.prepare("INSERT INTO x_post_sources(handle,last_checked_at,updated_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id,next_check_at) VALUES('hayu',1,1,'page','base','newest',123),('lili',1,1,'next','other-base','other-newest',456)"),
    ]);
    await ready();
    const journal=await source.readJournal(plan.id);
    expect(journal.some(row=>row.table==="music_songs" && row.row_key==='["json-song"]')).toBe(true);
    expect(journal.some(row=>row.table==="music_entities" && row.row_key==='["json-entity"]')).toBe(true);
    expect(journal.filter(row=>row.table==="x_post_sources")).toHaveLength(2);
    expect(journal.some(row=>row.table==="x_posts")).toBe(true);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT sync_pagination_token,sync_base_post_id,sync_newest_post_id,next_check_at FROM x_post_sources WHERE handle='hayu'").first()).toEqual({sync_pagination_token:"page",sync_base_post_id:"base",sync_newest_post_id:"newest",next_check_at:123});
    expect(await targetDb.prepare("SELECT title FROM music_songs WHERE id='json-song'").first("title")).toBe("JSON Song");
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='json-entity'").first("display_name")).toBe("External");
    expect(await targetDb.prepare("SELECT id FROM music_entities WHERE id='actor-private-entity'").first()).toBeNull();
    expect(JSON.stringify((await targetDb.prepare("SELECT record_json FROM content_historical_records").all()).results)).not.toContain("private-nested");
    const validation=await sourceDb.prepare("SELECT count(*) n FROM content_transition_invalid_json WHERE transition_id=?").bind(plan.id).all();
    expect(validation.results).toEqual([{n:0}]);
    console.info("actual selected JSON validation",JSON.stringify(validation.meta));
  });
  it("materializes an encoded baseline row above 1.5MB within the documented D1 row bound", async () => {
    const title="a".repeat(1_700_000);
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14',?,'방송')").bind(title).run();
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT length(title) n FROM schedules WHERE id=1").first("n")).toBe(title.length);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baselines WHERE receipt_json IS NOT NULL").first("n")).toBe(1);
  },30000);
  it("archives only source-local access and rejects a mixed business write under an archive permit", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','original','방송')").run();
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    const journal=await source.readJournal(plan.id);
    await expect(sourceDb.prepare("UPDATE schedules SET content_access='admin_archive' WHERE id=1").run()).rejects.toThrow(/archive_control_only/);
    await expect(sourceDb.batch([
      sourceDb.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES('move','mixed-archive-probe')"),
      sourceDb.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,'move','mixed-archive-probe',1,'archive',seq FROM content_transition_commits WHERE operation_id='mixed-archive-probe'"),
      sourceDb.prepare("UPDATE schedules SET content_access='admin_archive',title='forbidden mixed edit' WHERE id=1"),
    ])).rejects.toThrow(/archive_control_only/);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    const receipt=await source.archiveSource(plan.id);
    expect(receipt.archivedRoots).toBe(4);
    expect(await sourceDb.prepare("SELECT title,content_access FROM schedules WHERE id=1").first()).toEqual({title:"original",content_access:"admin_archive"});
    expect(await targetDb.prepare("SELECT title,content_access FROM schedules WHERE id=1").first()).toEqual({title:"original",content_access:"normal"});
    expect(await source.readJournal(plan.id)).toEqual(journal);
    await expect(sourceDb.prepare("UPDATE schedules SET title='late' WHERE id=1").run()).rejects.toThrow(/source_root_fenced/);
  });
  it("rejects an identical unowned target collision and rolls back a grouped 60-row delta", async () => {
    await capturing();
    await source.admit(admission("collision-bulk"));
    await source.commit(plan.id,"collision-bulk",1,[sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','collision-'||x,'방송' FROM n")]);
    const existing=(await sourceDb.prepare("SELECT * FROM schedules WHERE id=60").first<Record<string,string|number|null>>())!;
    const columns=Object.keys(existing);
    await targetDb.prepare("DELETE FROM content_transitions").run(); // Preexisting unowned collision, before target preparation.
    await targetDb.prepare(`INSERT INTO schedules(${columns.map(column=>`"${column}"`).join(",")}) VALUES(${columns.map(()=>"?").join(",")})`).bind(...Object.values(existing)).run();
    await target.prepare(plan);await installInactiveBaseline();
    await source.acknowledgeIngress(await target.openIngress(plan.id,"collision-ingress",1000),now);
    await target.installFence(await source.freeze(plan.id,now));
    await expect(installTail()).rejects.toThrow();
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(1);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_replay").first("n")).toBe(0);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_materialized_rows WHERE row_table='schedules'").first("n")).toBe(0);
  });
  it("refuses unresolved manifest rows before protection and atomically at the final fence", async () => {
    await sourceDb.prepare("INSERT INTO ddays(id,title,date,type) VALUES(900,'Unclassified','2026-10-14','event')").run();
    await expect(capturing()).rejects.toThrow(/manifest/i);
    expect((await source.readTransition(plan.id)).phase).toBe("prepared");
    await sourceDb.prepare("DELETE FROM ddays WHERE id=900").run();
    const oldReadiness=await ready();
    const header=await source.describeBaseline(plan.id);
    const page=await source.exportBaselinePage(header,0);
    await target.stageBaselinePage(page);
    const stagedBefore=(await targetDb.prepare("SELECT ordinal,row_digest,record_json FROM content_transition_baseline_rows ORDER BY ordinal").all()).results;
    await sourceDb.prepare("INSERT INTO ddays(id,title,date,type) VALUES(900,'Unclassified','2026-10-14','event')").run();
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("still-active"));
    await source.commit(plan.id,"still-active",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    const parent={revision:0,digest:plan.manifestDigest},additions=[{table:"ddays",key:"[900]",disposition:"include" as const,reason:"Approved selected anniversary"}];
    const protection={receiptId:"protection-v2",protocol:1,manifestDigest:"approved-v2"};
    const revision=await source.appendClassifications(plan.id,parent,additions,"approved-v2",protection);
    expect(await source.appendClassifications(plan.id,parent,additions,"approved-v2",protection)).toEqual(revision);
    await expect(source.appendClassifications(plan.id,parent,additions,"conflict",protection)).rejects.toThrow(/conflict/i);
    await expect(source.acknowledgeIngress(oldReadiness,now)).rejects.toThrow(/identity/);
    await target.acceptManifestRevision(revision);
    await target.acceptManifestRevision(revision);
    await expect(target.acceptManifestRevision({...revision,plan:{...revision.plan,manifestDigest:"conflict"}})).rejects.toThrow(/conflict/i);
    await target.stageBaselinePage(page);
    expect((await targetDb.prepare("SELECT ordinal,row_digest,record_json FROM content_transition_baseline_rows ORDER BY ordinal").all()).results).toEqual(stagedBefore);
    expect(await targetDb.prepare("SELECT manifest_digest FROM content_transition_baselines").first("manifest_digest")).toBe(plan.manifestDigest);
    await source.acknowledgeIngress(await target.openIngress(plan.id,"ingress-v2",1000),now);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT title FROM ddays WHERE id=900").first("title")).toBe("Unclassified");
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=1").first("id")).toBe(1);
    await expect(source.appendClassifications(plan.id,parent,additions,"approved-v2",protection)).rejects.toThrow(/frozen/);
  });
  it("replays more than 45 ordinary changed rows in one grouped atomic business commit", async () => {
    await ready();
    await source.admit(admission("bulk"));
    const sourceCost=await source.commit(plan.id,"bulk",1,[sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','delta-'||x,'방송' FROM n")]);
    const fence=await source.freeze(plan.id,now);
    await target.installFence(fence);
    const targetCosts=await installTail();
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules WHERE title LIKE 'delta-%'").first("n")).toBe(60);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_replay").first("n")).toBe(1);
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    expect(targetCosts[0]?.statements).toBe(11);
    console.info("actual grouped ordinary delta",JSON.stringify({rows:60,sourceCost,targetCosts}));
  });
  it("resumes a bounded baseline larger than 45 rows and rejects partial stage or digest drift", async () => {
    await sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','row-'||x,'방송' FROM n").run();
    const sourceCost=await capturing();
    const header=await source.describeBaseline(plan.id);
    expect(header.rows).toBeGreaterThan(45);
    await target.beginBaseline(header);
    const first=await source.exportBaselinePage(header,0);
    const outOfOrder=await source.exportBaselinePage(header,first.next);
    await expect(target.stageBaselinePage(outOfOrder)).rejects.toThrow(/conflict/);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baseline_rows").first("n")).toBe(0);
    await target.stageBaselinePage(first);
    await target.stageBaselinePage(first);
    await expect(target.finalizeBaseline(plan.id)).rejects.toThrow(/incomplete/);
    await expect(target.installCommittedState(plan.id)).rejects.toThrow(/fence/);
    await expect(target.openIngress(plan.id,"partial-baseline",1000)).rejects.toThrow(/baseline/);
    const resumed=new D1TransitionRepository(targetDb,"luvdia","target-db","luvdia-bucket",targetAvailability, catalogImportProjection);
    for(let cursor=first.next;cursor.ordinal<header.rows;) {
      const page=await source.exportBaselinePage(header,cursor);
      await resumed.stageBaselinePage(page);
      cursor=page.next;
    }
    await expect(resumed.beginBaseline({...header,digest:"drift"})).rejects.toThrow(/conflict/);
    let batches=0;
    while(await resumed.materializeBaselinePage(plan.id)) batches++;
    expect(batches).toBeGreaterThan(1);
    const receipt=await resumed.finalizeBaseline(plan.id);
    await source.acknowledgeIngress(await resumed.openIngress(plan.id,"baseline-ingress",1000),now);
    await resumed.installFence(await source.freeze(plan.id,now));
    expect(receipt.rows).toBe(header.rows);
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(60);
    await transferStaticProof();
    await resumed.installCommittedState(plan.id);
    await resumed.activate(plan.id);
    console.info("actual selected baseline",JSON.stringify({rows:header.rows,batches,receipt,sourceCost}));
  });
  it("opens ownership only after actual projected target materialization and durable replay readback", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','committed source','방송')").run();
    await ready();
    await source.admit(admission("after-inactive-baseline"));
    await source.commit(plan.id,"after-inactive-baseline",1,[sourceDb.prepare("UPDATE schedules SET title='committed source tail' WHERE id=1")]);
    const fence=await source.freeze(plan.id,now);
    await target.installFence(fence);
    await expect(target.installCommittedState(plan.id)).rejects.toThrow(/tail/);
    for(const envelope of await source.exportFrozenOperations(plan.id)) await target.receiveOperation(envelope);
    const commits=await source.exportProjectedCommits(plan.id,0);
    await expect(target.installProjectedCommit({...commits[0]})).rejects.toThrow(/projection/);
    await installTail();
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("committed source tail");
    await target.installCommittedState(plan.id);
    await target.activate(plan.id);
    expect((await target.readTransition(plan.id)).phase).toBe("target_owned");
  });
  it("preserves non-executing origin, event and AI material through the existing admin list and detail", async () => {
    await targetDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,title,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at) VALUES('candidate','abcdefghijk','needs_input','eligible','Historic candidate',1,2,1000,1,2)").run();
    const context = {sourceSite:"otw" as const,members:[{uid:1,targetUid:1,name:"Bing",externalEntityId:null}]};
    const fixtures = [
      ["music_ingestion_candidate_origins", "origin", {job_id:"old-job",candidate_id:"candidate",discovered_at:2,playlist_position:3}],
      ["music_ingestion_jobs","old-job",{id:"old-job",actor_user_id:"private-actor",status:"completed",created_at:1,completed_at:3}],
      ["music_ingestion_events", "event", {id:"event",job_id:"old-job",candidate_id:"candidate",actor_user_id:"private-actor",event_type:"review_updated",created_at:3,detail_json:JSON.stringify({status:"ready",title:"Original input"})}],
      ["music_ai_review_batches", "batch", {id:"batch",actor:"private-actor",request_key:"private-request",created_at:4,selection_json:JSON.stringify({candidates:[{id:"candidate",version:0}]})}],
      ["music_ai_review_batch_items","batch-item",{id:"batch-item",batch_id:"batch",candidate_id:"candidate",review_id:"review",status:"saved",created_at:4,updated_at:6}],
      ["music_ai_reviews", "review", {id:"review",candidate_id:"candidate",status:"succeeded",created_at:4,updated_at:6,input_json:JSON.stringify({candidateKind:"official_video",members:[{name:"Bing",aliases:[]}]}),result_json:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:"Original result",originalArtists:[{name:"Original artist"}]},participants:[{name:"Bing"}]},warnings:[]}]})}],
      ["music_ai_review_attempts", "private-token", {token:"private-token",review_id:"review",started_at:4,finished_at:6,outcome:"succeeded",usage_json:'{"inputTokens":100}'}],
    ] as const;
    for (const [table,id,value] of fixtures) {
      const record = await projectCapturedRecord(table,JSON.stringify([id]),value,context);
      await targetDb.batch(historicalStatements(targetDb,record!,"candidate_id" in value?[{table:"music_ingestion_candidates",key:'["candidate"]'}]:[]));
    }
    const repository=new D1IngestionRepository(targetDb);
    const detail=await repository.readReviewCandidate(null,"candidate");
    const page=await repository.listReviewItems({status:"pending",source:"playlist"});
    expect(detail?.historicalMaterials).toHaveLength(7);
    expect(page.items[0]?.candidate?.historicalMaterials).toEqual(detail?.historicalMaterials);
    expect(page.items[0]?.sources).toContain("playlist");
    const json=JSON.stringify(detail?.historicalMaterials);
    for(const text of ["Original input","Original result","Original artist","succeeded","Bing"]) expect(json).toContain(text);
    for(const text of ["private-actor","private-token","private-request","inputTokens"]) expect(json).not.toContain(text);
    for(const table of ["music_ingestion_jobs","music_ingestion_events","music_ai_review_batches","music_ai_review_attempts"]) expect(await targetDb.prepare(`SELECT count(*) AS n FROM ${table}`).first("n")).toBe(0);
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    const deleted=await projectCapturedRecord("music_catalog_events",'["deleted"]',{id:"deleted",aggregate_type:"review_candidate",aggregate_id:"candidate",event_type:"review_item.deleted",actor_kind:"admin",actor_user_id:"private-actor",created_at:7,detail_json:"{}"},context);
    await targetDb.batch(historicalStatements(targetDb,deleted!,[{table:"music_ingestion_candidates",key:'["candidate"]'}]));
    expect((await repository.listReviewItems({status:"pending",source:"playlist"})).items).toEqual([]);
    await expect(repository.readReviewCandidate(null,"candidate")).rejects.toThrow(/not found/);
  });
  it("fences selected roots while remaining OTW content can edit shared dependencies after handoff", async () => {
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('shared','shared','Original','original','shared',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1),('other',NULL,'person','Other','other','other',1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('selected','shared','selected','cover','official_video','solo',1,1),('remaining','shared','remaining','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('selected','singer','vocal',0,'Bing'),('remaining','other','vocal',0,'Other')"),
    ]);
    await ready();
    const fence=await source.freeze(plan.id,now);
    const frozen=await source.readJournal(plan.id);
    await sourceDb.batch([
      sourceDb.prepare("UPDATE music_songs SET title='Remaining OTW edit',version=version+1 WHERE id='shared'"),
      sourceDb.prepare("UPDATE music_performances SET internal_note='Remaining owner edit',version=version+1 WHERE id='remaining'"),
      sourceDb.prepare("UPDATE music_performance_participants SET credit_name_snapshot='Corrected other name' WHERE performance_id='remaining'"),
    ]);
    await expect(sourceDb.prepare("UPDATE music_performances SET internal_note='late selected edit' WHERE id='selected'").run()).rejects.toThrow(/source_root_fenced/);
    await expect(sourceDb.prepare("UPDATE music_performance_participants SET credit_name_snapshot='late selected credit' WHERE performance_id='selected'").run()).rejects.toThrow(/source_root_fenced/);
    expect(await source.readJournal(plan.id)).toEqual(frozen);
    expect((await source.freeze(plan.id,now)).boundary).toBe(fence.boundary);
    expect(frozen.find(row=>row.table==='music_songs')?.after_json).toContain('Original');
    expect(await sourceDb.prepare("SELECT title FROM music_songs WHERE id='shared'").first("title")).toBe('Remaining OTW edit');
  });
  it("keeps a value edit independent of unrelated source-row volume", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','initial','방송')").run();
    await capturing();
    await source.admit({ ...admission("small"), expectedVersion: null });
    const small = await source.commit(plan.id,"small",1,[sourceDb.prepare("UPDATE schedules SET title='small' WHERE id=1")]);
    // Unrelated writes remain permitted; this setup also exercises that fence.
    await sourceDb.prepare("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<1000) INSERT INTO schedules(id,member_uid,date,title,status) SELECT 100+n,90,'2026-10-14','unrelated','방송' FROM numbers").run();
    await source.admit({ ...admission("large"), expectedVersion: null });
    const large = await source.commit(plan.id,"large",1,[sourceDb.prepare("UPDATE schedules SET title='large' WHERE id=1")]);
    expect(large?.rowsWritten).toBe(small?.rowsWritten);
    expect(large!.rowsRead).toBeLessThanOrEqual(small!.rowsRead + 10);
    expect(large?.statements).toBe(15);
    console.info("actual canonical D1 capture cost",JSON.stringify({small,large,unrelatedRows:1000}));
  });
  it("captures large selected fan-out as relational rows and keeps later growth atomic", async () => {
    await sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','selected-'||x,'방송' FROM n").run();
    const cost=await capturing();
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='schedules'").first("n")).toBe(1000);
    console.info("actual 1000 selected baseline",JSON.stringify(cost));
    await sourceDb.prepare("DELETE FROM content_transitions").run();
    await source.prepare(plan);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('large-song','large-song','Large','large','large-song',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('large-performance','large-song','large-performance','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('large-performance','singer','vocal',0,'Bing')"),
      sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO music_song_aliases(song_id,alias,normalized_alias) SELECT 'large-song',printf('%02100d',x),printf('%02100d',x) FROM n"),
    ]);
    const fanout=await capturing();
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='music_song_aliases'").first("n")).toBe(1000);
    await source.admit({...admission("fanout-growth"),expectedVersion:null});
    const growth=await source.commit(plan.id,"fanout-growth",1,[sourceDb.prepare("INSERT INTO music_song_aliases(song_id,alias,normalized_alias) VALUES('large-song','new alias','new alias')")]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='music_song_aliases'").first("n")).toBe(1001);
    const journal=await source.readJournal(plan.id);
    await source.admit({...admission("fanout-failed"),expectedVersion:null});
    await expect(source.commit(plan.id,"fanout-failed",1,[sourceDb.prepare("DELETE FROM music_song_aliases WHERE song_id='large-song'"),sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','duplicate','방송')")])).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT count(*) n FROM music_song_aliases WHERE song_id='large-song'").first("n")).toBe(1001);
    expect(await source.readJournal(plan.id)).toEqual(journal);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    console.info("actual relational fanout capture",JSON.stringify({fanout,growth,aliasKeyBytes:2100,aliasCount:1001}));
  },30000);
  it("captures canonical mixed credits, newly referenced unchanged parents, key moves, scope exit and cascades at committed boundaries", async () => {
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Other')"),
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1),('other',90,'person','Other','other','other',1,1),('external',NULL,'person','External','external','external',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('song','song','Song','song','song',0,1,1),('unchanged','unchanged','Unchanged parent','unchanged','unchanged',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('mixed','song','mixed','cover','official_video','external_collab',1,1),('unrelated','song','unrelated','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('mixed','singer','vocal',0,'Bing'),('mixed','other','vocal',1,'Other'),('unrelated','other','vocal',0,'Other')"),
    ]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_journal").first("count(*)")).toBe(0);
    await capturing();
    const baseline = await source.readJournal(plan.id);
    expect(baseline.some(row => row.table==='music_performance_participants' && row.row_key==='["mixed","other"]')).toBe(true);
    expect(baseline.some(row => row.table==='music_performances' && row.row_key==='["unrelated"]')).toBe(false);
    const apply = async (id: string, sql: string[]) => {
      await source.admit({ ...admission(id), expectedVersion: null });
      await source.commit(plan.id,id,1,sql.map(statement => sourceDb.prepare(statement)));
    };
    await apply("move",["UPDATE music_performances SET song_id='unchanged' WHERE id='mixed'", "UPDATE music_performance_participants SET entity_id='external',credit_name_snapshot='External' WHERE performance_id='mixed' AND entity_id='other'"]);
    const delta = (await source.readJournal(plan.id)).filter(row => row.seq > (baseline.at(-1)?.seq ?? 0));
    expect(new Set(delta.map(row => row.commit_seq)).size).toBe(1);
    expect(delta.find(row => row.table==='music_songs' && row.row_key==='["unchanged"]')?.after_json).toContain('Unchanged parent');
    expect(delta.find(row => row.table==='music_performance_participants' && row.row_key==='["mixed","other"]')?.after_json).toBeNull();
    expect(delta.find(row => row.table==='music_performance_participants' && row.row_key==='["mixed","external"]')?.after_json).toContain('External');
    await apply("leave",["DELETE FROM music_performance_participants WHERE performance_id='mixed' AND entity_id='singer'"]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_images WHERE row_table='music_performances'").first("count(*)")).toBe(0);
    await apply("enter",["INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('mixed','singer','vocal',0,'Bing')"]);
    await apply("cascade",["DELETE FROM music_performances WHERE id='mixed'"]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_images WHERE row_table='music_performance_participants'").first("count(*)")).toBe(0);
    expect(await sourceDb.prepare("SELECT id FROM music_performances WHERE id='unrelated'").first("id")).toBe('unrelated');
    await installInactiveBaseline();
    await source.acknowledgeIngress(await target.openIngress(plan.id,"mixed-ready",1000),now);
    await source.validateIdentityProjection(plan.id);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT id FROM music_performances WHERE id='mixed'").first()).toBeNull();
    expect(await targetDb.prepare("SELECT id FROM music_performances WHERE id='unrelated'").first()).toBeNull();
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("rejects missing, stale and wrong readiness without stopping source writes", async () => {
    await capturing();
    await expect(source.freeze(plan.id, now)).rejects.toThrow();
    await installInactiveBaseline();
    const receipt = await target.openIngress(plan.id, "ingress", 101);
    await expect(source.acknowledgeIngress({ ...receipt, generation: 3 }, now)).rejects.toThrow();
    await expect(source.acknowledgeIngress(receipt, 102)).rejects.toThrow();
    await source.admit(admission("save"));
    await source.commit(plan.id, "save", 1, [sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).not.toBeNull();
  });


  it("maintenance_native_admission leaves actual schedule and checkpoint receipt untouched until activation",async()=>{
    const {routeSource,routeTarget}=await routeControls([],true),fixture=await pendingAdminFixture('luvdia');fixture.runtime.CONTENT_TRANSITION_PEER=undefined;
    const payload={member_uid:1,date:'2026-10-15',title:'New owner schedule',status:'휴방'},key='maintenance-original-save';
    const request=async(value=payload,actor:string|null='ordinary-user')=>handleWorkerFetch(new Request('http://localhost:5174/api/schedules/save',{method:'POST',headers:{...(actor?{Authorization:`Bearer ${await fixture.token(actor)}`} : {}),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(value)}),fixture.runtime);
    const due=(await targetDb.prepare("SELECT checkpoints_json FROM content_transitions WHERE id='move'").all()).results;
    try {
      expect((await request()).status).toBe(503);expect(await targetDb.prepare('SELECT count(*) n FROM content_transition_operations').first('n')).toBe(0);
      await routeTarget.installFence(await routeSource.freeze(plan.id,Date.now()));expect((await request()).status).toBe(503);
      expect((await targetDb.prepare("SELECT checkpoints_json FROM content_transitions WHERE id='move'").all()).results).toEqual(due);expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(0);
      await transferStaticProof();await routeTarget.installCommittedState(plan.id);await routeTarget.activate(plan.id);
      expect((await request(payload,null)).status).toBe(403);
      const response=await request();expect(response.status,await response.clone().text()).toBe(200);const result=await response.json();
      expect(await (await request()).json()).toEqual(result);expect((await request({...payload,title:'Conflicting key payload'})).status).toBe(409);
      expect(await targetDb.prepare('SELECT count(*) n FROM schedules').first('n')).toBe(1);expect(await targetDb.prepare('SELECT title FROM schedules').first('title')).toBe(payload.title);
      expect((await targetDb.prepare("SELECT checkpoints_json FROM content_transitions WHERE id='move'").all()).results).toEqual(due);expect(fixture.send).not.toHaveBeenCalled();
    }finally{fixture.close();}
  });

  it("transfers unknown provider/R2 intent and commits unrelated new work without outcome acknowledgements", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id, "old", { identity: "provider-attempt", status: "unknown" });
    await source.recordFileIntent(plan.id, "old", { intentId: "put", logicalKey: "profile.webp", versionKey: "versions/put.webp", previousVersion: null, hash: null, size: null, status: "unknown" });
    await transferAndActivate();
    await target.admit(admission("new"));
    await target.commit(plan.id, "new", 2, [targetDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(2,2,'2026-10-14','방송')")]);
    expect((await target.readOperation(plan.id, "old"))?.attempt?.status).toBe("unknown");
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=2").first()).not.toBeNull();
    await expect(target.complete(plan.id)).rejects.toThrow();
  });
  it("reconciles immutable late evidence under the original attempt after a committed business outcome", async () => {
    await ready();
    await source.admit(admission("old-effect"));
    await source.recordAttempt(plan.id,"old-effect",{identity:"original-attempt",status:"unknown"});
    await source.commit(plan.id,"old-effect",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    await transferAndActivate();
    await expect(target.readOutcomeReceipt(plan.id,"operation","old-effect")).rejects.toThrow(/reconciled/);
    const evidence={evidenceId:"late-result",attemptIdentity:"original-attempt",result:"completed" as const,observedAt:now+1};
    await source.recordEvidence(plan.id,"old-effect",evidence);
    await target.recordEvidence(plan.id,"old-effect",evidence);
    await target.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId);
    await target.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId);
    const receipt=await target.readOutcomeReceipt(plan.id,"operation","old-effect");
    await target.confirmOutcomeAcknowledgement(await source.acknowledgeOutcome(receipt));
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await target.complete(plan.id);
    expect((await target.readOperation(plan.id,"old-effect"))?.outcome).toMatchObject({outcome:"committed",sideEffectReconciled:true});
    await expect(source.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId)).rejects.toThrow(/owner/);
  });
  it("keeps file observation separate from reference commit and atomically records the final file outcome", async () => {
    await ready();
    await source.admit(admission("file-save"));
    await source.recordFileIntent(plan.id,"file-save",{intentId:"file",logicalKey:"logical.webp",versionKey:"immutable/file.webp",previousVersion:null,hash:null,size:null,status:"unknown"});
    await transferAndActivate();
    const envelope=await source.exportFileIntent(plan.id,"file");
    const reference=[{intentId:"file",evidenceId:"put-observed"}];
    const write=targetDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','reference committed','방송')");
    await expect(target.commit(plan.id,"file-save",2,[write],reference)).rejects.toThrow();
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    const observation={transitionId:plan.id,intentId:"file",generation:1,site:"otw" as const,resource:"otw-bucket",objectVersion:"source-upload-random-version",copiedFromEvidenceId:null,evidenceId:"put-observed",versionKey:envelope.versionKey,result:"present" as const,hash:"a".repeat(64),size:24,observedAt:now+1};
    await expect(target.recordFileObservation(plan.id,"file",{...observation,generation:2})).rejects.toThrow(/identity/);
    await expect(target.recordFileObservation(plan.id,"file",{...observation,versionKey:"wrong-version"})).rejects.toThrow(/identity/);
    await source.recordFileObservation(plan.id,"file",observation);
    await target.recordFileObservation(plan.id,"file",observation);
    await expect(target.commit(plan.id,"file-save",2,[write],reference)).rejects.toThrow();
    const targetObservation={...observation,evidenceId:"target-observed",site:"luvdia" as const,resource:"luvdia-bucket",objectVersion:"different-target-upload-version",copiedFromEvidenceId:observation.evidenceId};
    await expect(target.recordFileObservation(plan.id,"file",{...targetObservation,size:25})).rejects.toThrow(/byte identity/);
    await target.recordFileObservation(plan.id,"file",targetObservation);
    reference[0].evidenceId="target-observed";
    await expect(target.recordFileObservation(plan.id,"file",{...observation,size:25})).rejects.toThrow(/immutable/);
    await expect(target.readOutcomeReceipt(plan.id,"file","file")).rejects.toThrow(/terminal/);
    await expect(target.commit(plan.id,"file-save",2,[write,write],reference)).rejects.toThrow();
    expect((await target.exportFileIntent(plan.id,"file")).outcome).toBeNull();
    await target.commit(plan.id,"file-save",2,[write],reference);
    await target.receiveFileIntent(envelope);
    for(const [kind,id] of [["operation","file-save"],["file","file"]] as const) await target.confirmOutcomeAcknowledgement(await source.acknowledgeOutcome(await target.readOutcomeReceipt(plan.id,kind,id)));
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await target.complete(plan.id);
    expect((await target.exportFileIntent(plan.id,"file")).outcome?.outcome).toBe("committed");
  });

  it("serializes the final-write/fence race and rejects late source business writes", async () => {
    await ready();
    await source.admit(admission("racer"));
    const raced = await Promise.allSettled([
      source.commit(plan.id, "racer", 1, [sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]),
      source.freeze(plan.id, now),
    ]);
    const fenceResult = raced[1];
    expect(fenceResult.status).toBe("fulfilled");
    const journal = await source.readJournal(plan.id);
    if (raced[0].status === "fulfilled") expect(journal.some(row => row.table === "schedules")).toBe(true);
    else expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    await expect(source.commit(plan.id, "racer", 1, [sourceDb.prepare("UPDATE schedules SET title='late' WHERE id=1")])).rejects.toThrow();
  });
  it("keeps late source side effects as immutable evidence without changing frozen business or attempt state", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id,"old",{identity:"provider-identity",status:"unknown"});
    await source.freeze(plan.id,now);
    const journal=await source.readJournal(plan.id);
    const evidence={evidenceId:"provider-result",attemptIdentity:"provider-identity",result:"completed" as const,observedAt:102};
    await source.recordEvidence(plan.id,"old",evidence);
    await source.recordEvidence(plan.id,"old",evidence);
    await expect(source.recordEvidence(plan.id,"old",{...evidence,result:"failed"})).rejects.toThrow(/immutable/);
    await expect(source.recordAttempt(plan.id,"old",{identity:"provider-identity",status:"completed"})).rejects.toThrow(/owner/);
    expect((await source.readOperation(plan.id,"old"))?.attempt?.status).toBe("unknown");
    expect(await source.readJournal(plan.id)).toEqual(journal);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_evidence").first("n")).toBe(1);
  });

  it("deduplicates transfer after lost ACK and rejects hash changes without inventing an outcome", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id, "old", { identity: "provider-attempt", status: "unknown" });
    const envelope = await source.exportOperation(plan.id, "old");
    const first = await target.receiveOperation(envelope);
    expect(await target.receiveOperation(envelope)).toEqual(first);
    await expect(target.receiveOperation({ ...envelope, payloadHash: "different" })).rejects.toThrow();
    expect((await target.readOperation(plan.id, "old"))?.outcome).toBeNull();
    expect((await target.readOperation(plan.id, "old"))?.attempt?.identity).toBe("provider-attempt");
    await expect(target.receiveOperation({...envelope,validation:{...envelope.validation,actorUserId:"private"} as typeof envelope.validation})).rejects.toThrow(/allowlist/);
    await expect(target.receiveOperation({...envelope,attempt:{...envelope.attempt!,token:"private"} as NonNullable<typeof envelope.attempt>})).rejects.toThrow(/allowlist/);
    await expect(target.receiveOperation({...envelope,subject:{table:"members",key:"[1]"}})).rejects.toThrow(/subject/);
    await expect(target.receiveOperation({...envelope,codec:{id:"unknown",version:1}})).rejects.toThrow(/registered/);
    await expect(target.receiveOperation({...envelope,payload:{...envelope.payload,actorUserId:"source-private-actor"}})).rejects.toThrow(/allowlist/);
  });

  it("resumes durable fence/install/ownership crash points without reopening source", async () => {
    await ready();
    const fence = await source.freeze(plan.id, now);
    expect(await source.freeze(plan.id, now)).toEqual(fence);
    await target.admit(admission("after-source-crash"));
    await target.installFence(fence);
    await target.installFence(fence);
    await installTail();
  await target.installCommittedState(plan.id);
    await target.activate(plan.id);
    await target.activate(plan.id);
    await expect(source.admit(admission("stale"))).rejects.toThrow();
    await expect(source.beginReplay(plan.id)).rejects.toThrow();
  });

  it("preserves the exact checkpoint receipt in the frozen source snapshot", async () => {
    await ready();
    const checkpoint = { sourceKey: "x:hayu", revision: 9, state: { watermark: "101", pageToken: "next", baseId: "97", newestId: "103", nextDue: 91, candidateId: "candidate-9", intervalMinutes: 60 } };
    await source.saveCheckpoint(plan.id, checkpoint);
    const fence = await source.freeze(plan.id, now);
    expect(fence.checkpoints).toEqual([checkpoint]);
    await target.installFence(fence);
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(90,90,'2026-10-14','방송')").run();
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=90").first()).not.toBeNull();
  });

  it("completes the frozen finite set while new target backlog remains", async () => {
    await ready();
    await source.admit(admission("old"));
    await transferAndActivate();
    await target.admit(admission("ongoing-new"));
    await expect(target.complete(plan.id)).rejects.toThrow();
    await target.recordOutcome(plan.id, "old", { outcome: "conflicted", sideEffectReconciled: true, detail: "version conflict" });
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await expect(target.complete(plan.id)).rejects.toThrow();
    const receipt=await target.readOutcomeReceipt(plan.id,"operation","old");
    const acknowledgement=await source.acknowledgeOutcome(receipt);
    expect(await source.acknowledgeOutcome(receipt)).toEqual(acknowledgement);
    await target.confirmOutcomeAcknowledgement(acknowledgement);
    await target.complete(plan.id);
    expect((await target.readOperation(plan.id, "ongoing-new"))?.outcome).toBeNull();
    expect((await target.readTransition(plan.id)).phase).toBe("complete");
  });

  it("rolls back a failed business batch with its capture, permit and outcome", async () => {
    await capturing();
    await source.admit(admission("save"));
    const before = await source.readJournal(plan.id);
    await expect(source.commit(plan.id, "save", 1, [
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')"),
    ])).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    expect(await source.readJournal(plan.id)).toEqual(before);
    expect((await source.readOperation(plan.id, "save"))?.outcome).toBeNull();
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_permits").first("count(*)")).toBe(0);
  });
});
