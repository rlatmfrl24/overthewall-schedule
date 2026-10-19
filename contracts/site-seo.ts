import type { MemberProfileDto } from "./members";

import { requireSiteOrigin, type SiteDefinition } from "./site-definition";

export type SiteRobots =
  | "index,follow"
  | "noindex,follow"
  | "noindex,nofollow";

export interface SiteSeoMetadata {
  path: string;
  title: string;
  description: string;
  robots: SiteRobots;
  canonical: string;
  sitemap: boolean;
  ogType: "website" | "profile";
  image?: string;
}

type SiteSeoDefinition = Omit<SiteSeoMetadata, "canonical">;

export const normalizeSitePath = (value: string): string => {
  const parsed = value.startsWith("http://") || value.startsWith("https://")
    ? new URL(value)
    : new URL(value || "/", "http://localhost");
  const pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
};

export const toSiteUrl = (path: string, site: SiteDefinition): string =>
  new URL(normalizeSitePath(path), requireSiteOrigin(site)).toString();

const define = (definition: SiteSeoDefinition, site: SiteDefinition): SiteSeoMetadata => ({
  ...definition,
  path: normalizeSitePath(definition.path),
  canonical: toSiteUrl(definition.path, site),
});

export const buildFixedSiteSeo = (site: SiteDefinition) => ({
  "/": define({
    path: "/",
    title: `${site.siteName} 오늘 방송 스케쥴`,
    description:
      `${site.siteName} 멤버들의 오늘 방송 일정, 방송 상태와 공지사항을 한눈에 확인하세요.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
  "/weekly": define({
    path: "/weekly",
    title: `${site.siteName} 주간 스케쥴`,
    description: `${site.siteName} 멤버들의 이번 주 방송 일정을 요일별로 확인하세요.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
  "/notice": define({
    path: "/notice",
    title: `${site.siteName} 공지사항·이벤트`,
    description: `${site.siteName}의 최신 공지사항과 이벤트 소식을 확인하세요.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
  "/vods": define({
    path: "/vods",
    title: `${site.siteName} VOD·클립`,
    description:
      `${site.siteName} 멤버들의 치지직 VOD, 클립과 유튜브 영상을 한곳에서 확인하세요.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
  "/multiview": define({
    path: "/multiview",
    title: `${site.siteName} 멀티뷰`,
    description:
      `여러 ${site.siteName} 멤버의 치지직 방송을 한 화면에서 선택해 시청하세요.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
  "/rights": define({
    path: "/rights",
    title: `저작권 및 권리 안내 | ${site.siteName}`,
    description:
      `${site.serviceName}의 비공식 팬 운영 범위, 사이트 자체 제작물과 제3자 콘텐츠의 권리 구분 및 권리 요청 절차를 안내합니다.`,
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }, site),
} as const satisfies Record<string, SiteSeoMetadata>);

export const FIXED_SITE_PATHS = ["/", "/weekly", "/notice", "/vods", "/multiview", "/rights"] as const;

export const STATIC_SHELL_PATHS = [
  ...FIXED_SITE_PATHS,
  "/snapshot",
  "/admin",
  "/admin/operations",
  "/admin/review",
  "/admin/collection",
  "/admin/content",
  "/admin/resources",
  "/admin/history",
  "/admin/settings",
  "/admin/otw-play",
  "/admin/notices",
  "/admin/ddays",
  "/admin/logs",
  "/admin/snapshot",
  "/admin/member-posts",
  "/admin/youtube-cache",
  "/admin/kirinuki",
] as const;

export const isFeedPublic = (input: {
  xVisibility: string;
  cafeEnabled: boolean;
  cafeVisibility: string;
}): boolean =>
  input.xVisibility === "public" ||
  (input.cafeEnabled && input.cafeVisibility === "public");

export const buildFeedSiteSeo = (isPublic: boolean, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path: "/feed",
    title: `${site.siteName} 멤버 게시글`,
    description: `${site.siteName} 멤버들의 최신 게시글과 소식을 모아보세요.`,
    robots: isPublic ? "index,follow" : "noindex,follow",
    sitemap: isPublic,
    ogType: "website",
  }, site);

const normalizeDescription = (value: string | null | undefined): string =>
  [...(value ?? "").replace(/\s+/g, " ").trim()].slice(0, 155).join("");

const playDescription = (site: SiteDefinition) =>
  `${site.siteName} 오리지널곡과 공식 커버곡을 탐색하고 공식 YouTube 영상으로 연속 재생하세요.`;

export interface PlaySongSeoProjection {
  slug: string;
  title: string;
  originalArtistNames: readonly string[];
  mainVocalNames: readonly string[];
  thumbnailUrl: string | null;
}

export const buildPlayHomeSiteSeo = (robots: SiteRobots, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path: "/play",
    title: `${site.playName} | ${site.siteName}`,
    description: playDescription(site),
    robots,
    sitemap: robots === "index,follow",
    ogType: "website",
  }, site);

export const buildPlaySongsSiteSeo = (robots: SiteRobots, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path: "/play/songs",
    title: `곡 검색 | ${site.playName}`,
    description: playDescription(site),
    robots,
    sitemap: false,
    ogType: "website",
  }, site);

export const buildPlaySongSiteSeo = (
  song: PlaySongSeoProjection,
  robots: SiteRobots,
  site: SiteDefinition,
): SiteSeoMetadata => {
  const artist = song.originalArtistNames.join(", ");
  const vocals = song.mainVocalNames.join(", ");
  const description = normalizeDescription(
    [
      artist ? `원곡 가수 ${artist}` : null,
      `곡 ${song.title}`,
      vocals ? `메인 보컬 ${vocals}` : null,
      "공식 YouTube 영상으로 감상하세요.",
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  );
  return define({
    path: `/play/songs/${encodeURIComponent(song.slug)}`,
    title: `${song.title} | ${site.playName}`,
    description,
    robots,
    sitemap: robots === "index,follow",
    ogType: "website",
    ...(song.thumbnailUrl
      ? { image: new URL(song.thumbnailUrl, requireSiteOrigin(site)).toString() }
      : {}),
  }, site);
};

export const buildPlaySongPlaceholderSeo = (
  path: string,
  site: SiteDefinition,
): SiteSeoMetadata =>
  define({
    path,
    title: `${site.playName} | ${site.siteName}`,
    description: playDescription(site),
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  }, site);

export const buildPlayClipsSiteSeo = (path: string, site: SiteDefinition): SiteSeoMetadata =>
  define({ path, title: `노래 클립 | ${site.playName}`, description: "멤버가 방송에서 부른 노래 클립을 찾아 듣습니다.", robots: "noindex,follow", sitemap: false, ogType: "website" }, site);

export const buildPlayPrivateSiteSeo = (path: string, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path,
    title: `${site.playName} | ${site.siteName}`,
    description: `${site.playName} 회원 전용 화면입니다.`,
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  }, site);

export const buildProfileSiteSeo = (
  member: Pick<MemberProfileDto, "code" | "name" | "introduction" | "profileImages">,
  site: SiteDefinition,
): SiteSeoMetadata => {
  const description =
    normalizeDescription(member.introduction) ||
    `${member.name}의 프로필과 공식 방송·SNS 링크를 확인하세요.`;
  const rawImage = [...member.profileImages].sort((a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0))[0]?.imageUrl || `/profile/${member.code}.webp`;
  return define({
    path: `/profile/${member.code}`,
    title: `${member.name} 프로필 | ${site.siteName}`,
    description,
    robots: "index,follow",
    sitemap: true,
    ogType: "profile",
    ...(rawImage ? { image: new URL(rawImage, requireSiteOrigin(site)).toString() } : {}),
  }, site);
};

export const buildProfilePlaceholderSeo = (path: string, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path,
    title: `멤버 프로필 | ${site.siteName}`,
    description: `${site.siteName} 멤버 프로필을 확인하세요.`,
    robots: "noindex,follow",
    sitemap: false,
    ogType: "profile",
  }, site);

export const buildNotFoundSiteSeo = (path: string, site: SiteDefinition): SiteSeoMetadata =>
  define({
    path,
    title: `페이지를 찾을 수 없습니다 | ${site.siteName}`,
    description: `요청하신 ${site.siteName} 페이지를 찾을 수 없습니다.`,
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  }, site);

export const resolveSiteSeo = (rawPath: string, site: SiteDefinition): SiteSeoMetadata => {
  const path = normalizeSitePath(rawPath);
  const definitions = buildFixedSiteSeo(site);
  const fixed = definitions[path as keyof typeof definitions];
  if (fixed) return fixed;
  if (path === "/feed" || path === "/cafe") return buildFeedSiteSeo(false, site);
  if (path === "/snapshot") {
    return define({
      path,
      title: `${site.siteName} 스냅샷`,
      description: `${site.siteName} 일정 스냅샷 유틸리티 화면입니다.`,
      robots: "noindex,follow",
      sitemap: false,
      ogType: "website",
    }, site);
  }
  if (path === "/admin" || path.startsWith("/admin/")) {
    return define({
      path,
      title: `${site.siteName} 관리자`,
      description: `${site.siteName} 관리자 화면입니다.`,
      robots: "noindex,nofollow",
      sitemap: false,
      ogType: "website",
    }, site);
  }
  if (path === "/play" || path.startsWith("/play/")) {
    if (path === "/play/clips" || /^\/play\/clips\/[^/]+$/.test(path)) return buildPlayClipsSiteSeo(path, site);
    if (path === "/play/playlists" || path.startsWith("/play/playlists/")) {
      return define({ path, title: `플레이리스트 | ${site.playName}`, description: "오리지널, 커버와 멤버별 가창을 모아 듣고 나만의 플레이리스트를 만들어 보세요.", robots: "noindex,nofollow", sitemap: false, ogType: "website" }, site);
    }
    if (path === "/play") return buildPlayHomeSiteSeo("noindex,nofollow", site);
    if (path === "/play/songs") {
      return buildPlaySongsSiteSeo("noindex,nofollow", site);
    }
    if (path === "/play/submit" || path === "/play/submissions") {
      return buildPlayPrivateSiteSeo(path, site);
    }
    if (/^\/play\/(songs|members)\/[^/]+$/.test(path)) {
      return buildPlaySongPlaceholderSeo(path, site);
    }
    return buildNotFoundSiteSeo(path, site);
  }
  if (/^\/profile\/[^/]+$/.test(path)) return buildProfilePlaceholderSeo(path, site);
  return buildNotFoundSiteSeo(path, site);
};

export const buildStaticSitemapUrls = (site: SiteDefinition): string[] =>
  Object.values(buildFixedSiteSeo(site)).map(({ canonical }) => canonical);
