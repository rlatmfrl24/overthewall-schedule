import { useUser } from "@clerk/clerk-react";
import {
  CalendarDays,
  CalendarRange,
  ExternalLink,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  MonitorPlay,
  Shield,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useNaverCafePostsConfig } from "@/hooks/use-naver-cafe-posts-config";
import { useXPostsConfig } from "@/hooks/use-x-posts-config";
import { isAdminUser } from "@/lib/admin";
import type {
  NaverCafePostsVisibility,
  XPostsVisibility,
} from "@/lib/types";

export type AppChromeMode = "public" | "admin" | "none";

export type InternalNavTo =
  | "/"
  | "/weekly"
  | "/vods"
  | "/feed"
  | "/notice"
  | "/multiview"
  | "/admin/notices";

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
          label: "공지사항",
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
          to: "/admin/notices",
        },
      ],
    });
  }

  return sections;
}

export function usePublicNavigationSections() {
  const { isLoaded, user } = useUser();
  const { visibility: xPostsVisibility } = useXPostsConfig();
  const { enabled: cafePostsEnabled, visibility: cafePostsVisibility } =
    useNaverCafePostsConfig();

  return getPublicNavigationSections({
    isAdmin: isLoaded && isAdminUser(user?.id),
    memberPosts: resolveMemberPostsNavState({
      xVisibility: xPostsVisibility,
      cafeEnabled: cafePostsEnabled,
      cafeVisibility: cafePostsVisibility,
    }),
  });
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (!item.to) return false;
  const current = pathname.replace(/\/+$/, "") || "/";
  const target = item.to.replace(/\/+$/, "") || "/";

  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}
