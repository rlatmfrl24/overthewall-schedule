import type { ChzzkHistoryDto, ChzzkVideosResponseDto, ChzzkClipsResponseDto } from "@contracts/chzzk";
import type { AdminChzzkHistoryReader } from "../application/history-reader";
import { CHZZK_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

export class D1AdminChzzkHistoryReader implements AdminChzzkHistoryReader {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async read(channelId: string | null, cursor: string | null): Promise<ChzzkHistoryDto> {
    const members = (await this.db.prepare("SELECT name, url_chzzk, content_access FROM members WHERE url_chzzk IS NOT NULL").all<{name:string;url_chzzk:string;content_access:"normal"|"admin_archive"}>()).results;
    const channels: ChzzkHistoryDto["channels"] = members.flatMap(member => {
      try {
        const id = new URL(member.url_chzzk).pathname.split("/").filter(Boolean).pop() ?? "";
        return CHZZK_CHANNEL_ID_PATTERN.test(id) ? [{ channelId: id, name: member.name, contentAccess: member.content_access }] : [];
      } catch { return []; }
    });
    const keys = (await this.db.prepare("SELECT key FROM chzzk_api_cache ORDER BY key").all<{key:string}>()).results;
    for (const {key} of keys) {
      const id = key.split(":")[2] ?? "";
      if (CHZZK_CHANNEL_ID_PATTERN.test(id) && !channels.some(channel => channel.channelId === id)) channels.push({channelId:id, name:id, contentAccess:null});
    }
    if (!channelId || !channels.some(channel => channel.channelId === channelId)) return { channels, snapshots: [], nextCursor: null };
    // Cache identity includes type/version/channel/profile. Retain expired snapshots
    // and all stored profiles; this path never refreshes or writes the provider cache.
    const rows = (await this.db.prepare(`SELECT key,type,value,fetched_at FROM chzzk_api_cache
      WHERE (key LIKE ? OR key LIKE ?) AND (? IS NULL OR key > ?) ORDER BY key LIMIT 21`)
      .bind(`vods:%:${channelId}:%`, `clips:%:${channelId}:%`, cursor, cursor).all<{key:string;type:"vods"|"clips";value:string;fetched_at:number}>()).results;
    const contentAccess = channels.some(channel => channel.channelId === channelId && channel.contentAccess === "normal") ? "normal" : channels.some(channel => channel.channelId === channelId && channel.contentAccess === "admin_archive") ? "admin_archive" : null;
    const snapshots: ChzzkHistoryDto["snapshots"] = rows.slice(0, 20).map(row => {
      const content = JSON.parse(row.value) as ChzzkVideosResponseDto | ChzzkClipsResponseDto;
      if (!content || !Array.isArray(content.data)) throw new Error("Invalid stored CHZZK snapshot");
      return { key: row.key, type: row.type, content, storedAt: new Date(row.fetched_at).toISOString(), contentAccess };
    });
    return { channels, snapshots, nextCursor: rows.length > 20 ? snapshots.at(-1)!.key : null };
  }
}
