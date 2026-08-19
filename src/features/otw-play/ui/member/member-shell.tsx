import { SignInButton, useUser } from "@clerk/clerk-react";
import { LoaderCircle, Music2 } from "lucide-react";
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
