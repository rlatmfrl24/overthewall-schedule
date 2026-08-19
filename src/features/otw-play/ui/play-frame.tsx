import { Link } from "@tanstack/react-router";
import { ChevronDown, ListPlus, ListTodo, Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const catalogTabs = [
  { label: "발견", to: "/play" as const, search: undefined },
  { label: "곡 검색", to: "/play/songs" as const, search: {} },
];

export function OtwPlayFrame({
  children,
  search,
  status,
  showCatalogTabs = false,
  submissionActive = false,
}: {
  children: ReactNode;
  search?: ReactNode;
  status?: ReactNode;
  showCatalogTabs?: boolean;
  submissionActive?: boolean;
}) {
  return (
    <div
      data-testid="otw-play-app-frame"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <OtwPlayHeader
        search={search}
        status={status}
        showCatalogTabs={showCatalogTabs}
        submissionActive={submissionActive}
      />
      {children}
    </div>
  );
}

function OtwPlayHeader({
  search,
  status,
  showCatalogTabs,
  submissionActive,
}: {
  search?: ReactNode;
  status?: ReactNode;
  showCatalogTabs: boolean;
  submissionActive: boolean;
}) {
  return (
    <header className="z-20 h-16 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-5 lg:gap-5 lg:px-6">
        <Link
          to={showCatalogTabs ? "/play" : "/play/submit"}
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <Music2 className="size-5" />
          <span className="hidden sm:inline">OTW Play</span>
        </Link>
        {search ?? <span aria-hidden="true" />}
        <div className="flex min-w-0 items-center justify-end gap-2">
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
                    className: "bg-foreground text-background",
                  }}
                  inactiveProps={{
                    className:
                      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  }}
                  className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
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
          <span className="hidden sm:inline">곡 제안</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link
            to="/play/submit"
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
