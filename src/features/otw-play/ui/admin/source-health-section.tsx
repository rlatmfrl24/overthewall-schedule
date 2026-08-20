import type {
  OtwPlayAdminSourceHealthDto,
  OtwPlayAdminSourceHealthItemDto,
  OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { recheckOtwPlaySource } from "../../api/admin";

type Run = (label: string, task: () => Promise<unknown>) => Promise<boolean>;

const availabilityLabels: Record<OtwPlaySourceAvailabilityStatus, string> = {
  playable: "재생 가능",
  private: "비공개",
  deleted: "삭제됨",
  region_blocked: "KR 제한",
  embed_disabled: "임베드 차단",
  unavailable: "재생 불가",
  unknown: "확인 필요",
};

const formatAt = (value: number | null) =>
  value === null ? "기록 없음" : new Date(value).toLocaleString("ko-KR");

const linkedSummary = (item: OtwPlayAdminSourceHealthItemDto) => {
  if (item.links.length === 0) return "연결 없음";
  const names = item.links.map((link) => link.songTitle).join(", ");
  const remaining = item.linkedPerformanceCount - item.links.length;
  return remaining > 0 ? `${names} 외 ${remaining}개` : names;
};

const retryLabel = (item: OtwPlayAdminSourceHealthItemDto) =>
  item.lastEvent?.type === "source.retry_scheduled"
    ? `외부 API 재시도 대기 (${item.lastEvent.retryCode ?? "unknown"})`
    : null;

function RecheckButton({
  item,
  saving,
  run,
}: {
  item: OtwPlayAdminSourceHealthItemDto;
  saving: string | null;
  run: Run;
}) {
  const label = `source:${item.source.id}`;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={saving !== null}
      onClick={() => {
        void run(label, () =>
          recheckOtwPlaySource(item.source.id, {
            expectedVersion: item.source.version,
            youtubeUrl: `https://www.youtube.com/watch?v=${item.source.externalId}`,
            channelId: item.source.channelId,
          }),
        );
      }}
    >
      {saving === label ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      수동 재검사
    </Button>
  );
}

function HealthList({
  title,
  description,
  items,
  saving,
  run,
}: {
  title: string;
  description: string;
  items: OtwPlayAdminSourceHealthItemDto[];
  saving: string | null;
  run: Run;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            해당 source가 없습니다.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태·채널</TableHead>
                    <TableHead>곡·가창</TableHead>
                    <TableHead>마지막 점검</TableHead>
                    <TableHead>다음 점검</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.source.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={item.source.availabilityStatus === "playable" ? "secondary" : "destructive"}>
                            {availabilityLabels[item.source.availabilityStatus]}
                          </Badge>
                          <p className="font-medium">{item.channel.displayName}</p>
                          {retryLabel(item) ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              {retryLabel(item)}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate">{linkedSummary(item)}</p>
                        <p className="text-xs text-muted-foreground">
                          연결 가창 {item.linkedPerformanceCount}개
                        </p>
                      </TableCell>
                      <TableCell>{formatAt(item.source.lastCheckedAt)}</TableCell>
                      <TableCell>{formatAt(item.source.nextCheckAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={`https://www.youtube.com/watch?v=${item.source.externalId}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> YouTube
                            </a>
                          </Button>
                          <RecheckButton item={item} saving={saving} run={run} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {items.map((item) => (
                <article key={item.source.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.channel.displayName}</p>
                      <p className="text-sm text-muted-foreground">{linkedSummary(item)}</p>
                    </div>
                    <Badge variant={item.source.availabilityStatus === "playable" ? "secondary" : "destructive"}>
                      {availabilityLabels[item.source.availabilityStatus]}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">마지막 점검</dt><dd>{formatAt(item.source.lastCheckedAt)}</dd></div>
                    <div><dt className="text-muted-foreground">다음 점검</dt><dd>{formatAt(item.source.nextCheckAt)}</dd></div>
                  </dl>
                  {retryLabel(item) ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">{retryLabel(item)}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <a href={`https://www.youtube.com/watch?v=${item.source.externalId}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> YouTube
                      </a>
                    </Button>
                    <RecheckButton item={item} saving={saving} run={run} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SourceHealthSection({
  data,
  loading,
  fetching,
  error,
  saving,
  run,
  refetch,
}: {
  data: OtwPlayAdminSourceHealthDto | undefined;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  saving: string | null;
  run: Run;
  refetch: () => Promise<unknown>;
}) {
  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
        source 상태를 불러오지 못했습니다{error ? `: ${error.message}` : "."}
        <Button className="ml-3" size="sm" variant="outline" onClick={() => void refetch()}>다시 시도</Button>
      </div>
    );
  }
  return (
    <section aria-labelledby="source-health-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="source-health-title" className="text-lg font-semibold">소스 상태</h2>
          <p className="text-sm text-muted-foreground">KR 재생·임베드 가능 여부와 다음 YouTube 재검사 시각입니다.</p>
        </div>
        <Button size="sm" variant="outline" disabled={fetching} onClick={() => void refetch()}>
          {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 새로고침
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">재확인 필요</p><p className="text-2xl font-semibold">{data.counts.due}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">재생 불가</p><p className="text-2xl font-semibold">{data.counts.unplayable}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">최근 {data.recentRecoveryWindowDays}일 복구</p><p className="text-2xl font-semibold">{data.counts.recentlyRecovered}</p></CardContent></Card>
      </div>
      <HealthList title="재확인 필요" description="점검 예정 시각이 지난 source입니다." items={data.due} saving={saving} run={run} />
      <HealthList title="재생 불가" description="재생 가능 상태가 아닌 source입니다. 외부 장애 재시도와 확정 상태를 구분합니다." items={data.unplayable} saving={saving} run={run} />
      <HealthList title={`최근 ${data.recentRecoveryWindowDays}일 복구`} description="재생 불가 상태에서 playable로 복구된 source입니다." items={data.recentlyRecovered} saving={saving} run={run} />
    </section>
  );
}
