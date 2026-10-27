import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { meterD1 } from "../../../test-support/d1-meter";
import { readXReferenceHealthCounts } from "./x-reference-health-read-model";

const db=env.otw_db;
beforeEach(async()=>{
  await applyD1Migrations(db,(env as Env & {X_REFERENCE_MIGRATIONS:D1Migration[]}).X_REFERENCE_MIGRATIONS);
  await db.prepare("DELETE FROM x_post_references").run();
  await db.prepare("DELETE FROM x_posts").run();
});

it("keeps exact accumulated totals while avoiding repeated reference/post reads",async()=>{
  const size=2000;
  await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?)
    INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
    SELECT 'cost-'||n,'member','member','{}','2020-01-01',1,1 FROM seq`).bind(size).run();
  await db.prepare(`INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,
    author_state,created_at,updated_at) SELECT id,'quote','parent','pending',1,1 FROM x_posts`).run();
  const meter=meterD1(db),health=await readXReferenceHealthCounts(meter.db),cost=meter.summary();
  expect(health).toMatchObject({pendingPosts:size,pendingAuthors:size,terminal:0,errors:0,oldestPendingAt:1,nextAttemptAt:null});
  expect(health.pendingReasons).toEqual([
    {stage:"author",code:null,count:size,nextAttemptAt:null},
    {stage:"post",code:null,count:size,nextAttemptAt:null},
  ]);
  console.log("X_REFERENCE_HEALTH_COST",JSON.stringify({size,...cost}));
  expect(cost.sqlCount).toBe(1);expect(cost.rowsWritten).toBe(0);
  expect(cost.rowsRead).toBeLessThan(size*5);
  await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<10000)
    INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
    SELECT 'unrelated-'||n,'other','other','{}','2019-01-01',1,1 FROM seq`).run();
  const expanded=meterD1(db);
  expect(await readXReferenceHealthCounts(expanded.db)).toEqual(health);
  expect(expanded.summary()).toEqual(cost);
});

it("does not join settled quote history when it contributes no health stage",async()=>{
  const size=2000;
  await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?)
    INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
    SELECT 'settled-'||n,'member','member','{}','2020-01-01',1,1 FROM seq`).bind(size).run();
  await db.prepare(`INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,
    resolution_state,hydrated_at,author_state,created_at,updated_at)
    SELECT id,'quote','parent','hydrated',1,'resolved',1,1 FROM x_posts`).run();
  const meter=meterD1(db),health=await readXReferenceHealthCounts(meter.db),cost=meter.summary();
  expect(health).toMatchObject({pendingPosts:0,pendingAuthors:0,terminal:0,errors:0,oldestPendingAt:null,nextAttemptAt:null,pendingReasons:[]});
  console.log("X_REFERENCE_SETTLED_COST",JSON.stringify({size,...cost}));
  expect(cost.rowsWritten).toBe(0);expect(cost.rowsRead).toBeLessThan(size*2);
});

it("preserves reply previews, separate quote reasons and hidden/deleted exclusions",async()=>{
  const rows=[
    ["reply-preview","reply","local",null,"resolved",null,JSON.stringify({reply:{post:{id:"parent"}}}),null,null],
    ["reply-link","reply","pending",null,"pending","ignored","invalid json",null,null],
    ["reply-terminal","reply","terminal",null,"pending","ignored","{}",null,null],
    ["quote-both","quote","local",null,"pending","x_api_503","{}",null,null],
    ["quote-author","quote","hydrated",1,"pending","preview_disabled","{}",null,null],
    ["hidden","quote","pending",null,"pending","x_api_503","{}",1,null],
    ["removed","quote","pending",null,"pending","x_api_503","{}",null,1],
  ] as const;
  for(const [id,relation,state,hydrated,author,authorError,value,hidden,removed]of rows){
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at,hidden_at,content_removed_at) VALUES(?,'member','member',?,'2020-01-01',1,1,?,?)").bind(id,value,hidden,removed).run();
    await db.prepare(`INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,
      hydrated_at,author_state,author_last_error_code,last_error_code,next_attempt_at,author_next_attempt_at,created_at,updated_at)
      VALUES(?,?,'parent',?,?,?,?, 'preview_budget_exceeded',900,700,100,100)`).bind(id,relation,state,hydrated,author,authorError).run();
  }
  const meter=meterD1(db),health=await readXReferenceHealthCounts(meter.db);
  expect(health).toMatchObject({replyDisplay:{withPreview:1,linkOnly:1,terminal:1},pendingPosts:1,pendingAuthors:2,terminal:1,errors:1,oldestPendingAt:100,nextAttemptAt:700,
    byRelation:[{relation:"reply",pendingPosts:0,pendingAuthors:0,terminal:1},{relation:"quote",pendingPosts:1,pendingAuthors:2,terminal:0}]});
  expect(health.pendingReasons).toEqual(expect.arrayContaining([
    {stage:"post",code:"preview_budget_exceeded",count:1,nextAttemptAt:900},
    {stage:"author",code:"x_api_503",count:1,nextAttemptAt:700},
    {stage:"author",code:"preview_disabled",count:1,nextAttemptAt:700},
  ]));
  expect(meter.summary().rowsWritten).toBe(0);
});
