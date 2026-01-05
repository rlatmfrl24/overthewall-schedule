import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Settings,
  LayoutDashboard,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_ITEMS = [
  {
    label: "공지사항 관리",
    icon: Megaphone,
    href: "/admin", // active check will be needed if we add more pages
    active: true,
  },
  {
    label: "설정 (준비중)",
    icon: Settings,
    href: "#",
    active: false,
    disabled: true,
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r">
      <div className="p-6 border-b flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg">Admin Center</span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {SIDEBAR_ITEMS.map((item) => (
          <Button
            key={item.label}
            variant={item.active ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start gap-3 px-3",
              item.active &&
                "bg-primary/10 text-primary font-semibold hover:bg-primary/20",
              !item.active && "text-muted-foreground"
            )}
            disabled={item.disabled}
            asChild={!item.disabled}
          >
            {item.disabled ? (
              <span className="flex items-center gap-3">
                <item.icon className="w-4 h-4" />
                {item.label}
              </span>
            ) : (
              <Link to={item.href} onClick={() => setIsMobileOpen(false)}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )}
          </Button>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Link to="/">
          <Button variant="outline" className="w-full gap-2 justify-start">
            <LogOut className="w-4 h-4" />
            사이트로 돌아가기
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen container mx-auto bg-muted/20 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden border-b bg-background p-4 flex items-center justify-between">
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
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto h-screen bg-muted/10">
        <div className="w-full h-full p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
