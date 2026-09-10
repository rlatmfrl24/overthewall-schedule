import type { PlayPlaylist, PlayPlaylistSummary, PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import { PlaylistError, type PlaylistRepository } from "../application/ports/playlist-repository";

type Row = { id: string; title: string; description: string; version: number; origin_default_id: string | null;
  created_at: number; updated_at: number; item_count: number; create_payload: string };
const projection = (row: Row): PlayPlaylistSummary => ({ id: row.id, title: row.title, description: row.description,
  version: row.version, originDefaultId: row.origin_default_id, createdAt: row.created_at, updatedAt: row.updated_at, itemCount: row.item_count });
const select = `SELECT playlist.*, (SELECT COUNT(*) FROM music_playlist_items WHERE playlist_id = playlist.id) AS item_count
  FROM music_playlists AS playlist`;

export class D1PlaylistRepository implements PlaylistRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(owner: string) {
    const result = await this.db.prepare(`${select} WHERE owner_user_id = ? ORDER BY updated_at DESC, id`).bind(owner).all<Row>();
    return result.results.map(projection);
  }
  async read(owner: string, id: string): Promise<PlayPlaylist | null> {
    // One statement keeps metadata, version and ordered items in the same database snapshot.
    const row = await this.db.prepare(`${select.replace("playlist.*,", `playlist.*,
      (SELECT json_group_array(performance_id) FROM (SELECT performance_id FROM music_playlist_items WHERE playlist_id = playlist.id ORDER BY position)) AS items_json,`)}
      WHERE owner_user_id = ? AND id = ?`).bind(owner, id).first<Row & { items_json: string }>();
    return row ? { ...projection(row), performanceIds: JSON.parse(row.items_json) as string[] } : null;
  }
  private insertItems(id: string, token: string, ids: string[]) {
    return this.db.prepare(`INSERT INTO music_playlist_items (playlist_id, performance_id, position)
      SELECT ?, value, CAST(key AS INTEGER) FROM json_each(?)
      WHERE EXISTS (SELECT 1 FROM music_playlists WHERE id = ? AND write_token = ?)`)
      .bind(id, JSON.stringify(ids), id, token);
  }
  async create(owner: string, requestId: string, input: PlayPlaylistWrite) {
    const id = crypto.randomUUID(), token = crypto.randomUUID(), now = Date.now(), payload = JSON.stringify(input);
    await this.db.batch([
      this.db.prepare(`INSERT INTO music_playlists
        (id, owner_user_id, title, description, origin_default_id, create_request_id, create_payload, write_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, create_request_id) DO NOTHING`)
        .bind(id, owner, input.title, input.description, input.originDefaultId, requestId, payload, token, now, now),
      this.insertItems(id, token, input.performanceIds),
    ]);
    const saved = await this.db.prepare("SELECT id, create_payload FROM music_playlists WHERE owner_user_id = ? AND create_request_id = ?")
      .bind(owner, requestId).first<{ id: string; create_payload: string }>();
    if (!saved || saved.create_payload !== payload) throw new PlaylistError(409, "PLAY_REQUEST_CONFLICT");
    return (await this.read(owner, saved.id))!;
  }
  async save(owner: string, id: string, expectedVersion: number, input: PlayPlaylistWrite) {
    const token = crypto.randomUUID();
    const result = await this.db.batch([
      this.db.prepare(`UPDATE music_playlists SET title = ?, description = ?, origin_default_id = ?,
        version = version + 1, updated_at = ?, write_token = ? WHERE id = ? AND owner_user_id = ? AND version = ?`)
        .bind(input.title, input.description, input.originDefaultId, Date.now(), token, id, owner, expectedVersion),
      this.db.prepare(`DELETE FROM music_playlist_items WHERE playlist_id = ?
        AND EXISTS (SELECT 1 FROM music_playlists WHERE id = ? AND write_token = ?)`).bind(id, id, token),
      this.insertItems(id, token, input.performanceIds),
    ]);
    return result[0].meta.changes === 1;
  }
  async delete(owner: string, id: string, expectedVersion: number) {
    const result = await this.db.prepare("DELETE FROM music_playlists WHERE id = ? AND owner_user_id = ? AND version = ? RETURNING id")
      .bind(id, owner, expectedVersion).first();
    return result !== null;
  }
}
