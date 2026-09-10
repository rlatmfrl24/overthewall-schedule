import { QueryState } from "@/shared/ui/query-state";
import { Input } from "@/shared/ui/input";
import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Eye,
  LoaderCircle,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAdminStatus } from "@/features/auth";
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
import { OtwPlayFrame } from "../play-frame";
import { OtwPlayPlayerQueuePanel } from "../player/now-playing-panel";

export function OtwPlayShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const publicConfig = useOtwPlayConfig();
  const adminStatusQuery = useAdminStatus(
    isLoaded && isSignedIn ? user?.id : null,
  );

  if (publicConfig.isPending) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> OTW Play 공개 상태 확인 중
        </div>
      </main>
    );
  }

  if (publicConfig.isError || !publicConfig.data) {
    return <OtwPlayConfigError onRetry={() => void publicConfig.refetch()} />;
  }

  if (publicConfig.data.data.publicReadEnabled) {
    return (
      <OtwPlayCatalogRequestProvider>
        <OtwPlayExperience>{children}</OtwPlayExperience>
      </OtwPlayCatalogRequestProvider>
    );
  }

  if (!isLoaded) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> 관리자 미리보기 권한 확인 중
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <OtwPlayAccessCard
        title="OTW Play 공개 준비 중입니다"
        description="현재는 관리자 미리보기만 제공됩니다. 관리자라면 로그인해 주세요."
      >
        <SignInButton>
          <Button className="w-full rounded-full">로그인</Button>
        </SignInButton>
      </OtwPlayAccessCard>
    );
  }

  if (adminStatusQuery.isPending) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> 관리자 미리보기 권한 확인 중
        </div>
      </main>
    );
  }

  if (adminStatusQuery.isError) {
    return (
      <OtwPlayAccessCard
        title="관리자 권한을 확인하지 못했습니다"
        description="잠시 후 다시 확인해 주세요."
      >
        <Button
          className="w-full rounded-full"
          onClick={() => void adminStatusQuery.refetch()}
        >
          다시 확인
        </Button>
      </OtwPlayAccessCard>
    );
  }

  if (!adminStatusQuery.data?.isAdmin) {
    return (
      <OtwPlayAccessCard
        title="OTW Play 공개 준비 중입니다"
        description="곡 제안과 내 제안은 공개 전에도 계속 이용할 수 있습니다."
      >
        <Button asChild className="w-full rounded-full">
          <Link to="/play/submit" search={{ edit: undefined }}>곡 제안하기</Link>
        </Button>
      </OtwPlayAccessCard>
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
          <Button asChild variant="ghost" className="w-full rounded-full">
            <Link to="/">홈으로</Link>
          </Button>
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

function OtwPlayConfigError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-5">
      <QueryState state="error" headingLevel={1} title="OTW Play 상태를 확인하지 못했습니다"
        description="잠시 후 다시 시도해 주세요." action={{ onClick: onRetry }}
        className="max-w-md rounded-xl border bg-card p-6 shadow-sm" />
    </main>
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

  if (config.isError || !config.data) {
    return <OtwPlayConfigError onRetry={() => void config.refetch()} />;
  }

  return <OtwPlayExperience adminPreview>{children}</OtwPlayExperience>;
}

function OtwPlayExperience({
  adminPreview = false,
  children,
}: {
  adminPreview?: boolean;
  children: ReactNode;
}) {
  const editing = useRouterState({ select: state => state.location.pathname === "/play/playlists/new" || /^\/play\/playlists\/[^/]+\/edit$/.test(state.location.pathname) });
  return (
    <OtwPlayPlayerProvider adminPreview={adminPreview} playbackDisabled={editing}>
      <OtwPlayFrame
        search={<PlayHeaderSearch />}
        status={
          adminPreview ? (
            <span className="hidden items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 min-[1800px]:inline-flex dark:text-amber-300">
              <Eye className="size-3.5" /> 관리자 미리보기 · 공개 비활성
            </span>
          ) : undefined
        }
        showCatalogTabs
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            data-testid="otw-play-content-scroll"
            className={`play-content min-w-0 flex-1 overscroll-contain ${editing ? "overflow-hidden" : "overflow-y-auto"}`}
          >
            {children}
          </main>
          <OtwPlayPlayerQueuePanel editing={editing} />
        </div>
      </OtwPlayFrame>
    </OtwPlayPlayerProvider>
  );
}

function PlayHeaderSearch() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    void navigate({ to: "/play/songs", search: q ? { q } : {} });
  };

  return (
    <form
      role="search"
      aria-label="OTW Play 빠른 검색"
      onSubmit={submit}
      className="play-header-search mx-auto hidden h-10 w-full max-w-xl items-center gap-2 rounded-lg border bg-muted/40 px-3 md:flex"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <label htmlFor="otw-play-header-search" className="sr-only">
        곡, 원곡 가수, 참여자 검색
      </label>
      <Input
        id="otw-play-header-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="곡, 원곡 가수, 참여자 검색"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
      />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="곡 검색 실행">
        <Search />
      </Button>
    </form>
  );
}
