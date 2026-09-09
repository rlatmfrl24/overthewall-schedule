import { isOtwPlayMemberPageEligible } from "@contracts/otw-play-members";
import {
  buildFeedSiteSeo,
  buildPlayMemberSiteSeo,
  buildPlayHomeSiteSeo,
  buildPlaySongPlaceholderSeo,
  buildPlaySongsSiteSeo,
  buildPlaySongSiteSeo,
  buildProfileSiteSeo,
  isFeedPublic,
  STATIC_SITEMAP_URLS,
  toSiteUrl,
  type SiteSeoMetadata,
  type SiteRobots,
} from "@contracts/site-seo";
import type { MemberProfileDto } from "@contracts/members";
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
  !state.publicReadEnabled
    ? "noindex,nofollow"
    : state.navigationVisible
      ? "index,follow"
      : "noindex,follow";

export class SiteSeoService {
  private readonly reader: SiteSeoReader;

  constructor(reader: SiteSeoReader) {
    this.reader = reader;
  }

  async readFeed(): Promise<{ metadata: SiteSeoMetadata; isPublic: boolean }> {
    const state = await this.reader.readFeedState();
    const publicFeed = isFeedPublic(state);
    return { metadata: buildFeedSiteSeo(publicFeed), isPublic: publicFeed };
  }

  findProfile(code: string): Promise<MemberProfileDto | null> {
    return this.reader.findActiveProfileByCode(code);
  }

  private async readPlayState(): Promise<PlaySeoState> {
    return validatePlayState(await this.reader.readPlayState());
  }

  async readPlayHome(): Promise<SiteSeoMetadata> {
    const state = await this.readPlayState();
    return buildPlayHomeSiteSeo(playRobots(state));
  }

  async readPlaySongs(): Promise<SiteSeoMetadata> {
    const state = await this.readPlayState();
    return buildPlaySongsSiteSeo(
      state.publicReadEnabled ? "noindex,follow" : "noindex,nofollow",
    );
  }

  async findPlaySong(
    slug: string,
  ): Promise<SiteSeoMetadata | null> {
    const state = await this.readPlayState();
    if (!state.publicReadEnabled) {
      return buildPlaySongPlaceholderSeo(
        `/play/songs/${encodeURIComponent(slug)}`,
      );
    }
    const song = await this.reader.findPublishedPlaySongBySlug(slug);
    return song ? buildPlaySongSiteSeo(song, playRobots(state)) : null;
  }

  async findPlayMember(code: string): Promise<SiteSeoMetadata | null> {
    const state = await this.readPlayState();
    if (!state.publicReadEnabled) return buildPlaySongPlaceholderSeo(`/play/members/${encodeURIComponent(code)}`);
    const members = await this.reader.readPlayMemberSummaries();
    await this.assertPlaySnapshot(state);
    const member = members.find(item => item.code.toLowerCase() === code.toLowerCase());
    return member ? buildPlayMemberSiteSeo({ ...member, pageEligible: isOtwPlayMemberPageEligible(member, state) }) : null;
  }

  private async assertPlaySnapshot(state: PlaySeoState) {
    const current = await this.readPlayState();
    if (current.revision !== state.revision || current.publicReadEnabled !== state.publicReadEnabled ||
        current.navigationVisible !== state.navigationVisible) throw new Error("OTW Play SEO snapshot changed");
  }

  async buildSitemapUrls(): Promise<string[]> {
    const [feed, codes, playState] = await Promise.all([
      this.readFeed(),
      this.reader.listActiveProfileCodes(),
      this.readPlayState(),
    ]);
    const urls = new Set(STATIC_SITEMAP_URLS);
    if (feed.isPublic) urls.add(feed.metadata.canonical);
    for (const code of codes) urls.add(toSiteUrl(`/profile/${code}`));
    if (playState.navigationVisible) {
      const slugs = [
        ...new Set(await this.reader.listPublishedPlaySongSlugs()),
      ];
      if (slugs.length > MAX_PLAY_SITEMAP_SONGS) {
        throw new Error("OTW Play sitemap exceeds the supported song limit");
      }
      const members = await this.reader.readPlayMemberSummaries();
      await this.assertPlaySnapshot(playState);
      for (const member of members) {
        if (isOtwPlayMemberPageEligible(member, playState)) urls.add(toSiteUrl(`/play/members/${encodeURIComponent(member.code)}`));
      }
      urls.add(toSiteUrl("/play"));
      for (const slug of slugs) {
        urls.add(toSiteUrl(`/play/songs/${encodeURIComponent(slug)}`));
      }
    }
    return [...urls];
  }

  buildProfileMetadata(member: MemberProfileDto): SiteSeoMetadata {
    return buildProfileSiteSeo(member);
  }
}
