import { SignInButton, useUser } from "@clerk/clerk-react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MultiviewPage } from "@/features/multiview/multiview-page";

export const Route = createFileRoute("/multiview")({
  component: RouteComponent,
});

export function RouteComponent() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
            <LockKeyhole className="mb-2 h-10 w-10 text-muted-foreground" />
            <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
            <CardDescription>
              오버더월 멀티뷰는 로그인한 사용자에게만 제공됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInButton>
              <Button className="w-full rounded-full">로그인</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <MultiviewPage />;
}
