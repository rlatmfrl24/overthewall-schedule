import { buildFeedSiteSeo, buildProfileSiteSeo, resolveSiteSeo, SITE_ORIGIN } from "@contracts/site-seo";
import { kstDate, scheduleRange, safeSiteContentUrl, type SiteContentSection, type SitePublicContent } from "@contracts/site-public-content";
import type { SiteContentReader } from "./ports/site-content-reader";
import type { SiteSeoReader } from "./ports/site-seo-reader";
import { SiteSeoService } from "./site-seo-service";
import type { SiteContentCache } from "./ports/site-content-cache";

const section = (id: string, title: string, items: SiteContentSection["items"], updatedAt: string | null = null): SiteContentSection =>
  ({ id, title, items, updatedAt, status: items.length ? "available" : "empty" });

export class SiteContentService {
  private readonly seoReader: SiteSeoReader;
  private readonly reader: SiteContentReader;
  private readonly cache?: SiteContentCache;
  constructor(seoReader: SiteSeoReader, reader: SiteContentReader, cache?: SiteContentCache) {
    this.seoReader = seoReader;
    this.reader = reader;
    this.cache = cache;
  }

  async read(path: string, date?: string, now = Date.now()): Promise<SitePublicContent | null> {
    const seo = new SiteSeoService(this.seoReader);
    let metadata = resolveSiteSeo(path);
    let sections: SiteContentSection[] = [];
    let person: Record<string, unknown> | null = null;
    const today = kstDate(now);
    const selectedDate = path === "/" || path === "/weekly" ? date ?? today : null;
    if (selectedDate) {
      const cached = await this.cache?.get(path, selectedDate);
      if (cached && Date.parse(cached.expiresAt) > now) return cached;
      const { start, end } = scheduleRange(path, selectedDate);
      const board = await this.reader.readSchedule(start, end);
      const items: SiteContentSection["items"] = [];
      for (let day = start; day <= end; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
        for (const member of board.members) {
          const schedules = board.schedules.filter(s => s.date === day && s.member_uid === member.uid);
          if (!schedules.length) items.push({ title: `${day} · ${member.name}`, text: "일정 미등록", url: `/profile/${member.code}` });
          for (const schedule of schedules) items.push({ title: `${day} · ${member.name}`, text: [schedule.status, schedule.start_time || "시각 미정", schedule.title].filter(Boolean).join(" · "), url: `/profile/${member.code}` });
        }
      }
      sections = [section("schedule", `${start}${start === end ? "" : ` ~ ${end}`} 방송 일정 (한국 시간)`, items, board.updatedAt)];
    } else if (path.startsWith("/profile/")) {
      const member = await seo.findProfile(decodeURIComponent(path.slice(9)));
      if (!member) return null;
      metadata = buildProfileSiteSeo(member);
      sections = [section("profile", `${member.name} 소개`, [
        { title: member.name, text: member.introduction ?? undefined, image: metadata.image },
        ...(member.links ?? []).map(link => ({ title: link.label, url: link.url })),
      ])];
      person = { "@type": "Person", "@id": `${metadata.canonical}#person`, name: member.name, description: member.introduction || undefined, image: metadata.image,
        sameAs: (member.links ?? []).map(link => safeSiteContentUrl(link.url)).filter(Boolean) };
    } else if (path === "/notice") {
      const notices = await this.reader.readNotices(today);
      sections = [section("notices", "현재 공개 공지·이벤트", notices.sort((a, b) => b.id - a.id).slice(0, 10).map(n => ({
        title: n.content, url: `/notice?noticeId=${n.id}`, text: n.type === "event" ? "이벤트" : "공지",
      })))];
    } else if (path === "/feed") {
      const state = await this.seoReader.readFeedState();
      metadata = buildFeedSiteSeo(state.xVisibility === "public" || (state.cafeEnabled && state.cafeVisibility === "public"));
      sections = await this.reader.readFeed(state);
      // Recheck access after reading data, before constructing any public representation.
      if (JSON.stringify(state) !== JSON.stringify(await this.seoReader.readFeedState())) throw new Error("Feed visibility changed");
    } else if (path === "/vods") {
      sections = await this.reader.readVideos();
    } else if (path === "/rights") {
      sections = [section("rights", "비공식 팬 서비스 및 권리 안내", [
        { title: "OTW Schedule은 비공식 팬 운영 서비스입니다.", text: "오버더월·소속사·외부 플랫폼의 공식 서비스가 아닙니다." },
        { title: "제3자 콘텐츠의 권리는 원 권리자에게 있습니다.", text: "링크·임베드 제공이 복제·재배포 허락을 뜻하지 않습니다." },
        { title: "권리 침해 및 정정 요청", text: "대상 URL, 권리 관계, 원하는 조치와 회신 연락처를 이메일로 보내 주세요.", url: "mailto:397love@gmail.com" },
      ])];
    } else if (path === "/play" || path.startsWith("/play/songs/")) {
      const state = await this.seoReader.readPlayState();
      const slug = path === "/play" ? undefined : decodeURIComponent(path.slice(12));
      metadata = slug ? (await seo.findPlaySong(slug))! : await seo.readPlayHome();
      if (!metadata) return null;
      if (state.requiresMembership === false && state.publicReadEnabled && metadata.robots === "index,follow") {
        sections = await this.reader.readPlaySongs(slug);
        if (JSON.stringify(state) !== JSON.stringify(await this.seoReader.readPlayState())) throw new Error("Play access changed");
      }
    } else return null;

    sections = sections.map(s => ({ ...s, items: s.items.map(item => ({ ...item, url: safeSiteContentUrl(item.url), image: safeSiteContentUrl(item.image) })) }));
    const midnight = Date.parse(`${today}T00:00:00+09:00`) + 86_400_000;
    const expiresAt = new Date(Math.min(now + 300_000, midnight)).toISOString();
    const structuredData = metadata.robots !== "index,follow" ? null : {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, url: `${SITE_ORIGIN}/`, name: "OTW Schedule", description: "오버더월 비공식 팬 운영 일정·콘텐츠 서비스" },
        { "@type": person || path === "/rights" ? "WebPage" : "CollectionPage", "@id": `${metadata.canonical}#page`, url: metadata.canonical, name: metadata.title, description: metadata.description,
          isPartOf: { "@id": `${SITE_ORIGIN}/#website` }, ...(person ? { about: person } : {}),
          mainEntity: sections.filter(s => s.status !== "unavailable").map(s => ({ "@type": "ItemList", name: s.title,
            itemListElement: s.items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.title, description: item.text, url: item.url ? new URL(item.url, SITE_ORIGIN).toString() : undefined })) })) },
      ],
    };
    const content = { path: metadata.path, date: selectedDate, metadata, generatedAt: new Date(now).toISOString(), expiresAt, sections, structuredData };
    if (selectedDate) await this.cache?.put(content);
    return content;
  }
}
