import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/ui/button";

export function OtwPlayQueryError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const stale = apiError?.status === 409 || apiError?.code === "PLAY_CURSOR_STALE";
  const unavailable = apiError?.status === 503;
  return (
    <div className="rounded-xl border bg-card p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 size-7 text-amber-500" />
      <h2 className="font-semibold">
        {stale
          ? "카탈로그가 업데이트되었습니다"
          : unavailable
            ? "카탈로그를 동기화하고 있습니다"
            : "OTW Play를 불러오지 못했습니다"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {stale
          ? "첫 페이지부터 최신 목록을 다시 불러와 주세요."
          : "이전 revision을 현재 결과처럼 표시하지 않습니다. 잠시 후 다시 시도해 주세요."}
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw /> 다시 시도
      </Button>
    </div>
  );
}
