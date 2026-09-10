import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { EyeOff, Loader2, LockKeyhole, MessageSquareText } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { useNaverCafePostsConfig } from "@/features/naver-cafe";
import { useXPostsConfig } from "@/features/x-posts";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";
import { buildFeedSiteSeo, isFeedPublic } from "@contracts/site-seo";
import { useSiteSeo } from "@/shared/seo";
import { useMemo, type ReactNode } from "react";
import { MemberPostsOverview } from "./member-posts-overview";

const isAccessible = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
  isSignedIn: boolean,
) => visibility === "public" || (visibility === "members" && isSignedIn);

const requiresLogin = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
  isSignedIn: boolean,
) => visibility === "members" && !isSignedIn;

export function MemberPostsPage({ footer }: { footer?: ReactNode }) {
  const frame = (content: ReactNode) => <div className="flex min-h-0 flex-1 flex-col overflow-y-auto"><div className="flex flex-1 flex-col">{content}</div>{footer}</div>;
  const { isLoaded, isSignedIn } = useUser();
  const {
    visibility: xVisibility,
    loading: xLoading,
    error: xError,
    reload: reloadXConfig,
  } = useXPostsConfig();
  const {
    enabled: cafeEnabled,
    visibility: cafeVisibility,
    loading: cafeLoading,
    error: cafeError,
    reload: reloadCafeConfig,
  } = useNaverCafePostsConfig();

  const seo = useMemo(
    () =>
      buildFeedSiteSeo(
        !xLoading &&
          !cafeLoading &&
          !xError &&
          !cafeError &&
          isFeedPublic({ xVisibility, cafeEnabled, cafeVisibility }),
      ),
    [
      cafeEnabled,
      cafeError,
      cafeLoading,
      cafeVisibility,
      xError,
      xLoading,
      xVisibility,
    ],
  );
  useSiteSeo(seo);

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
    return frame(
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-background px-3 sm:px-5 lg:px-7">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!xCanLoad && !cafeCanLoad) {
    if (xError || cafeError) {
      return frame(<div role="alert" className="m-auto max-w-md space-y-3 p-6 text-sm">
        <p>{xError || cafeError}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void Promise.allSettled([reloadXConfig(), reloadCafeConfig()])}>다시 시도</Button>
      </div>);
    }
    if (xLoginRequired || cafeLoginRequired) {
      return frame(
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

    return frame(
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

  return <MemberPostsOverview loadX={xCanLoad} loadCafe={cafeCanLoad} footer={footer} />;
}
