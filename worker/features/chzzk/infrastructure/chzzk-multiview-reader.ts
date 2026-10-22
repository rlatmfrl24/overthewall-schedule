import type { ChzzkLiveContentDto, ChzzkLiveStatusItemDto } from "@contracts/chzzk";
import type { MultiviewChannelMetadata } from "@contracts/multiview";
import { fetchChzzkLiveStatusWithDebug } from "./chzzk-api";

const imageUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};
const validLiveContent = (content: ChzzkLiveContentDto | null, channelId: string): content is ChzzkLiveContentDto => Boolean(content && content.channelId === channelId && ["OPEN", "CLOSE"].includes(content.status) && typeof content.channelName === "string" && content.channelName.trim() && typeof content.liveTitle === "string" && Number.isFinite(content.concurrentUserCount) && content.concurrentUserCount >= 0);

export class ChzzkMultiviewReader {
  async resolveChannel(channelId: string): Promise<MultiviewChannelMetadata | null> {
    if (!/^[a-f0-9]{32}$/.test(channelId)) throw new Error("Invalid CHZZK channel");
    const response = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("CHZZK channel unavailable");
    const data = await response.json() as { code?: unknown; content?: { channelId?: unknown; channelName?: unknown; channelImageUrl?: unknown } | null };
    if (data.code === 404) return null;
    const channel = data.content;
    if (data.code !== 200 || channel?.channelId !== channelId || typeof channel.channelName !== "string" || !channel.channelName.trim()) throw new Error("Invalid CHZZK channel response");
    return { channelId, channelName: channel.channelName.trim(), channelImageUrl: imageUrl(channel.channelImageUrl) };
  }
  async readLiveStatuses(channelIds: readonly string[]): Promise<ChzzkLiveStatusItemDto[]> {
    const items: ChzzkLiveStatusItemDto[] = channelIds.map(channelId => ({ channelId, content: null }));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]!;
        try {
          const result = await fetchChzzkLiveStatusWithDebug(item.channelId, { signal: AbortSignal.timeout(5_000) });
          if (!result.debug.error && !result.debug.staleCacheUsed && validLiveContent(result.content, item.channelId)) item.content = result.content;
        } catch { /* One channel's failure must not hide the remaining channels. */ }
      }
    }));
    return items;
  }
}
