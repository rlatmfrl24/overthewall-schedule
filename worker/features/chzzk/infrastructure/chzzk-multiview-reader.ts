import type { MultiviewChannelMetadata, MultiviewLiveContentDto, MultiviewLiveStatusItemDto } from "@contracts/multiview";
import { fetchChzzkLiveStatusWithDebug } from "./chzzk-api";

const imageUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};
const readLiveContent = (value: unknown, channelId: string): MultiviewLiveContentDto | null => {
  if (!value || typeof value !== "object") return null;
  const content = value as Record<string, unknown>;
  if (content.channelId !== channelId || (content.status !== "OPEN" && content.status !== "CLOSE") || typeof content.liveTitle !== "string" || typeof content.concurrentUserCount !== "number" || !Number.isFinite(content.concurrentUserCount) || content.concurrentUserCount < 0) return null;
  return {
    channelId, status: content.status, liveTitle: content.liveTitle, concurrentUserCount: content.concurrentUserCount,
    ...(typeof content.channelName === "string" && content.channelName.trim() ? { channelName: content.channelName.trim() } : {}),
    ...(typeof content.channelImageUrl === "string" ? { channelImageUrl: content.channelImageUrl } : {}),
    ...(typeof content.liveImageUrl === "string" ? { liveImageUrl: content.liveImageUrl } : {}),
    ...(typeof content.defaultThumbnailImageUrl === "string" ? { defaultThumbnailImageUrl: content.defaultThumbnailImageUrl } : {}),
    ...(typeof content.openDate === "string" || content.openDate === null ? { openDate: content.openDate } : {}),
  };
};

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
  async readLiveStatuses(channelIds: readonly string[]): Promise<MultiviewLiveStatusItemDto[]> {
    const items: MultiviewLiveStatusItemDto[] = channelIds.map(channelId => ({ channelId, content: null }));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]!;
        try {
          const result = await fetchChzzkLiveStatusWithDebug(item.channelId, { signal: AbortSignal.timeout(5_000) });
          if (!result.debug.error && !result.debug.staleCacheUsed) item.content = readLiveContent(result.content, item.channelId);
        } catch { /* One channel's failure must not hide the remaining channels. */ }
      }
    }));
    return items;
  }
}
