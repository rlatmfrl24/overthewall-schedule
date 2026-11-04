import { expect, it, vi } from "vitest";
import { noteRssD1Conflict, rssD1RetryHasRoom, trackRssD1Calls } from "./rss-d1-budget";

it("only limits observed RSS conflicts and counts failed, batch, session and exec execution", async()=>{
  const statement={bind:()=>statement,all:vi.fn(async()=>({results:[]}))};
  const source={prepare:()=>statement,batch:vi.fn(async()=>[]),exec:vi.fn(async()=>{throw new Error('failed');}),withSession:()=>({prepare:()=>statement,batch:vi.fn(async()=>[])})};
  const db=trackRssD1Calls(source as unknown as D1Database);
  for(let i=0;i<36;i++)await db.prepare('read').all();
  await db.batch([db.prepare('a'),db.prepare('b')]);
  await expect(db.exec('failed')).rejects.toThrow('failed');
  expect(rssD1RetryHasRoom(db,100)).toBe(true);
  noteRssD1Conflict(db);
  expect(rssD1RetryHasRoom(db,12)).toBe(true);
  await db.withSession().prepare('read').all();
  expect(rssD1RetryHasRoom(db,12)).toBe(false);
});
