import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { LoaderCircle, Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

export function OtwPlayMemberShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> 로그인 확인 중
      </main>
    );
  }
  if (!isSignedIn) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
          <Music2 className="mx-auto mb-3 size-9" />
          <h1 className="text-xl font-semibold">로그인 후 곡을 제안할 수 있어요</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            회원 제안은 공식 커버 영상만 접수하며 관리자 검수 후 반영됩니다.
          </p>
          <SignInButton>
            <Button className="mt-5 w-full rounded-full">로그인</Button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/play/submit" className="flex items-center gap-2 font-semibold">
            <Music2 className="size-5" /> OTW Play 곡 제안
          </Link>
          <nav className="flex gap-1" aria-label="회원 곡 제안">
            <Link
              to="/play/submit"
              activeProps={{ className: "bg-foreground text-background" }}
              inactiveProps={{ className: "text-muted-foreground hover:bg-accent" }}
              className="rounded-full px-3 py-2 text-sm font-medium"
            >
              제안하기
            </Link>
            <Link
              to="/play/submissions"
              activeProps={{ className: "bg-foreground text-background" }}
              inactiveProps={{ className: "text-muted-foreground hover:bg-accent" }}
              className="rounded-full px-3 py-2 text-sm font-medium"
            >
              내 제안
            </Link>
          </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
