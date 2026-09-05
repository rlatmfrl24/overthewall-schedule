import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import { ModeToggle } from "@/app/layout/mode-toggle";
import { ConsoleSearchContext, validateConsoleSearch, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { Link, useBlocker, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/shared/lib/utils";
import {
  Activity,
  Calendar,
  Settings,
  Image,
  LayoutDashboard,
  History,
  LogOut,
  Menu,
  Music2,
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
import { useCallback, useRef, useState } from "react";

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
  { title: "관리 업무", items: [
    { label: "대시보드", icon: Activity, href: "/admin/operations" },
    { label: "자동 수집 스케쥴 검토", icon: Calendar, href: "/admin/review" },
    { label: "수집·소스", icon: Settings, href: "/admin/collection" },
    { label: "OTW Play", icon: Music2, href: "/admin/otw-play" },
    { label: "콘텐츠", icon: LayoutDashboard, href: "/admin/content" },
    { label: "자원·보존", icon: Image, href: "/admin/resources" },
    { label: "실행·변경 이력", icon: History, href: "/admin/history" },
  ] },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dirtyForms = useRef(new Set<string>());
  const registerDirty = useCallback((id: string, dirty: boolean) => { if (dirty) dirtyForms.current.add(id); else dirtyForms.current.delete(id); }, []);
  const [discardRequest, setDiscardRequest] = useState<((discard: boolean) => void) | null>(null);
  const confirmDiscard = useCallback(() => new Promise<boolean>((resolve) => setDiscardRequest(() => resolve)), []);
  const resolveDiscard = (discard: boolean) => { discardRequest?.(discard); setDiscardRequest(null); };
  useBlocker({shouldBlockFn: async () => dirtyForms.current.size > 0 && !await confirmDiscard(), enableBeforeUnload: false});
  const search = validateConsoleSearch(Object.fromEntries(new URLSearchParams(location.searchStr)));
  const updateSearch = useCallback((patch: ConsoleSearch, replace = true) => { void navigate({to: ".", search: (previous: ConsoleSearch) => ({...previous, ...patch}), replace, resetScroll: false}); }, [navigate]);

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

      <nav aria-label="관리 업무" className="flex-1 p-3 space-y-4">
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
                    "w-full justify-start gap-2.5 px-2.5 py-2 h-auto min-h-9 text-sm text-left",
                    active &&
                      "bg-primary/10 text-primary font-semibold hover:bg-primary/20",
                    !active && "text-muted-foreground",
                  )}
                  asChild
                >
                  <Link aria-current={active ? "page" : undefined} to={item.href} onClick={() => setIsMobileOpen(false)}>
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 whitespace-normal leading-tight">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t space-y-3">
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">화면 테마</span><ModeToggle /></div>
        <Button asChild variant="outline" className="w-full gap-2 justify-start h-9">
          <Link to="/">
            <LogOut className="w-4 h-4" />
            사이트로 돌아가기
          </Link>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden admin-console bg-muted/20 md:flex-row">
      <AlertDialog open={discardRequest !== null} onOpenChange={(open) => { if (!open) resolveDiscard(false); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>저장하지 않은 변경 사항</AlertDialogTitle><AlertDialogDescription>입력 내용을 버리고 이동할까요? 계속 편집하면 입력값을 유지합니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => resolveDiscard(false)}>계속 편집</AlertDialogCancel><AlertDialogAction onClick={() => resolveDiscard(true)}>변경 버리고 이동</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {/* Mobile Header */}
      <div className="md:hidden border-b bg-background p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <span className="font-semibold">Admin Center</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="관리자 메뉴 열기">
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
      <div className="hidden h-full w-[216px] shrink-0 overflow-y-auto border-r bg-card md:block">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-muted/10">
        <div className="w-full min-h-full animate-in fade-in slide-in-from-bottom-4 p-3 pb-8 duration-500 md:p-5 md:pb-10">
          <UnsavedChangesContext value={{register: registerDirty, confirm: confirmDiscard}}><ConsoleSearchContext value={[search, updateSearch]}>{children}</ConsoleSearchContext></UnsavedChangesContext>
        </div>
      </main>
    </div>
  );
}
