import type { OperationsStatusResponse } from "@/features/operations";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";

const formatDateTime = (value: number | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";

export function AutoUpdateRunHistory({
  status,
}: {
  status: OperationsStatusResponse | undefined;
}) {
  const runs = status?.autoUpdate.recentRuns ?? [];
  return (
    <section
      id="auto-update-panel-runs"
      role="tabpanel"
      aria-labelledby="auto-update-tab-runs"
      className="space-y-4"
    >
      <div>
        <h2 className="text-base font-semibold">실행 기록</h2>
        <p className="text-sm text-muted-foreground">
          VOD 조각과 방송 세션을 분리해 재개 병합, 후보 생성, 억제 효과를
          실행 단위로 확인합니다.
        </p>
      </div>
      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          자동 업데이트 실행 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1fr)_repeat(6,minmax(100px,auto))] xl:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={run.status === "success" ? "default" : "destructive"}
                    >
                      {run.status === "success" ? "성공" : "실패"}
                    </Badge>
                    <span className="text-sm font-medium">
                      {run.source === "manual" ? "수동 실행" : "예약 실행"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt)}
                  </p>
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">
                    VOD / 세션
                  </span>
                  {run.segmentCount} / {run.sessionCount}건
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">
                    재개 병합
                  </span>
                  {run.resumeMergedCount}건
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">후보 생성</span>
                  {run.pendingCreatedCount}건
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">
                    영구 / 단기 / 휴방 억제
                  </span>
                  {run.rejectedSuppressedCount} / {run.shortSuppressedCount} /{" "}
                  {run.holidaySuppressedCount}건
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">
                    불확실 / 중복
                  </span>
                  {run.ambiguousCount} / {run.duplicatePendingCount}건
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-muted-foreground">
                    만료 후보 정리
                  </span>
                  {run.obsoletePendingCount}건
                </div>
                {run.error ? (
                  <p className="text-sm text-destructive sm:col-span-2 xl:col-span-7">
                    {run.error}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
