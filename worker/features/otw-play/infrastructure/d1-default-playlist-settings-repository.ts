import type { PlayDefaultPlaylistWrite } from "@contracts/otw-play-playlists";
import type { DefaultPlaylistSetting, DefaultPlaylistSettingsRepository } from "../application/ports/playlist-repository";

export class D1DefaultPlaylistSettingsRepository implements DefaultPlaylistSettingsRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async list(): Promise<DefaultPlaylistSetting[]> {
    const result = await this.db.prepare(`SELECT playlist_key AS id, title, description,
      representative_performance_id AS representativePerformanceId, version FROM music_default_playlist_settings`).all<DefaultPlaylistSetting>();
    return result.results;
  }

  async save(id: string, expectedVersion: number, input: PlayDefaultPlaylistWrite,
    actor: { userId: string; displayName: string | null; ipAddress: string | null }): Promise<boolean> {
    const token = crypto.randomUUID(), now = Date.now();
    // Audit and settings share the same transaction and compare-and-swap predicate.
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO admin_audit_logs
        (event_type, resource_type, resource_id, action, status, actor_id, actor_name, actor_ip,
         target_count, success_count, failure_count, detail, created_at)
        SELECT 'otw_play.playlist.updated', 'otw_play_default_playlist', ?, 'update', 'success', ?, ?, ?, 1, 1, 0,
          json_object('previous', json((SELECT json_object('title', title, 'description', description,
            'representativePerformanceId', representative_performance_id, 'version', version)
            FROM music_default_playlist_settings WHERE playlist_key = ?)), 'current', json(?)), ?
        WHERE COALESCE((SELECT version FROM music_default_playlist_settings WHERE playlist_key = ?), 0) = ?`)
        .bind(id, actor.userId, actor.displayName, actor.ipAddress, id, JSON.stringify({ ...input, version: expectedVersion + 1 }), now, id, expectedVersion),
      this.db.prepare(`INSERT INTO music_default_playlist_settings
        (playlist_key, title, description, representative_performance_id, version, updated_by, updated_at, write_token)
        SELECT ?, ?, ?, ?, 1, ?, ?, ? WHERE ? = 0
        ON CONFLICT(playlist_key) DO NOTHING`)
        .bind(id, input.title, input.description, input.representativePerformanceId, actor.userId, now, token, expectedVersion),
      this.db.prepare(`UPDATE music_default_playlist_settings SET title = ?, description = ?, representative_performance_id = ?,
        version = version + 1, updated_by = ?, updated_at = ?, write_token = ?
        WHERE playlist_key = ? AND version = ? AND ? > 0`)
        .bind(input.title, input.description, input.representativePerformanceId, actor.userId, now, token, id, expectedVersion, expectedVersion),
    ]);
    return results[1].meta.changes + results[2].meta.changes === 1;
  }
}
