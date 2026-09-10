import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1DefaultPlaylistSettingsRepository } from "./d1-default-playlist-settings-repository";
import { D1PlaylistRepository } from "./d1-playlist-repository";
const testEnv = env as Env & { OTW_PLAY_PLAYLIST_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const repository = new D1PlaylistRepository(db);
const input = { title: "내 노래", description: "개인 목록", originDefaultId: "cover", performanceIds: ["a", "b", "c"] };
beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PLAYLIST_MIGRATIONS);
  await db.prepare("DELETE FROM music_playlists").run();
  await db.prepare("DELETE FROM music_default_playlist_settings").run();
  await db.prepare("DELETE FROM admin_audit_logs").run();
});
describe("personal playlist D1 ownership and atomic order", () => {
  it("persists more than one page, reopens ordered references and does not need surviving catalog rows", async () => {
    const performanceIds = Array.from({ length: 135 }, (_, index) => `performance-${index}`);
    const saved = await repository.create("alice", "request-a", { ...input, performanceIds });
    expect((await repository.read("alice", saved.id))?.performanceIds).toEqual(performanceIds);
    expect((await repository.list("alice"))[0].itemCount).toBe(135);
    expect(await repository.read("bob", saved.id)).toBeNull();
    expect(await repository.list("bob")).toEqual([]);
  });
  it("replays create and rejects reuse for another payload", async () => {
    const first = await repository.create("alice", "same-request", input);
    expect((await repository.create("alice", "same-request", input)).id).toBe(first.id);
    await expect(repository.create("alice", "same-request", { ...input, title: "different" })).rejects.toMatchObject({ status: 409 });
    expect(await repository.list("alice")).toHaveLength(1);
  });
  it("allows exactly one concurrent save and leaves all winning items intact", async () => {
    const saved = await repository.create("alice", "request-b", input);
    const writes = [{ ...input, title: "one", performanceIds: ["c", "a"] }, { ...input, title: "two", performanceIds: ["b"] }];
    const results = await Promise.all(writes.map(write => repository.save("alice", saved.id, 0, write)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const readback = await repository.read("alice", saved.id);
    expect(readback).toMatchObject({ version: 1, title: writes[results.indexOf(true)].title, performanceIds: writes[results.indexOf(true)].performanceIds });
    expect(await repository.save("bob", saved.id, 1, input)).toBe(false);
    expect(await repository.delete("bob", saved.id, 1)).toBe(false);
    expect(await repository.delete("alice", saved.id, 0)).toBe(false);
    expect(await repository.read("alice", saved.id)).toEqual(readback);
  });
  it("rolls back header and item deletion on failed item insertion", async () => {
    const saved = await repository.create("alice", "request-c", input);
    await expect(repository.save("alice", saved.id, 0, { ...input, title: "not saved", performanceIds: ["x", "x"] })).rejects.toThrow();
    expect(await repository.read("alice", saved.id)).toEqual(saved);
    expect(await repository.delete("alice", saved.id, 0)).toBe(true);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM music_playlist_items").first("count")).toBe(0);
  });
});


describe("representative choice persistence", () => {
  it("retains legacy choices, distinguishes null, and rolls back a failed reordered save", async () => {
    const saved = await repository.create("alice", "artwork", { ...input, representativePerformanceId: "b" });
    expect(saved.representativePerformanceId).toBe("b");
    await repository.save("alice", saved.id, 0, { ...input, performanceIds: ["c", "b", "a"] });
    expect((await repository.read("alice", saved.id))?.representativePerformanceId).toBe("b");
    await expect(repository.save("alice", saved.id, 1, { ...input, representativePerformanceId: "c", performanceIds: ["c", "c"] })).rejects.toThrow();
    expect(await repository.read("alice", saved.id)).toMatchObject({ representativePerformanceId: "b", version: 1, performanceIds: ["c", "b", "a"] });
    await repository.save("alice", saved.id, 1, { ...input, representativePerformanceId: null });
    expect((await repository.read("alice", saved.id))?.representativePerformanceId).toBeNull();
    await expect(repository.create("alice", "artwork", { ...input, representativePerformanceId: "a" })).rejects.toMatchObject({ code: "PLAY_REQUEST_CONFLICT" });
    expect((await repository.create("alice", "artwork", { ...input, representativePerformanceId: "b" })).id).toBe(saved.id);
  });
});

describe("default playlist D1 settings and audit atomicity", () => {
  const settings = new D1DefaultPlaylistSettingsRepository(db);
  const actor = { userId: "admin", displayName: "Administrator", ipAddress: "127.0.0.1" };
  const base = { title: null, description: null, representativePerformanceId: null };
  it("creates only once under concurrent first saves and audits exactly the winner", async () => {
    const results = await Promise.all([settings.save("original", 0, { ...base, title: "one" }, actor), settings.save("original", 0, { ...base, title: "two" }, actor)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await settings.list()).toEqual([{ id: "original", version: 1, ...base, title: results[0] ? "one" : "two" }]);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM admin_audit_logs").first("count")).toBe(1);
    expect(await settings.save("original", 0, base, actor)).toBe(false);
    expect(await settings.save("original", 1, { ...base, representativePerformanceId: "a" }, actor)).toBe(true);
    const audit = await db.prepare("SELECT detail FROM admin_audit_logs ORDER BY id DESC LIMIT 1").first<string>("detail");
    expect(JSON.parse(audit!)).toMatchObject({ previous: { version: 1 }, current: { version: 2, representativePerformanceId: "a" } });
  });
  it("rolls back settings if audit insertion fails", async () => {
    await settings.save("cover", 0, base, actor);
    await db.exec("CREATE TRIGGER reject_playlist_audit BEFORE INSERT ON admin_audit_logs BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
    try {
      await expect(settings.save("cover", 1, { ...base, title: "lost" }, actor)).rejects.toThrow();
      expect(await settings.list()).toEqual([{ id: "cover", version: 1, ...base }]);
    } finally { await db.exec("DROP TRIGGER reject_playlist_audit"); }
  });
});
