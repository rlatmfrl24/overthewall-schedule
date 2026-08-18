import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Eye,
  LoaderCircle,
  Music2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { isAdminUser } from "@/app/admin";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  OtwPlayCatalogRequestProvider,
  useOtwPlayConfig,
} from "../../queries/use-public-catalog";
import { OtwPlayPlayerProvider } from "../../player/play-player-context";
import {
  OtwPlayPlaybackBar,
  OtwPlayQueuePanel,
} from "../player/now-playing-panel";

const tabs = [
  { label: "홈", to: "/play" as const, search: undefined },
  { label: "발견", to: "/play/discover" as const, search: undefined },
  { label: "전체 곡", to: "/play/songs" as const, search: {} },
  { label: "오리지널", to: "/play/songs" as const, search: { relation: "original" as const } },
  { label: "커버", to: "/play/songs" as const, search: { relation: "cover" as const } },
];

export function OtwPlayShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> 관리자 권한 확인 중
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <OtwPlayAccessCard
        title="로그인이 필요합니다"
        description="현재 OTW Play 화면은 관리자만 이용할 수 있습니다."
      >
        <SignInButton>
          <Button className="w-full rounded-full">로그인</Button>
        </SignInButton>
      </OtwPlayAccessCard>
    );
  }

  if (!isAdminUser(user?.id)) {
    return (
      <OtwPlayAccessCard
        title="접근 권한이 없습니다"
        description="관리자 권한이 있는 계정으로 로그인해 주세요."
      />
    );
  }

  return <AuthorizedOtwPlayShell>{children}</AuthorizedOtwPlayShell>;
}

function OtwPlayAccessCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-0 w-full flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
          <ShieldAlert className="mb-2 size-10 text-amber-500" />
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {children}
          <Link to="/" className="w-full">
            <Button variant="ghost" className="w-full rounded-full">
              홈으로
            </Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function AuthorizedOtwPlayShell({ children }: { children: ReactNode }) {
  return (
    <OtwPlayCatalogRequestProvider adminPreview>
      <AdminPreviewOtwPlayShell>{children}</AdminPreviewOtwPlayShell>
    </OtwPlayCatalogRequestProvider>
  );
}

function AdminPreviewOtwPlayShell({ children }: { children: ReactNode }) {
  const config = useOtwPlayConfig({ adminPreview: true });

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

  return (
    <OtwPlayPlayerProvider adminPreview>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
        <header className="z-20 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center gap-4 px-3 sm:px-5 lg:px-7 xl:px-8">
            <Link to="/play" className="flex items-center gap-2 font-semibold">
              <Music2 className="size-5" /> OTW Play
            </Link>
            {!config.data?.data.publicReadEnabled && (
              <span className="hidden items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 sm:inline-flex dark:text-amber-300">
                <Eye className="size-3.5" /> 관리자 미리보기 · 공개 비활성
              </span>
            )}
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
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          <OtwPlayQueuePanel />
        </div>
        <OtwPlayPlaybackBar />
      </div>
    </OtwPlayPlayerProvider>
  );
}
