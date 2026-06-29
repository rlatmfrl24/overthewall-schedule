import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { EyeOff, Loader2, LockKeyhole, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNaverCafePostsConfig } from "@/hooks/use-naver-cafe-posts-config";
import { useXPostsConfig } from "@/hooks/use-x-posts-config";
import type {
  NaverCafePostsVisibility,
  XPostsVisibility,
} from "@/lib/types";
import { MemberPostsOverview } from "./member-posts-overview";

const isAccessible = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
  isSignedIn: boolean,
) => visibility === "public" || (visibility === "members" && isSignedIn);

const requiresLogin = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
  isSignedIn: boolean,
) => visibility === "members" && !isSignedIn;

export function MemberPostsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { visibility: xVisibility, loading: xLoading } = useXPostsConfig();
  const {
    enabled: cafeEnabled,
    visibility: cafeVisibility,
    loading: cafeLoading,
  } = useNaverCafePostsConfig();

  const signedIn = Boolean(isSignedIn);
  const xCanLoad = isAccessible(xVisibility, signedIn);
  const cafeCanLoad = cafeEnabled && isAccessible(cafeVisibility, signedIn);
  const xLoginRequired = requiresLogin(xVisibility, signedIn);
  const cafeLoginRequired =
    cafeEnabled && requiresLogin(cafeVisibility, signedIn);
  const shouldWaitForAuth =
    xVisibility === "members" || (cafeEnabled && cafeVisibility === "members");
  const configLoading =
    xLoading || cafeLoading || (!isLoaded && shouldWaitForAuth);

  if (configLoading) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background px-3 sm:px-5 lg:px-7">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!xCanLoad && !cafeCanLoad) {
    if (xLoginRequired || cafeLoginRequired) {
      return (
        <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background px-3 py-10 sm:px-5 lg:px-7">
          <Card className="w-full max-w-md shadow-sm">
            <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
              <LockKeyhole className="mb-2 h-10 w-10 text-muted-foreground" />
              <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
              <CardDescription>
                멤버 게시글은 회원 전용으로 제공됩니다.
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

    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background px-3 py-10 sm:px-5 lg:px-7">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
            {xVisibility === "private" || cafeVisibility === "private" ? (
              <EyeOff className="mb-2 h-10 w-10 text-muted-foreground" />
            ) : (
              <MessageSquareText className="mb-2 h-10 w-10 text-muted-foreground" />
            )}
            <CardTitle className="text-xl">비공개 상태입니다</CardTitle>
            <CardDescription>
              멤버 게시글은 현재 공개되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
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

  return <MemberPostsOverview loadX={xCanLoad} loadCafe={cafeCanLoad} />;
}
