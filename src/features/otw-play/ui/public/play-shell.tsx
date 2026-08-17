import { Link } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle, Music2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { useOtwPlayConfig } from "../../queries/use-public-catalog";
import { OtwPlayPlayerProvider } from "../../player/play-player-context";
import { OtwPlayNowPlayingPanel } from "../player/now-playing-panel";

const tabs = [
  { label: "발견", to: "/play" as const, search: undefined },
  { label: "전체 곡", to: "/play/songs" as const, search: {} },
  { label: "오리지널", to: "/play/songs" as const, search: { relation: "original" as const } },
  { label: "커버", to: "/play/songs" as const, search: { relation: "cover" as const } },
];

export function OtwPlayShell({ children }: { children: ReactNode }) {
  const config = useOtwPlayConfig();

  if (config.isPending) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> OTW Play 준비 상태 확인 중
        </div>
      </main>
    );
  }

  if (config.isError) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-5">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 size-8 text-amber-500" />
          <h1 className="text-lg font-semibold">카탈로그 상태를 확인하지 못했습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            OTW Play 동기화 상태를 확인한 뒤 다시 시도해 주세요.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void config.refetch()}>
            <RefreshCw /> 다시 시도
          </Button>
        </div>
      </main>
    );
  }

  if (!config.data?.data.publicReadEnabled) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-5">
        <div className="max-w-lg rounded-2xl border bg-card p-7 text-center shadow-sm">
          <Music2 className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">OTW Play 준비 중</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            오버더월의 오리지널곡과 공식 커버를 안전하게 정리하고 있습니다.
            공개 준비가 끝나면 이 주소에서 바로 만날 수 있습니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <OtwPlayPlayerProvider>
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--otw-1)_10%,transparent),transparent_38%)]">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex h-16 items-center gap-4 px-3 sm:px-5 lg:px-7 xl:px-8">
              <Link to="/play" className="flex items-center gap-2 font-semibold">
                <Music2 className="size-5" /> OTW Play
              </Link>
              <nav aria-label="OTW Play 탐색" className="ml-auto flex min-w-0 gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <Link
                    key={`${tab.label}:${JSON.stringify(tab.search)}`}
                    to={tab.to}
                    search={tab.search}
                    activeOptions={{ exact: true, includeSearch: true }}
                    activeProps={{ "aria-current": "page", className: "bg-foreground text-background" }}
                    inactiveProps={{ className: "text-muted-foreground hover:bg-accent hover:text-accent-foreground" }}
                    className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto pb-24 xl:pb-0">
            {children}
          </main>
        </div>
        <OtwPlayNowPlayingPanel />
      </div>
    </OtwPlayPlayerProvider>
  );
}
