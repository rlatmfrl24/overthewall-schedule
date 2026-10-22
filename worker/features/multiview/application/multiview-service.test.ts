import { describe, expect, it } from "vitest";
import type { MultiviewChannelMetadata, SavedMultiviewChannel } from "@contracts/multiview";
import type { MultiviewChannelReader, MultiviewChannelRepository } from "./ports/multiview-channels";
import { createMultiviewService } from "./multiview-service";

const channel = { channelId: "a".repeat(32), channelName: "My channel", channelImageUrl: null };
function setup(resolve: MultiviewChannelReader["resolveChannel"] = async () => channel) {
  const rows: SavedMultiviewChannel[] = [];
  const repository: MultiviewChannelRepository = {
    list: async () => rows, find: async (_, id) => rows.find(x => x.channelId === id) ?? null,
    addWithLimit: async (_, value: MultiviewChannelMetadata) => { if (rows.length >= 30) return null; const row = { ...value, addedAt: 1 }; rows.push(row); return row; },
    remove: async (_, id) => { const i = rows.findIndex(x => x.channelId === id); if (i >= 0) rows.splice(i, 1); },
  };
  return { rows, repository, service: createMultiviewService(repository, { resolveChannel: resolve, readLiveStatuses: async ids => ids.map(channelId => ({ channelId, content: null })) }) };
}
describe("personal multiview service", () => {
  it("returns a duplicate admitted concurrently between the initial lookup and a full-list read", async () => {
    const { rows, repository, service } = setup(async () => { throw new Error("provider must not be needed"); });
    for (let n = 0; n < 29; n++) rows.push({ ...channel, channelId: n.toString(16).padStart(32, "0"), addedAt: 1 });
    const duplicate = { ...channel, addedAt: 2 }; rows.push(duplicate);
    repository.find = async () => null;
    expect(await service.add("alice", channel.channelId)).toEqual({ item: duplicate });
  });
  it("replays a saved channel without relying on another upstream request", async () => {
    let available = true;
    const { service } = setup(async () => { if (!available) throw new Error("unavailable"); return channel; });
    const first = await service.add("alice", channel.channelId);
    available = false;
    expect(await service.add("alice", channel.channelId)).toEqual(first);
    expect(await service.list("alice")).toEqual({ items: [first.item], limit: 30 });
    expect(await service.liveStatus("alice")).toMatchObject({ items: [{ channelId: channel.channelId, content: null }] });
    expect(await service.remove("alice", channel.channelId)).toEqual({ deleted: true });
    expect((await service.list("alice")).items).toEqual([]);
  });
  it("rejects the thirty-first new channel but keeps existing data", async () => {
    const { rows, service } = setup();
    for (let i = 0; i < 30; i++) rows.push({ ...channel, channelId: i.toString(16).padStart(32, "0"), addedAt: 1 });
    await expect(service.add("alice", channel.channelId)).rejects.toMatchObject({ status: 409, code: "MULTIVIEW_CHANNEL_LIMIT" });
    expect((await service.list("alice")).items).toHaveLength(30);
  });
  it.each(["missing", "failed"])("does not save a %s provider lookup", async mode => {
    const { service } = setup(async () => { if (mode === "failed") throw new Error("upstream"); return null; });
    await expect(service.add("alice", channel.channelId)).rejects.toMatchObject({ status: mode === "failed" ? 503 : 404 });
    expect((await service.list("alice")).items).toEqual([]);
    expect(await service.remove("alice", channel.channelId)).toEqual({ deleted: true });
  });
});
