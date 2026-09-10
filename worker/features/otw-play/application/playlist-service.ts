import { PLAY_PLAYLIST_MAX_ITEMS, type PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import { PlaylistError, type PlaylistCatalogReader, type PlaylistRepository } from "./ports/playlist-repository";
import { PublicCatalogService, type PublicCatalogReadContext } from "./public-catalog-service";
import { parsePlaylistQuery, playlistCursor } from "../domain/playlist-query";

export class PlaylistService {
  private readonly catalog: PublicCatalogService;
  private readonly reader: PlaylistCatalogReader;
  private readonly repository: PlaylistRepository;
  constructor(catalog: PublicCatalogService, reader: PlaylistCatalogReader, repository: PlaylistRepository) {
    this.catalog = catalog; this.reader = reader; this.repository = repository;
  }

  async revision(context: PublicCatalogReadContext) {
    const state = await this.catalog.readPublicState();
    if (!state.publicReadEnabled && !context.allowDisabledRead) throw new PlaylistError(404, "PLAY_PUBLIC_READ_DISABLED");
    if (state.readModelRevision !== state.revision) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
    return state.revision;
  }
  private async consistent<T>(context: PublicCatalogReadContext, read: (revision: number) => Promise<T>) {
    const revision = await this.revision(context);
    const data = await read(revision);
    if (await this.revision(context) !== revision) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
    return { data, catalogRevision: revision, generatedAt: new Date().toISOString(), nextCursor: null as string | null };
  }
  defaults(context: PublicCatalogReadContext) {
    return this.consistent(context, async () => ({ items: await this.reader.readPlaylistDefaults() }));
  }
  async browse(context: PublicCatalogReadContext, params: URLSearchParams) {
    let nextCursor: string | null = null;
    const result = await this.consistent(context, async revision => {
      const query = parsePlaylistQuery(params, revision);
      const rows = await this.reader.readPlaylistPerformances(query);
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      if (rows.length > query.limit && last) nextCursor = playlistCursor(query, revision, last.performance);
      return { items };
    });
    return { ...result, nextCursor };
  }
  resolve(context: PublicCatalogReadContext, ids: string[]) {
    return this.consistent(context, async () => {
      const items = await this.reader.resolvePlaylistPerformances(ids);
      const found = new Set(items.map(item => item.performance.id));
      return { items, unavailableIds: ids.filter(id => !found.has(id)) };
    });
  }
  async list(context: PublicCatalogReadContext, owner: string) {
    await this.revision(context);
    return this.repository.list(owner);
  }
  async read(context: PublicCatalogReadContext, owner: string, id: string) {
    await this.revision(context);
    const saved = await this.repository.read(owner, id);
    if (!saved) throw new PlaylistError(404, "PLAY_PLAYLIST_NOT_FOUND");
    return saved;
  }
  async write(context: PublicCatalogReadContext, owner: string, input: PlayPlaylistWrite,
    command: { id: string; expectedVersion: number } | { requestId: string }) {
    if (input.performanceIds.length > PLAY_PLAYLIST_MAX_ITEMS) throw new PlaylistError(400, "PLAY_PLAYLIST_ITEM_LIMIT");
    const revision = await this.revision(context);
    const existing = "id" in command ? await this.read(context, owner, command.id) : null;
    if (existing && "expectedVersion" in command && existing.version !== command.expectedVersion) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    const previous = new Set(existing?.performanceIds ?? []);
    const added = input.performanceIds.filter(id => !previous.has(id));
    for (let index = 0; index < added.length; index += 60) {
      const ids = added.slice(index, index + 60);
      const visible = await this.reader.resolvePlaylistPerformances(ids);
      if (visible.length !== ids.length) throw new PlaylistError(400, "PLAY_PLAYLIST_UNAVAILABLE_ITEM");
    }
    if (revision !== await this.revision(context)) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
    if ("requestId" in command) return this.repository.create(owner, command.requestId, input);
    if (!await this.repository.save(owner, command.id, command.expectedVersion, input)) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    return this.read(context, owner, command.id);
  }
  async delete(context: PublicCatalogReadContext, owner: string, id: string, expectedVersion: number) {
    await this.read(context, owner, id);
    if (!await this.repository.delete(owner, id, expectedVersion)) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
  }
}
