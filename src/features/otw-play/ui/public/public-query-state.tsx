import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { QueryState } from "@/shared/ui/query-state";

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
  return <QueryState state="error" className="rounded-xl border bg-card p-6"
    icon={<AlertTriangle aria-hidden="true" className="size-7 text-amber-500" />}
    title={stale ? "카탈로그가 업데이트되었습니다" : unavailable ? "카탈로그를 동기화하고 있습니다" : "OTW Play를 불러오지 못했습니다"}
    description={stale ? "첫 페이지부터 최신 목록을 다시 불러와 주세요." : "잠시 후 다시 시도해 주세요."}
    action={{ onClick: retry }} />;
}
