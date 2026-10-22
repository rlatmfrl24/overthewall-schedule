import { MAX_SAVED_MULTIVIEW_CHANNELS, type MultiviewErrorCode } from "@contracts/multiview";
import type { MultiviewChannelReader, MultiviewChannelRepository } from "./ports/multiview-channels";

export class MultiviewServiceError extends Error {
  readonly status: number;
  readonly code: MultiviewErrorCode;
  constructor(status: number, code: MultiviewErrorCode) { super(code); this.status = status; this.code = code; }
}
export const createMultiviewService = (repository: MultiviewChannelRepository, reader: MultiviewChannelReader) => ({
  async list(owner: string) { return { items: await repository.list(owner), limit: MAX_SAVED_MULTIVIEW_CHANNELS }; },
  async add(owner: string, channelId: string) {
    const channels = await repository.list(owner);
    const existing = channels.find(channel => channel.channelId === channelId);
    if (existing) return { item: existing };
    if (channels.length >= MAX_SAVED_MULTIVIEW_CHANNELS) throw new MultiviewServiceError(409, "MULTIVIEW_CHANNEL_LIMIT");
    let metadata;
    try { metadata = await reader.resolveChannel(channelId); }
    catch { throw new MultiviewServiceError(503, "MULTIVIEW_UNAVAILABLE"); }
    if (!metadata) throw new MultiviewServiceError(404, "MULTIVIEW_CHANNEL_NOT_FOUND");
    const item = await repository.addWithLimit(owner, metadata);
    if (!item) throw new MultiviewServiceError(409, "MULTIVIEW_CHANNEL_LIMIT");
    return { item };
  },
  async remove(owner: string, channelId: string) { await repository.remove(owner, channelId); return { deleted: true as const }; },
  async liveStatus(owner: string) {
    const channels = await repository.list(owner);
    return { items: channels.length ? await reader.readLiveStatuses(channels.map(channel => channel.channelId)) : [], updatedAt: new Date().toISOString() };
  },
});
export type MultiviewService = ReturnType<typeof createMultiviewService>;
