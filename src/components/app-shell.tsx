import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  isNavItemActive,
  type NavItem,
  type NavSection,
  usePublicNavigationSections,
} from "@/components/app-navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PublicAppShellProps = {
  children: ReactNode;
};

type NavItemLinkProps = {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function PublicAppShell({ children }: PublicAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = usePublicNavigationSections();

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background font-sans text-foreground">
      <PublicSidebar
        sections={sections}
        collapsed
        className="hidden lg:flex xl:hidden"
      />
      <PublicSidebar sections={sections} className="hidden xl:flex" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md"
                aria-label="메뉴 열기"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 sm:max-w-80">
              <SheetTitle className="sr-only">주 메뉴</SheetTitle>
              <SheetDescription className="sr-only">
                오버더월 스케쥴표의 주요 화면과 외부 링크
              </SheetDescription>
              <MobileSidebarContent
                sections={sections}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <BrandLink compact onNavigate={() => setMobileOpen(false)} />

          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <AuthControls compact />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

function PublicSidebar({
  sections,
  collapsed = false,
  className,
}: {
  sections: NavSection[];
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16" : "w-64",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center justify-center border-b border-sidebar-border px-3",
          collapsed && "px-2",
        )}
      >
        <BrandLink collapsed={collapsed} />
      </div>

      <nav
        aria-label="주 메뉴"
        className={cn("min-h-0 flex-1 overflow-y-auto p-2", !collapsed && "p-3")}
      >
        <NavSections sections={sections} collapsed={collapsed} />
      </nav>

      <div
        className={cn(
          "flex shrink-0 items-center border-t border-sidebar-border",
          collapsed ? "h-16 justify-center px-0" : "h-14 px-3",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2",
            collapsed ? "flex-col gap-0" : "w-full justify-between",
          )}
        >
          <ModeToggle />
          <AuthControls compact={collapsed} />
        </div>
      </div>
    </aside>
  );
}

function MobileSidebarContent({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4 pr-10">
        <BrandLink onNavigate={onNavigate} />
      </div>
      <nav
        aria-label="모바일 메뉴"
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <NavSections sections={sections} onNavigate={onNavigate} />
      </nav>
    </div>
  );
}

function NavSections({
  sections,
  collapsed = false,
  onNavigate,
}: {
  sections: NavSection[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) =>
        section.items.length > 0 ? (
          <section key={section.id} className="space-y-1">
            {!collapsed && (
              <h2 className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">
                {section.label}
              </h2>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItemLink
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

function NavItemLink({ item, collapsed = false, onNavigate }: NavItemLinkProps) {
  const location = useLocation();
  const active = isNavItemActive(location.pathname, item);
  const Icon = item.icon;
  const label = item.requiresAuth ? `${item.label} (로그인 필요)` : item.label;
  const className = cn(
    "group relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-md text-sm font-medium outline-none transition-colors",
    collapsed ? "justify-center px-0" : "justify-start px-3",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-primary/25"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
  );
  const content = (
    <>
      {active && !collapsed ? (
        <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-sidebar-primary-foreground/90" />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && item.requiresAuth ? (
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          회원
        </span>
      ) : null}
    </>
  );
  const link =
    item.to !== undefined ? (
      <Link
        to={item.to}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={className}
        onClick={onNavigate}
      >
        {content}
      </Link>
    ) : (
      <a
        href={item.externalHref}
        target={item.externalHref?.startsWith("mailto:") ? undefined : "_blank"}
        rel={
          item.externalHref?.startsWith("mailto:")
            ? undefined
            : "noopener noreferrer"
        }
        aria-label={label}
        className={className}
        onClick={onNavigate}
      >
        {content}
      </a>
    );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function BrandLink({
  compact = false,
  collapsed = false,
  onNavigate,
}: {
  compact?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        collapsed && "justify-center",
      )}
      aria-label="오버더월 스케쥴표 홈"
      onClick={onNavigate}
    >
      <img
        src="/logo_otw.svg"
        width={90}
        height={25}
        alt="오버더월"
        className={cn(
          "h-auto shrink-0",
          collapsed ? "w-10" : compact ? "w-[82px]" : "w-[90px]",
        )}
      />
      {!compact && !collapsed ? (
        <span className="min-w-0 truncate text-base font-bold tracking-tight">
          스케쥴표
        </span>
      ) : null}
    </Link>
  );
}

function AuthControls({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-label="auth" className="flex items-center justify-center">
      <SignedOut>
        <SignInButton>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            className={cn("rounded-md", compact && "h-8 px-2.5")}
          >
            로그인
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: compact ? "w-8 h-8" : "w-9 h-9",
            },
          }}
        />
      </SignedIn>
    </div>
  );
}
