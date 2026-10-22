import { MAX_SAVED_MULTIVIEW_CHANNELS, type MultiviewChannelMetadata, type SavedMultiviewChannel } from "@contracts/multiview";
import type { MultiviewChannelRepository } from "../application/ports/multiview-channels";

const columns = "channel_id AS channelId, channel_name AS channelName, channel_image_url AS channelImageUrl, added_at AS addedAt";

export class D1MultiviewChannelRepository implements MultiviewChannelRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(owner: string): Promise<SavedMultiviewChannel[]> {
    return (await this.db.prepare(`SELECT ${columns} FROM multiview_channels WHERE owner_user_id=? ORDER BY added_at, channel_id`).bind(owner).all<SavedMultiviewChannel>()).results;
  }
  find(owner: string, channelId: string): Promise<SavedMultiviewChannel | null> {
    return this.db.prepare(`SELECT ${columns} FROM multiview_channels WHERE owner_user_id=? AND channel_id=?`).bind(owner, channelId).first<SavedMultiviewChannel>();
  }
  async addWithLimit(owner: string, channel: MultiviewChannelMetadata): Promise<SavedMultiviewChannel | null> {
    const row = await this.db.prepare(`INSERT INTO multiview_channels(owner_user_id,channel_id,channel_name,channel_image_url,added_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM multiview_channels WHERE owner_user_id=?) < ?
      ON CONFLICT(owner_user_id,channel_id) DO NOTHING RETURNING ${columns}`)
      .bind(owner, channel.channelId, channel.channelName, channel.channelImageUrl, Date.now(), owner, MAX_SAVED_MULTIVIEW_CHANNELS).first<SavedMultiviewChannel>();
    return row ?? this.find(owner, channel.channelId);
  }
  async remove(owner: string, channelId: string): Promise<void> {
    await this.db.prepare("DELETE FROM multiview_channels WHERE owner_user_id=? AND channel_id=?").bind(owner, channelId).run();
  }
}
