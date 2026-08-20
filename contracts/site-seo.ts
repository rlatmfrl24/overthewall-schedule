import type { MemberProfileDto } from "./members";

export const SITE_ORIGIN = "https://otw-schedule.info";
export const SITE_NAME = "오버더월";

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
    : new URL(value || "/", SITE_ORIGIN);
  const pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
};

export const toSiteUrl = (path: string): string =>
  new URL(normalizeSitePath(path), SITE_ORIGIN).toString();

const define = (definition: SiteSeoDefinition): SiteSeoMetadata => ({
  ...definition,
  path: normalizeSitePath(definition.path),
  canonical: toSiteUrl(definition.path),
});

export const FIXED_SITE_SEO = {
  "/": define({
    path: "/",
    title: "오버더월 오늘 방송 스케쥴",
    description:
      "오버더월 멤버들의 오늘 방송 일정, 방송 상태와 공지사항을 한눈에 확인하세요.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
  "/weekly": define({
    path: "/weekly",
    title: "오버더월 주간 스케쥴",
    description: "오버더월 멤버들의 이번 주 방송 일정을 요일별로 확인하세요.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
  "/notice": define({
    path: "/notice",
    title: "오버더월 공지사항·이벤트",
    description: "오버더월의 최신 공지사항과 이벤트 소식을 확인하세요.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
  "/vods": define({
    path: "/vods",
    title: "오버더월 VOD·클립",
    description:
      "오버더월 멤버들의 치지직 VOD, 클립과 유튜브 영상을 한곳에서 확인하세요.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
  "/multiview": define({
    path: "/multiview",
    title: "오버더월 멀티뷰",
    description:
      "여러 오버더월 멤버의 치지직 방송을 한 화면에서 선택해 시청하세요.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
  "/rights": define({
    path: "/rights",
    title: "저작권 및 권리 안내 | 오버더월",
    description:
      "OTW Schedule의 비공식 팬 운영 범위, 사이트 자체 제작물과 제3자 콘텐츠의 권리 구분 및 권리 요청 절차를 안내합니다.",
    robots: "index,follow",
    sitemap: true,
    ogType: "website",
  }),
} as const satisfies Record<string, SiteSeoMetadata>;

export const FIXED_SITE_PATHS = Object.keys(FIXED_SITE_SEO);

export const STATIC_SHELL_PATHS = [
  ...FIXED_SITE_PATHS,
  "/snapshot",
  "/admin",
  "/admin/operations",
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

export const buildFeedSiteSeo = (isPublic: boolean): SiteSeoMetadata =>
  define({
    path: "/feed",
    title: "오버더월 멤버 게시글",
    description:
      "오버더월 멤버들의 최신 X 게시글과 공식 팬카페 소식을 모아보세요.",
    robots: isPublic ? "index,follow" : "noindex,follow",
    sitemap: isPublic,
    ogType: "website",
  });

const normalizeDescription = (value: string | null | undefined): string =>
  [...(value ?? "").replace(/\s+/g, " ").trim()].slice(0, 155).join("");

const PLAY_DESCRIPTION =
  "오버더월 오리지널곡과 공식 커버곡을 탐색하고 공식 YouTube 영상으로 연속 재생하세요.";

export interface PlaySongSeoProjection {
  slug: string;
  title: string;
  originalArtistNames: readonly string[];
  mainVocalNames: readonly string[];
  thumbnailUrl: string | null;
}

export const buildPlayHomeSiteSeo = (robots: SiteRobots): SiteSeoMetadata =>
  define({
    path: "/play",
    title: "OTW Play | 오버더월",
    description: PLAY_DESCRIPTION,
    robots,
    sitemap: robots === "index,follow",
    ogType: "website",
  });

export const buildPlaySongsSiteSeo = (robots: SiteRobots): SiteSeoMetadata =>
  define({
    path: "/play/songs",
    title: "곡 검색 | OTW Play",
    description: PLAY_DESCRIPTION,
    robots,
    sitemap: false,
    ogType: "website",
  });

export const buildPlaySongSiteSeo = (
  song: PlaySongSeoProjection,
  robots: SiteRobots,
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
    title: `${song.title} | OTW Play`,
    description,
    robots,
    sitemap: robots === "index,follow",
    ogType: "website",
    ...(song.thumbnailUrl
      ? { image: new URL(song.thumbnailUrl, SITE_ORIGIN).toString() }
      : {}),
  });
};

export const buildPlaySongPlaceholderSeo = (
  path: string,
): SiteSeoMetadata =>
  define({
    path,
    title: "OTW Play | 오버더월",
    description: PLAY_DESCRIPTION,
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  });

export const buildPlayPrivateSiteSeo = (path: string): SiteSeoMetadata =>
  define({
    path,
    title: "OTW Play | 오버더월",
    description: "OTW Play 회원 전용 화면입니다.",
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  });

export const buildProfileSiteSeo = (
  member: Pick<MemberProfileDto, "code" | "name" | "introduction" | "profileImages">,
): SiteSeoMetadata => {
  const description =
    normalizeDescription(member.introduction) ||
    `${member.name}의 프로필과 공식 방송·SNS 링크를 확인하세요.`;
  const rawImage = member.profileImages[0]?.imageUrl;
  return define({
    path: `/profile/${member.code}`,
    title: `${member.name} 프로필 | 오버더월`,
    description,
    robots: "index,follow",
    sitemap: true,
    ogType: "profile",
    ...(rawImage ? { image: new URL(rawImage, SITE_ORIGIN).toString() } : {}),
  });
};

export const buildProfilePlaceholderSeo = (path: string): SiteSeoMetadata =>
  define({
    path,
    title: "멤버 프로필 | 오버더월",
    description: "오버더월 멤버 프로필을 확인하세요.",
    robots: "noindex,follow",
    sitemap: false,
    ogType: "profile",
  });

export const buildNotFoundSiteSeo = (path: string): SiteSeoMetadata =>
  define({
    path,
    title: "페이지를 찾을 수 없습니다 | 오버더월",
    description: "요청하신 오버더월 페이지를 찾을 수 없습니다.",
    robots: "noindex,nofollow",
    sitemap: false,
    ogType: "website",
  });

export const resolveSiteSeo = (rawPath: string): SiteSeoMetadata => {
  const path = normalizeSitePath(rawPath);
  const fixed = FIXED_SITE_SEO[path as keyof typeof FIXED_SITE_SEO];
  if (fixed) return fixed;
  if (path === "/feed" || path === "/cafe") return buildFeedSiteSeo(false);
  if (path === "/snapshot") {
    return define({
      path,
      title: "오버더월 스냅샷",
      description: "오버더월 일정 스냅샷 유틸리티 화면입니다.",
      robots: "noindex,follow",
      sitemap: false,
      ogType: "website",
    });
  }
  if (path === "/admin" || path.startsWith("/admin/")) {
    return define({
      path,
      title: "오버더월 관리자",
      description: "오버더월 관리자 화면입니다.",
      robots: "noindex,nofollow",
      sitemap: false,
      ogType: "website",
    });
  }
  if (path === "/play" || path.startsWith("/play/")) {
    if (path === "/play") return buildPlayHomeSiteSeo("noindex,nofollow");
    if (path === "/play/songs") {
      return buildPlaySongsSiteSeo("noindex,nofollow");
    }
    if (path === "/play/submit" || path === "/play/submissions") {
      return buildPlayPrivateSiteSeo(path);
    }
    if (/^\/play\/songs\/[^/]+$/.test(path)) {
      return buildPlaySongPlaceholderSeo(path);
    }
    return buildNotFoundSiteSeo(path);
  }
  if (/^\/profile\/[^/]+$/.test(path)) return buildProfilePlaceholderSeo(path);
  return buildNotFoundSiteSeo(path);
};

export const STATIC_SITEMAP_URLS = Object.values(FIXED_SITE_SEO).map(
  ({ canonical }) => canonical,
);
