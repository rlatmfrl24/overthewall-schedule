import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { ListPlus, ListTodo, LoaderCircle, Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { OtwPlayFrame } from "../play-frame";

export function OtwPlayMemberShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) {
    return (
      <OtwPlayFrame submissionActive>
        <main className="flex min-h-0 flex-1 items-center justify-center" aria-busy="true">
          <LoaderCircle className="mr-2 size-4 animate-spin" /> 로그인 확인 중
        </main>
      </OtwPlayFrame>
    );
  }
  if (!isSignedIn) {
    return (
      <OtwPlayFrame submissionActive>
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
      </OtwPlayFrame>
    );
  }

  return (
    <OtwPlayFrame submissionActive>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </OtwPlayFrame>
  );
}

export function OtwPlayMemberHome() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl items-center p-4 sm:p-8">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">OTW Play</p>
        <h1 className="mt-1 text-2xl font-bold">노래 영상 제안</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          OTW 멤버가 참여한 공식 커버 영상을 제안하고 검수 상태를 확인할 수 있습니다.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-auto justify-start gap-3 rounded-xl p-4 text-left">
            <Link to="/play/submit">
              <ListPlus className="size-5" />
              <span>
                <span className="block font-semibold">새 곡 제안</span>
                <span className="block text-xs font-normal opacity-80">공식 커버 영상 추가 요청</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-xl p-4 text-left">
            <Link to="/play/submissions">
              <ListTodo className="size-5" />
              <span>
                <span className="block font-semibold">내 제안</span>
                <span className="block text-xs font-normal text-muted-foreground">제출한 영상의 검수 상태 확인</span>
              </span>
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
