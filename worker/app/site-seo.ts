import type { Env } from "../platform/types";
import { normalizeAdminSettings } from "@contracts/configuration";
import { D1MemberReader } from "../features/members";
import { readContentAccessRevision } from "../features/content-access";
import {
  SiteSeoService,
  type SiteSeoReader,
} from "../features/seo";
import { DrizzleSettingsRepository } from "../features/configuration";
import { D1PublicCatalogReader } from "../features/otw-play";
import { getDb } from "../platform/db";
import { getWorkerSiteResources } from "../platform/site";

import { requiresOtwPlayMembership } from "@contracts/otw-play-access";
import { SiteContentService, CloudflareSiteContentCache, type SiteContentReader } from "../features/seo";
import { D1ScheduleBoardReader } from "../features/schedule-board";
import { D1NoticeGateway } from "../features/notices";
import { readSiteContentFeed } from "../features/member-posts";
import { readSiteContentYouTube } from "../features/youtube";
import { readSiteContentChzzk } from "../features/chzzk";

export const createSiteSeoDependencies = (env: Env,privateRead=false) => {
  const { site } = getWorkerSiteResources(env);
  const db = getDb(env);
  const members = new D1MemberReader(db, env.ASSET_BUCKET, false, getWorkerSiteResources(env).site.id);
  const settings = new DrizzleSettingsRepository(db);
  const play = new D1PublicCatalogReader(env.otw_db, getWorkerSiteResources(env).site.id);
  const profiles = new Map<string, ReturnType<D1MemberReader["findProfileByCode"]>>();
  let profileAccessRevision: Promise<number> | undefined;
  const reader: SiteSeoReader = {
    async readFeedState() {
      const stored = await settings.read([
        "x_posts_visibility",
        "naver_cafe_posts_enabled",
        "naver_cafe_posts_visibility",
      ]);
      const normalized = normalizeAdminSettings(stored).settings;
      return {
        xVisibility: normalized.x_posts_visibility,
        cafeEnabled: normalized.naver_cafe_posts_enabled === "true",
        cafeVisibility: normalized.naver_cafe_posts_visibility,
      };
    },
    async listActiveProfileCodes() {
      return (await members.listActive()).map(({ code }) => code);
    },
    findActiveProfileByCode(code) {
      if (!profiles.has(code)) {
        // The HTML access snapshot must start before its shared profile projection.
        profileAccessRevision ??= readContentAccessRevision(env.otw_db, site.id);
        profiles.set(code, profileAccessRevision.then(() => members.findProfileByCode(code, false)));
      }
      return profiles.get(code)!;
    },
    async readPlayState() {
      return { ...await play.readSeoState(), requiresMembership: requiresOtwPlayMembership(site.id) };
    },
    readPlayMemberSummaries() { return play.readMemberSummaries(); },
    listPublishedPlaySongSlugs() {
      return play.listPublishedSeoSongSlugs();
    },
    findPublishedPlaySongBySlug(slug) {
      return play.readPublishedSongSeoBySlug(slug);
    },
  };
  const board = new D1ScheduleBoardReader(db, false, site.id);
  const notices = new D1NoticeGateway(db,env.ASSET_BUCKET,false,undefined,site.id);
  const contentReader: SiteContentReader = {
    readAccessRevision: async () => {
      const revision = await readContentAccessRevision(env.otw_db, site.id);
      if (profileAccessRevision && revision !== await profileAccessRevision) throw new Error("Content access changed");
      return revision;
    },
    readSchedule: (start, end) => board.read(start, end),
    readNotices: today => notices.list({ includeInactive: false, type: null, today }),
    readFeed: state => readSiteContentFeed(env.otw_db, state, site.id),
    readVideos: async () => {
      const results = await Promise.allSettled([readSiteContentYouTube(env.otw_db, site.id), readSiteContentChzzk(env.otw_db, site.id)]);
      return results.flatMap((r, index) => r.status === "fulfilled" ? r.value : [{ id: index ? "chzzk" : "youtube", title: index ? "치지직" : "유튜브", status: "unavailable" as const, updatedAt: null, items: [] }]);
    },
    readPlaySongs: async slug => {
      const slugs = slug ? [slug] : await play.listPublishedSeoSongSlugs(10);
      const songs = await play.readSongContentBySlugs(slugs);
      return [{ id: "play", title: slug ? "공개 곡 정보" : "공개 곡", updatedAt: null, status: "available", items: songs.flatMap(song => song ? [
        { title: song.title, url: `/play/songs/${encodeURIComponent(song.slug)}` },
        ...song.performances.flatMap(performance => performance.sources.filter(source => source.sourceRole === "official" && ["playable", "unknown"].includes(source.availabilityStatus)).map(source => ({
          title: source.title ?? song.title,
          text: performance.participants.map(p => p.creditName).join(", "),
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(source.externalId)}`,
        }))),
      ] : []) }];
    },
  };
  return { seo: new SiteSeoService(reader, site), content: new SiteContentService(reader, contentReader, site, privateRead?undefined:new CloudflareSiteContentCache(site)) };
};

