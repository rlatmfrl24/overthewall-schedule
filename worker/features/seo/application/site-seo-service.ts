import {
  buildFeedSiteSeo,
  buildPlayHomeSiteSeo,
  buildPlaySongPlaceholderSeo,
  buildPlaySongsSiteSeo,
  buildPlaySongSiteSeo,
  buildProfileSiteSeo,
  isFeedPublic,
  buildStaticSitemapUrls,
  toSiteUrl,
  type SiteSeoMetadata,
  type SiteRobots,
} from "@contracts/site-seo";
import type { MemberProfileDto } from "@contracts/members";
import type { SiteDefinition } from "@contracts/site-definition";
import type {
  PlaySeoState,
  SiteSeoReader,
} from "./ports/site-seo-reader";

const MAX_PLAY_SITEMAP_SONGS = 5_000;

const isSafeNonNegativeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const validatePlayState = (state: PlaySeoState): PlaySeoState => {
  if (
    !isSafeNonNegativeInteger(state.revision) ||
    !isSafeNonNegativeInteger(state.updatedAt) ||
    (state.readModelRevision !== null &&
      !isSafeNonNegativeInteger(state.readModelRevision)) ||
    typeof state.publicReadEnabled !== "boolean" ||
    typeof state.navigationVisible !== "boolean" ||
    (state.navigationVisible && !state.publicReadEnabled) ||
    (state.publicReadEnabled && state.readModelRevision !== state.revision)
  ) {
    throw new Error("OTW Play SEO state is unavailable");
  }
  return state;
};

const playRobots = (state: PlaySeoState): SiteRobots =>
  (state.requiresMembership !== false || !state.publicReadEnabled)
    ? "noindex,nofollow"
    : state.navigationVisible
      ? "index,follow"
      : "noindex,follow";

export class SiteSeoService {
  private readonly reader: SiteSeoReader;
  readonly site: SiteDefinition;

  constructor(reader: SiteSeoReader, site: SiteDefinition) {
    this.reader = reader;
    this.site = site;
  }

  async readFeed(): Promise<{ metadata: SiteSeoMetadata; isPublic: boolean }> {
    const state = await this.reader.readFeedState();
    const publicFeed = isFeedPublic(state);
    return { metadata: buildFeedSiteSeo(publicFeed, this.site), isPublic: publicFeed };
  }

  findProfile(code: string): Promise<MemberProfileDto | null> {
    return this.reader.findActiveProfileByCode(code);
  }

  private async readPlayState(): Promise<PlaySeoState> {
    return validatePlayState(await this.reader.readPlayState());
  }

  async readPlayHome(): Promise<SiteSeoMetadata> {
    const state = await this.readPlayState();
    return buildPlayHomeSiteSeo(playRobots(state), this.site);
  }

  async readPlaySongs(): Promise<SiteSeoMetadata> {
    const state = await this.readPlayState();
    return buildPlaySongsSiteSeo(
      state.requiresMembership === false && state.publicReadEnabled ? "noindex,follow" : "noindex,nofollow", this.site,
    );
  }

  async findPlaySong(
    slug: string,
  ): Promise<SiteSeoMetadata | null> {
    const state = await this.readPlayState();
    if (state.requiresMembership !== false || !state.publicReadEnabled) {
      return buildPlaySongPlaceholderSeo(
        `/play/songs/${encodeURIComponent(slug)}`, this.site,
      );
    }
    const song = await this.reader.findPublishedPlaySongBySlug(slug);
    return song ? buildPlaySongSiteSeo(song, playRobots(state), this.site) : null;
  }

  private async assertPlaySnapshot(state: PlaySeoState) {
    const current = await this.readPlayState();
    if (current.revision !== state.revision || current.publicReadEnabled !== state.publicReadEnabled ||
        current.navigationVisible !== state.navigationVisible || current.requiresMembership !== state.requiresMembership) throw new Error("OTW Play SEO snapshot changed");
  }

  async buildSitemapUrls(): Promise<string[]> {
    const [feed, codes, playState] = await Promise.all([
      this.readFeed(),
      this.reader.listActiveProfileCodes(),
      this.readPlayState(),
    ]);
    const urls = new Set(buildStaticSitemapUrls(this.site));
    if (feed.isPublic) urls.add(feed.metadata.canonical);
    for (const code of codes) urls.add(toSiteUrl(`/profile/${code}`, this.site));
    if (playState.requiresMembership === false && playState.navigationVisible) {
      const slugs = [
        ...new Set(await this.reader.listPublishedPlaySongSlugs()),
      ];
      if (slugs.length > MAX_PLAY_SITEMAP_SONGS) {
        throw new Error("OTW Play sitemap exceeds the supported song limit");
      }
      await this.assertPlaySnapshot(playState);
      urls.add(toSiteUrl("/play", this.site));
      for (const slug of slugs) {
        urls.add(toSiteUrl(`/play/songs/${encodeURIComponent(slug)}`, this.site));
      }
    }
    return [...urls];
  }

  buildProfileMetadata(member: MemberProfileDto): SiteSeoMetadata {
    return buildProfileSiteSeo(member, this.site);
  }
}
