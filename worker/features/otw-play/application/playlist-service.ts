import { PLAY_PLAYLIST_MAX_ITEMS, type PlayAdminDefaultPlaylist, type PlayDefaultPlaylistWrite, type PlayPlaylist, type PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import { PlaylistError, type PlaylistCatalogReader, type PlaylistRepository, type DefaultPlaylistSettingsRepository } from "./ports/playlist-repository";
import { PublicCatalogService, type PublicCatalogReadContext } from "./public-catalog-service";
import { playlistArtwork, matchesPlaylist } from "./playlist-artwork";
import type { PublicCatalogPerformanceDetail } from "./ports/public-catalog-reader";
import { parsePlaylistQuery, playlistCursor } from "../domain/playlist-query";

export class PlaylistService {
  private readonly catalog: PublicCatalogService;
  private readonly reader: PlaylistCatalogReader;
  private readonly repository: PlaylistRepository;
  private readonly settings: DefaultPlaylistSettingsRepository;
  constructor(catalog: PublicCatalogService, reader: PlaylistCatalogReader, repository: PlaylistRepository, settings: DefaultPlaylistSettingsRepository) {
    this.catalog = catalog; this.reader = reader; this.repository = repository; this.settings = settings;
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
    return this.consistent(context, async () => ({ items: (await this.readDefaultSettings()).map(item => ({ id: item.id, version: item.version, title: item.title, description: item.description,
      representativePerformanceId: item.representativePerformanceId, imageUrl: item.imageUrl,
      songCount: item.songCount, performanceCount: item.performanceCount, query: item.query })) }));
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
  private async resolveArtwork(ids: string[]) {
    const result = new Map<string, PublicCatalogPerformanceDetail>();
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += 60) {
      for (const item of await this.reader.resolvePlaylistPerformances(unique.slice(offset, offset + 60))) result.set(item.performance.id, item);
    }
    return result;
  }
  private async images(playlists: PlayPlaylist[]) {
    const tracks = new Map<string, PublicCatalogPerformanceDetail>();
    const representatives = await this.resolveArtwork(playlists.flatMap(item => item.representativePerformanceId ? [item.representativePerformanceId] : []));
    for (const [id, item] of representatives) tracks.set(id, item);
    const unresolved = playlists.filter(item => !playlistArtwork(tracks.get(item.representativePerformanceId ?? "")));
    // Resolve shared candidates in bounded batches, stopping as soon as each list has artwork.
    const cursors = new Map(unresolved.map(item => [item.id, 0]));
    const fallback = new Map<string, string>();
    while (unresolved.some(item => !fallback.has(item.id) && cursors.get(item.id)! < item.performanceIds.length)) {
      const ids = unresolved.flatMap(item => fallback.has(item.id) ? [] : item.performanceIds.slice(cursors.get(item.id)!, cursors.get(item.id)! + 60));
      const found = await this.resolveArtwork(ids.filter(id => !tracks.has(id)));
      for (const [id, item] of found) tracks.set(id, item);
      for (const item of unresolved) {
        if (fallback.has(item.id)) continue;
        const offset = cursors.get(item.id)!;
        const image = item.performanceIds.slice(offset, offset + 60).map(id => playlistArtwork(tracks.get(id))).find(Boolean);
        if (image) fallback.set(item.id, image);
        cursors.set(item.id, offset + 60);
      }
    }
    return playlists.map(item => ({ ...item, imageUrl: playlistArtwork(tracks.get(item.representativePerformanceId ?? "")) ?? fallback.get(item.id) ?? null }));
  }
  async list(context: PublicCatalogReadContext, owner: string) {
    return (await this.consistent(context, async () => (await this.images(await this.repository.list(owner)))
      .map(item => ({ id: item.id, title: item.title, description: item.description, version: item.version,
        itemCount: item.itemCount, originDefaultId: item.originDefaultId, createdAt: item.createdAt, updatedAt: item.updatedAt,
        representativePerformanceId: item.representativePerformanceId, imageUrl: item.imageUrl })))).data;
  }
  async read(context: PublicCatalogReadContext, owner: string, id: string) {
    return (await this.consistent(context, async () => {
      const saved = await this.repository.read(owner, id);
      if (!saved) throw new PlaylistError(404, "PLAY_PLAYLIST_NOT_FOUND");
      return (await this.images([saved]))[0];
    })).data;
  }
  private async readCreated(context: PublicCatalogReadContext, owner: string, id: string) {
    try {
      return await this.read(context, owner, id);
    } catch {
      // Creation is already committed. A read failure must not look like a
      // pre-write rejection: clients must replay the same request and payload.
      throw new PlaylistError(503, "PLAY_PLAYLIST_CREATE_UNCONFIRMED");
    }
  }
  private async readDefaultSettings(): Promise<PlayAdminDefaultPlaylist[]> {
    const [defaults, settings] = await Promise.all([this.reader.readPlaylistDefaults(), this.settings.list()]);
    const tracks = await this.resolveArtwork(settings.flatMap(item => item.representativePerformanceId ? [item.representativePerformanceId] : []));
    return defaults.map(item => {
      const setting = settings.find(setting => setting.id === item.id);
      const overrides = setting ?? { title: null, description: null, representativePerformanceId: null };
      const representative = tracks.get(overrides.representativePerformanceId ?? "");
      const image = representative && matchesPlaylist(representative, item.query) ? playlistArtwork(representative) : null;
      return { ...item, version: setting?.version ?? 0, representativePerformanceId: overrides.representativePerformanceId,
        title: overrides.title ?? item.title, description: overrides.description ?? item.description,
        imageUrl: image ?? item.imageUrl, representativeAvailable: Boolean(image),
        defaults: { title: item.title, description: item.description, imageUrl: item.imageUrl },
        overrides: { title: overrides.title, description: overrides.description, representativePerformanceId: overrides.representativePerformanceId } };
    });
  }
  async adminDefaults(id?: string) {
    const result = await this.consistent({ allowDisabledRead: true, allowSharedCache: false }, () => this.readDefaultSettings());
    if (id && !result.data.some(item => item.id === id)) throw new PlaylistError(404, "PLAY_PLAYLIST_NOT_FOUND");
    return id ? result.data.filter(item => item.id === id) : result.data;
  }
  async saveDefault(id: string, input: PlayDefaultPlaylistWrite, expectedVersion: number,
    actor: { userId: string; displayName: string | null; ipAddress: string | null }) {
    const context = { allowDisabledRead: true, allowSharedCache: false };
    const revision = await this.revision(context);
    const current = (await this.adminDefaults(id))[0];
    if (current.version !== expectedVersion) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    if (input.representativePerformanceId && input.representativePerformanceId !== current.representativePerformanceId) {
      const candidate = (await this.reader.resolvePlaylistPerformances([input.representativePerformanceId]))[0];
      if (!candidate || !matchesPlaylist(candidate, current.query) || !playlistArtwork(candidate)) throw new PlaylistError(400, "PLAY_PLAYLIST_INVALID_REPRESENTATIVE");
    }
    if (await this.revision(context) !== revision) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
    if (!await this.settings.save(id, expectedVersion, input, actor)) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    return (await this.adminDefaults(id))[0];
  }
  async write(context: PublicCatalogReadContext, owner: string, input: PlayPlaylistWrite,
    command: { id: string; expectedVersion: number } | { requestId: string }) {
    if (input.performanceIds.length > PLAY_PLAYLIST_MAX_ITEMS) throw new PlaylistError(400, "PLAY_PLAYLIST_ITEM_LIMIT");
    const revision = await this.revision(context);
    if ("requestId" in command) {
      const replay = await this.repository.findCreate(owner, command.requestId, input);
      if (replay) return this.readCreated(context, owner, replay.id);
    }
    const existing = "id" in command ? await this.repository.read(owner, command.id) : null;
    if ("id" in command && !existing) throw new PlaylistError(404, "PLAY_PLAYLIST_NOT_FOUND");
    if (existing && "expectedVersion" in command && existing.version !== command.expectedVersion) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    const representative = input.representativePerformanceId === undefined ? existing?.representativePerformanceId ?? null : input.representativePerformanceId;
    if (representative && !input.performanceIds.includes(representative)) throw new PlaylistError(400, "PLAY_PLAYLIST_INVALID_REPRESENTATIVE");
    if (representative && representative !== existing?.representativePerformanceId) {
      const candidate = (await this.reader.resolvePlaylistPerformances([representative]))[0];
      if (!playlistArtwork(candidate)) throw new PlaylistError(400, "PLAY_PLAYLIST_INVALID_REPRESENTATIVE");
    }
    const previous = new Set(existing?.performanceIds ?? []);
    const added = input.performanceIds.filter(id => !previous.has(id));
    for (let index = 0; index < added.length; index += 60) {
      const ids = added.slice(index, index + 60);
      const visible = await this.reader.resolvePlaylistPerformances(ids);
      if (visible.length !== ids.length) throw new PlaylistError(400, "PLAY_PLAYLIST_UNAVAILABLE_ITEM");
    }
    if (revision !== await this.revision(context)) throw new PlaylistError(409, "PLAY_CURSOR_STALE");
    if ("requestId" in command) return this.readCreated(context, owner, (await this.repository.create(owner, command.requestId, input)).id);
    if (!await this.repository.save(owner, command.id, command.expectedVersion, input)) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
    return this.read(context, owner, command.id);
  }
  async delete(context: PublicCatalogReadContext, owner: string, id: string, expectedVersion: number) {
    await this.read(context, owner, id);
    if (!await this.repository.delete(owner, id, expectedVersion)) throw new PlaylistError(409, "PLAY_PLAYLIST_CONFLICT");
  }
}
