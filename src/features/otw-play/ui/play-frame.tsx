import type { OtwPlaySubmissionKind } from "@contracts/otw-play";
import { SectionNavigation } from "@/shared/ui/section-navigation";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clapperboard, Compass, ListMusic, ListPlus, ListTodo, Music2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { ReactNode } from "react";
import "./play-glass.css";
import { useMobilePlayScreen } from "./use-mobile-play-screen";
import { useButtonFeedback } from "./use-button-feedback";
import { usePlayTabIndicator } from "./use-play-tab-indicator";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const catalogTabs = [
  { label: "Discover", icon: Compass, to: "/play" as const, search: undefined },
  { label: "노래 클립", icon: Clapperboard, to: "/play/clips" as const, search: undefined },
  { label: "플레이리스트", icon: ListMusic, to: "/play/playlists" as const, search: undefined },
];

export function OtwPlayFrame({
  children,
  search,
  status,
  showCatalogTabs = false,
  showClips = false,
  submissionActive = false,
  submissionKind,
}: {
  children: ReactNode;
  search?: ReactNode;
  status?: ReactNode;
  showCatalogTabs?: boolean;
  showClips?: boolean;
  submissionActive?: boolean;
  submissionKind?: OtwPlaySubmissionKind;
}) {
  const feedback = useButtonFeedback();
  return (
    <div
      {...feedback}
      data-testid="otw-play-app-frame"
      className="otw-play-glass relative flex min-h-0 flex-1 flex-col overflow-clip bg-background"
    >
      <OtwPlayHeader
        search={search}
        status={status}
        showCatalogTabs={showCatalogTabs}
        showClips={showClips}
        submissionActive={submissionActive}
        submissionKind={submissionKind}
      />
      {children}
    </div>
  );
}

function OtwPlayHeader({
  search,
  status,
  showCatalogTabs,
  showClips,
  submissionActive,
  submissionKind,
}: {
  search?: ReactNode;
  status?: ReactNode;
  showCatalogTabs: boolean;
  showClips: boolean;
  submissionActive: boolean;
  submissionKind?: OtwPlaySubmissionKind;
}) {
  const mobile = useMobilePlayScreen();
  const indicatorRef = usePlayTabIndicator(showCatalogTabs);
  return (
    <header className="play-header z-20 shrink-0 border-b">
      <div className="play-header-layout">
        <div className="play-header-navigation">
        <Link
          to="/play"
          aria-label="OTW Play 홈"
          className="play-wordmark flex shrink-0 items-center gap-2 font-bold"
        >
          <Music2 className="size-5" />
          <span>OTW Play</span>
        </Link>
          {showCatalogTabs ? (
            <SectionNavigation label="OTW Play 탐색" className="play-tabs">
              <span ref={indicatorRef} className="play-tab-indicator" aria-hidden="true" hidden />
              {catalogTabs.filter(tab => showClips || tab.to !== "/play/clips").map((tab) => (
                <Tooltip key={tab.to} delayDuration={250}>
                <TooltipTrigger asChild>
                <Link
                  aria-label={tab.label}
                  to={tab.to}
                  search={tab.search}
                  activeOptions={{ exact: tab.to !== "/play/playlists", includeSearch: false }}
                  activeProps={{
                    "aria-current": "page",
                    className: "play-tab-active",
                  }}
                  inactiveProps={{
                    className:
                      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  }}
                  className="inline-flex shrink-0 items-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <tab.icon className="play-tab-icon" aria-hidden="true" />
                  <span>{tab.label}</span>
                </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8} className="z-[80]">{tab.label}</TooltipContent>
                </Tooltip>
              ))}
            </SectionNavigation>
          ) : null}
        </div>
        <div className="play-header-actions">
          {status}
          <div className="play-header-search-slot">{search}</div>
          {!mobile && <SubmissionMenu active={submissionActive} kind={submissionKind} />}
        </div>
      </div>
    </header>
  );
}

function SubmissionMenu({ active, kind }: { active: boolean; kind?: OtwPlaySubmissionKind }) {
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
      <DropdownMenuContent align="end" className="z-[80] w-44">
        <DropdownMenuItem asChild>
          <Link
            to="/play/submit"
            search={{ edit: undefined, submissionKind: kind }}
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
