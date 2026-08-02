import {
  buildFeedSiteSeo,
  buildProfileSiteSeo,
  isFeedPublic,
  STATIC_SITEMAP_URLS,
  toSiteUrl,
  type SiteSeoMetadata,
} from "@contracts/site-seo";
import type { MemberProfileDto } from "@contracts/members";
import type { SiteSeoReader } from "./ports/site-seo-reader";

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

  async buildSitemapUrls(): Promise<string[]> {
    const [feed, codes] = await Promise.all([
      this.readFeed(),
      this.reader.listActiveProfileCodes(),
    ]);
    const urls = new Set(STATIC_SITEMAP_URLS);
    if (feed.isPublic) urls.add(feed.metadata.canonical);
    for (const code of codes) urls.add(toSiteUrl(`/profile/${code}`));
    return [...urls];
  }

  buildProfileMetadata(member: MemberProfileDto): SiteSeoMetadata {
    return buildProfileSiteSeo(member);
  }
}
