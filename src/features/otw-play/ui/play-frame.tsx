import { Link } from "@tanstack/react-router";
import { ChevronDown, ListPlus, ListTodo, Music2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import "./play-design.css";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const catalogTabs = [
  { label: "발견", to: "/play" as const, search: undefined },
  { label: "곡 탐색", to: "/play/songs" as const, search: {} },
  { label: "멤버", to: "/play/members" as const, search: {} },
];

export function OtwPlayFrame({
  children,
  search,
  actions,
  status,
  showCatalogTabs = false,
  submissionActive = false,
}: {
  children: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  showCatalogTabs?: boolean;
  submissionActive?: boolean;
}) {
  const [compact, setCompact] = useState(false);
  return (
    <div
      onScrollCapture={(event) => { if (event.target instanceof HTMLElement && event.target.tagName === "MAIN") setCompact(event.target.scrollTop > 32); }}
      data-testid="otw-play-app-frame"
      className="otw-play-theme relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <OtwPlayHeader
        compact={compact}
        search={search}
        actions={actions}
        status={status}
        showCatalogTabs={showCatalogTabs}
        submissionActive={submissionActive}
      />
      {children}
    </div>
  );
}

function OtwPlayHeader({
  compact,
  search,
  actions,
  status,
  showCatalogTabs,
  submissionActive,
}: {
  search?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  showCatalogTabs: boolean;
  submissionActive: boolean;
  compact: boolean;
}) {
  return (
    <header data-compact={compact} className="play-header z-20 min-h-16 shrink-0 border-b">
      <div className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2 sm:px-5 lg:gap-4 lg:px-6">
        <Link
          to="/play"
          className="hidden shrink-0 items-center gap-2 font-semibold lg:flex"
        >
          <Music2 className="size-5" />
          <span className="hidden sm:inline">OTW Play</span>
        </Link>
        {search}
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          {status}
          {showCatalogTabs ? (
            <nav aria-label="OTW Play 탐색" className="flex min-w-0 gap-1 overflow-x-auto">
              {catalogTabs.map((tab) => (
                <Link
                  key={`${tab.label}:${JSON.stringify(tab.search)}`}
                  to={tab.to}
                  search={tab.search}
                  activeOptions={{ exact: true, includeSearch: false }}
                  activeProps={{
                    "aria-current": "page",
                    className: "bg-accent text-accent-foreground",
                  }}
                  inactiveProps={{
                    className:
                      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  }}
                  className="play-nav-link inline-flex shrink-0 items-center px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {actions}
          <SubmissionMenu active={submissionActive} />
        </div>
      </div>
    </header>
  );
}

function SubmissionMenu({ active }: { active: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={active ? "default" : "outline"}
          className="shrink-0 rounded-full"
          aria-label="곡 제안 메뉴"
        >
          <ListPlus />
          <span className="hidden xl:inline">곡 제안</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="otw-play-theme z-[80] w-44">
        <DropdownMenuItem asChild>
          <Link
            to="/play/submit"
            search={{ edit: undefined }}
            activeProps={{ "aria-current": "page", className: "bg-accent" }}
          >
            <ListPlus /> 새 곡 제안
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/play/submissions"
            activeProps={{ "aria-current": "page", className: "bg-accent" }}
          >
            <ListTodo /> 내 제안
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
