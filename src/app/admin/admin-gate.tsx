import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link, Outlet } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { useAdminStatus } from "@/features/auth";
import { AdminLayout } from "./admin-layout";

export function AdminGate() {
  const { isLoaded, isSignedIn, user } = useUser();
  const adminStatusQuery = useAdminStatus(
    isLoaded && isSignedIn ? user?.id : null,
  );

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
            <ShieldAlert className="mb-2 h-10 w-10 text-amber-500" />
            <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
            <CardDescription>관리자 전용 페이지입니다.</CardDescription>
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

  if (adminStatusQuery.isPending) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (adminStatusQuery.isError) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
            <ShieldAlert className="mb-2 h-10 w-10 text-amber-500" />
            <CardTitle className="text-xl">권한 확인에 실패했습니다</CardTitle>
            <CardDescription>
              서버에서 관리자 권한을 확인하지 못했습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              className="w-full rounded-full"
              onClick={() => void adminStatusQuery.refetch()}
            >
              다시 확인
            </Button>
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

  if (!adminStatusQuery.data?.isAdmin) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col items-center gap-2 space-y-0 text-center">
            <ShieldAlert className="mb-2 h-10 w-10 text-destructive" />
            <CardTitle className="text-xl">접근 권한이 없습니다</CardTitle>
            <CardDescription>
              관리자 권한이 있는 계정으로 로그인해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="text-center text-xs text-muted-foreground">
              관리자 권한은 서버 설정을 기준으로 확인합니다.
            </div>
            <Link to="/" className="w-full">
              <Button variant="outline" className="w-full rounded-full">
                홈으로 돌아가기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1">
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </div>
  );
}
