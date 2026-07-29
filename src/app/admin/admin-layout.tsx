import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/shared/lib/utils";
import {
  Activity,
  Megaphone,
  Calendar,
  Settings,
  Image,
  LayoutDashboard,
  History,
  LogOut,
  Menu,
  MessageSquareText,
  Scissors,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface SidebarItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: "운영 대시보드",
    items: [
      {
        label: "운영 상태",
        icon: Activity,
        href: "/admin/operations",
      },
      {
        label: "YouTube 캐시",
        icon: Youtube,
        href: "/admin/youtube-cache",
      },
      {
        label: "자동 업데이트",
        icon: Settings,
        href: "/admin/settings",
      },
      {
        label: "멤버 게시글",
        icon: MessageSquareText,
        href: "/admin/member-posts",
      },
      {
        label: "업데이트 로그",
        icon: History,
        href: "/admin/logs",
      },
    ],
  },
  {
    title: "콘텐츠 관리",
    items: [
      {
        label: "공지사항",
        icon: Megaphone,
        href: "/admin/notices",
      },
      {
        label: "D-Day",
        icon: Calendar,
        href: "/admin/ddays",
      },
      {
        label: "키리누키 채널",
        icon: Scissors,
        href: "/admin/kirinuki",
      },
      {
        label: "스냅샷 프리뷰",
        icon: Image,
        href: "/admin/snapshot",
      },
    ],
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/admin/operations") {
      return (
        location.pathname === "/admin" || location.pathname === "/admin/operations"
      );
    }
    return location.pathname === href;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r">
      <div className="p-4 border-b flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6 text-primary" />
        <span className="font-bold text-base">Admin Center</span>
      </div>

      <nav className="flex-1 p-3 space-y-4">
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Button
                  key={item.label}
                  variant={active ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-2.5 px-2.5 h-8 text-sm",
                    active &&
                      "bg-primary/10 text-primary font-semibold hover:bg-primary/20",
                    !active && "text-muted-foreground",
                  )}
                  asChild
                >
                  <Link to={item.href} onClick={() => setIsMobileOpen(false)}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Link to="/">
          <Button variant="outline" className="w-full gap-2 justify-start h-9">
            <LogOut className="w-4 h-4" />
            사이트로 돌아가기
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/20 md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden border-b bg-background p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <span className="font-semibold">Admin Center</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">
            <SheetTitle className="sr-only">Admin Center 메뉴</SheetTitle>
            <SheetDescription className="sr-only">
              관리자 화면 이동 메뉴
            </SheetDescription>
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden h-full w-64 shrink-0 overflow-y-auto border-r bg-card md:block">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-muted/10">
        <div className="w-full min-h-full animate-in fade-in slide-in-from-bottom-4 p-3 pb-8 duration-500 md:p-5 md:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
