import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1PlaylistRepository } from "./d1-playlist-repository";
const testEnv = env as Env & { OTW_PLAY_PLAYLIST_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const repository = new D1PlaylistRepository(db);
const input = { title: "내 노래", description: "개인 목록", originDefaultId: "cover", performanceIds: ["a", "b", "c"] };
beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PLAYLIST_MIGRATIONS);
  await db.prepare("DELETE FROM music_playlists").run();
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
