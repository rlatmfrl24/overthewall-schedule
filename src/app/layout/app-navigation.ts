import { useUser } from "@clerk/clerk-react";
import {
  CalendarDays,
  CalendarRange,
  ExternalLink,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  MonitorPlay,
  Music2,
  Shield,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useNaverCafePostsConfig } from "@/features/naver-cafe";
import { useXPostsConfig } from "@/features/x-posts";
import { useOtwPlayConfig } from "@/features/otw-play";
import { isAdminUser } from "@/app/admin";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";

export type AppChromeMode = "public" | "admin" | "none";
export type PublicSidebarMode = "compact" | "responsive";

export type InternalNavTo =
  | "/"
  | "/weekly"
  | "/vods"
  | "/play"
  | "/multiview"
  | "/feed"
  | "/notice"
  | "/admin/operations";

export type NavGroup =
  | "schedule"
  | "content"
  | "external"
  | "admin";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  to?: InternalNavTo;
  externalHref?: string;
  requiresAuth?: boolean;
}

export interface NavSection {
  id: NavGroup;
  label: string;
  items: NavItem[];
}

type MemberPostsNavState = {
  visible: boolean;
  requiresAuth: boolean;
};

type PublicNavigationOptions = {
  isAdmin: boolean;
  memberPosts: MemberPostsNavState;
  otwPlayVisible?: boolean;
};

const FAN_CAFE_URL = "https://cafe.naver.com/otwoffical";

export function getAppChromeMode(pathname: string): AppChromeMode {
  if (pathname.startsWith("/snapshot") || pathname.startsWith("/profile/")) {
    return "none";
  }

  if (pathname.startsWith("/admin")) {
    return "admin";
  }

  return "public";
}

export function getPublicSidebarMode(pathname: string): PublicSidebarMode {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/multiview" ||
    normalized.startsWith("/multiview/")
    ? "compact"
    : "responsive";
}

export function resolveMemberPostsNavState({
  xVisibility,
  cafeEnabled,
  cafeVisibility,
}: {
  xVisibility: XPostsVisibility;
  cafeEnabled: boolean;
  cafeVisibility: NaverCafePostsVisibility;
}): MemberPostsNavState {
  const visibleVisibilities = [
    xVisibility,
    cafeEnabled ? cafeVisibility : "private",
  ];
  const hasPublicSource = visibleVisibilities.includes("public");
  const hasMembersSource = visibleVisibilities.includes("members");

  return {
    visible: hasPublicSource || hasMembersSource,
    requiresAuth: !hasPublicSource && hasMembersSource,
  };
}

export function getPublicNavigationSections({
  isAdmin,
  memberPosts,
  otwPlayVisible = false,
}: PublicNavigationOptions): NavSection[] {
  const sections: NavSection[] = [
    {
      id: "schedule",
      label: "일정",
      items: [
        {
          id: "daily",
          label: "오늘 스케쥴표",
          icon: CalendarDays,
          group: "schedule",
          to: "/",
        },
        {
          id: "weekly",
          label: "주간 스케쥴표",
          icon: CalendarRange,
          group: "schedule",
          to: "/weekly",
        },
      ],
    },
    {
      id: "content",
      label: "콘텐츠",
      items: [
        {
          id: "notice",
          label: "공지사항&이벤트",
          icon: Megaphone,
          group: "content",
          to: "/notice",
        },
        {
          id: "vods",
          label: "VOD & 클립",
          icon: Video,
          group: "content",
          to: "/vods",
        },
        ...(isAdmin && otwPlayVisible
          ? [
              {
                id: "otw-play",
                label: "OTW Play",
                icon: Music2,
                group: "content" as const,
                to: "/play" as const,
              },
            ]
          : []),
        ...(memberPosts.visible
          ? [
              {
                id: "feed",
                label: "멤버 게시글",
                icon: memberPosts.requiresAuth ? LockKeyhole : MessageSquareText,
                group: "content" as const,
                to: "/feed" as const,
                requiresAuth: memberPosts.requiresAuth,
              },
            ]
          : []),
        {
          id: "multiview",
          label: "오버더월 멀티뷰",
          icon: MonitorPlay,
          group: "content",
          to: "/multiview",
        },
      ],
    },
    {
      id: "external",
      label: "외부 링크",
      items: [
        {
          id: "fan-cafe",
          label: "공식 팬카페",
          icon: ExternalLink,
          group: "external",
          externalHref: FAN_CAFE_URL,
        },
      ],
    },
  ];

  if (isAdmin) {
    sections.push({
      id: "admin",
      label: "운영",
      items: [
        {
          id: "admin",
          label: "관리자",
          icon: Shield,
          group: "admin",
          to: "/admin/operations",
        },
      ],
    });
  }

  return sections;
}

export function usePublicNavigationSections() {
  const { isLoaded, user } = useUser();
  const isAdmin = isLoaded && isAdminUser(user?.id);
  const { visibility: xPostsVisibility } = useXPostsConfig();
  const { enabled: cafePostsEnabled, visibility: cafePostsVisibility } =
    useNaverCafePostsConfig();
  const otwPlayConfig = useOtwPlayConfig({ enabled: isAdmin });

  return getPublicNavigationSections({
    isAdmin,
    memberPosts: resolveMemberPostsNavState({
      xVisibility: xPostsVisibility,
      cafeEnabled: cafePostsEnabled,
      cafeVisibility: cafePostsVisibility,
    }),
    otwPlayVisible: Boolean(
      otwPlayConfig.data?.data.publicReadEnabled &&
        otwPlayConfig.data.data.navigationVisible,
    ),
  });
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (!item.to) return false;
  const current = pathname.replace(/\/+$/, "") || "/";
  const target = item.to.replace(/\/+$/, "") || "/";

  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}
