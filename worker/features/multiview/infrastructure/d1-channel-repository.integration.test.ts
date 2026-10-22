import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1MultiviewChannelRepository } from "./d1-channel-repository";

const testEnv = env as Env & { MULTIVIEW_MIGRATIONS: D1Migration[]; transition_target_db: D1Database };
const db = testEnv.otw_db;
const otw = new D1MultiviewChannelRepository(db);
const luvdia = new D1MultiviewChannelRepository(testEnv.transition_target_db);
const channel = (n: number) => ({ channelId: n.toString(16).padStart(32, "0"), channelName: `Channel ${n}`, channelImageUrl: null });
beforeEach(async () => {
  expect(testEnv.MULTIVIEW_MIGRATIONS).toHaveLength(1);
  for (const database of [db, testEnv.transition_target_db]) {
    await applyD1Migrations(database, testEnv.MULTIVIEW_MIGRATIONS);
    await database.prepare("DELETE FROM multiview_channels").run();
  }
});
describe("site-owned personal multiview persistence", () => {
  it("reopens persisted channels without exposing another owner or site's data", async () => {
    const saved = await otw.addWithLimit("alice", channel(1));
    expect(await new D1MultiviewChannelRepository(db).list("alice")).toEqual([saved]);
    expect(await otw.list("bob")).toEqual([]);
    expect(await luvdia.list("alice")).toEqual([]);
    await otw.remove("bob", channel(1).channelId);
    expect(await otw.find("alice", channel(1).channelId)).toEqual(saved);
    await otw.remove("alice", channel(1).channelId);
    await otw.remove("alice", channel(1).channelId);
    expect(await otw.list("alice")).toEqual([]);
  });
  it("admits only one of two additions racing for the thirtieth slot", async () => {
    for (let n = 1; n <= 29; n++) await otw.addWithLimit("alice", channel(n));
    const results = await Promise.all([otw.addWithLimit("alice", channel(30)), otw.addWithLimit("alice", channel(31))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await otw.list("alice")).toHaveLength(30);
    expect(await otw.addWithLimit("alice", channel(32))).toBeNull();
    const existing = await otw.find("alice", channel(1).channelId);
    expect(await otw.addWithLimit("alice", { ...channel(1), channelName: "Changed" })).toEqual(existing);
    expect(await otw.list("alice")).toHaveLength(30);
    expect(await otw.addWithLimit("bob", channel(32))).not.toBeNull();
  });
  it("deduplicates concurrent retries and orders ties by channel id", async () => {
    const results = await Promise.all([otw.addWithLimit("alice", channel(1)), otw.addWithLimit("alice", channel(1))]);
    expect(results[0]).toEqual(results[1]);
    await otw.addWithLimit("alice", channel(2));
    await db.prepare("UPDATE multiview_channels SET added_at=1 WHERE owner_user_id=?").bind("alice").run();
    expect((await otw.list("alice")).map(item => item.channelId)).toEqual(["00000000000000000000000000000001", "00000000000000000000000000000002"]);
  });
  it.each([["", channel(1)], ["alice", { ...channel(1), channelId: "wrong" }], ["alice", { ...channel(1), channelId: "A".repeat(32) }], ["alice", { ...channel(1), channelName: " " }]] as const)("rejects invalid identities at the database boundary", async (owner, metadata) => {
    await expect(otw.addWithLimit(owner, metadata)).rejects.toThrow();
    expect(await otw.list("alice")).toEqual([]);
  });
});
