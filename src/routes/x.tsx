import { XPostsOverview } from "@/features/x/x-posts-overview";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";

export const Route = createFileRoute("/x")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
            <LockKeyhole className="mb-2 h-10 w-10 text-muted-foreground" />
            <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
            <CardDescription>
              멤버 최신 게시글은 회원 전용으로 제공됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SignInButton>
              <Button className="w-full rounded-full">로그인</Button>
            </SignInButton>
            <Link to="/" className="w-full">
              <Button variant="ghost" className="w-full rounded-full">
                홈으로
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <XPostsOverview />;
}
