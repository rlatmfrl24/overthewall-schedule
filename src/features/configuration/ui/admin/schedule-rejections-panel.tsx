import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Search } from "lucide-react";
import {
  fetchScheduleCandidateRejections,
  reopenScheduleCandidateRejection,
  type PendingRejectionReasonCode,
  type ScheduleCandidateRejection,
} from "@/features/schedules";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmActionDialog } from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { useToast } from "@/shared/ui/toast";
import { REJECTION_REASON_OPTIONS } from "../../model/rejection-reasons";

const getReasonLabel = (reason: PendingRejectionReasonCode | null) =>
  REJECTION_REASON_OPTIONS.find((option) => option.value === reason)?.label ??
  "사유 미기록";

const getCandidateLabel = (item: ScheduleCandidateRejection) => {
  if (item.candidate_kind === "missing_schedule") return "새 일정";
  if (item.candidate_kind === "fill_missing_fields") return "빈 필드 보완";
  if (item.candidate_kind === "ambiguous") return "매칭 불확실";
  return item.action_type === "create" ? "신규" : "수정";
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
};

const RejectionSnapshot = ({
  item,
}: {
  item: ScheduleCandidateRejection;
}) => (
  <div className="grid gap-2 text-sm sm:grid-cols-[96px_minmax(0,1fr)]">
    <span className="text-muted-foreground">후보</span>
    <span className="font-medium">{item.title || "제목 없음"}</span>
    <span className="text-muted-foreground">멤버·일정</span>
    <span>
      {item.member_name} · {item.date} {item.start_time || "--:--"}
    </span>
    <span className="text-muted-foreground">VOD ID</span>
    <code className="break-all text-xs">{item.vod_id}</code>
    {(item.source_vod_ids?.length ?? 0) > 1 ? (
      <>
        <span className="text-muted-foreground">방송 세션</span>
        <span>
          {formatDateTime(item.session_started_at)} ~{" "}
          {formatDateTime(item.session_ended_at)} · VOD{" "}
          {item.vod_segment_count ?? item.source_vod_ids.length}개
        </span>
        <span className="text-muted-foreground">원본 VOD</span>
        <code className="break-all text-xs">
          {item.source_vod_ids.join(", ")}
        </code>
      </>
    ) : null}
    <span className="text-muted-foreground">거부 정보</span>
    <span>
      {getReasonLabel(item.reason_code)} · {formatDateTime(item.rejected_at)}
      {item.actor_name ? ` · ${item.actor_name}` : ""}
    </span>
    {item.reason_note ? (
      <>
        <span className="text-muted-foreground">메모</span>
        <span className="whitespace-pre-wrap">{item.reason_note}</span>
      </>
    ) : null}
  </div>
);

export function ScheduleRejectionsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [reasonCode, setReasonCode] = useState<
    PendingRejectionReasonCode | "all"
  >("all");
  const [rejectedFrom, setRejectedFrom] = useState("");
  const [rejectedTo, setRejectedTo] = useState("");
  const [page, setPage] = useState(1);
  const [reopenTarget, setReopenTarget] =
    useState<ScheduleCandidateRejection | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(reasonCode === "all" ? {} : { reasonCode }),
      ...(rejectedFrom ? { rejectedFrom } : {}),
      ...(rejectedTo ? { rejectedTo } : {}),
    }),
    [page, reasonCode, rejectedFrom, rejectedTo, search],
  );
  const rejectionQuery = useQuery({
    queryKey: queryKeys.settings.pendingRejections(query),
    queryFn: () => fetchScheduleCandidateRejections(query),
  });
  const reopenMutation = useMutation({
    mutationFn: (id: number) => reopenScheduleCandidateRejection(id),
    onSuccess: async () => {
      setReopenTarget(null);
      const currentData = rejectionQuery.data;
      if (currentData) {
        const nextTotalPages = Math.max(
          1,
          Math.ceil(Math.max(0, currentData.total - 1) / currentData.pageSize),
        );
        setPage((currentPage) =>
          Math.min(currentPage, nextTotalPages),
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      ]);
      toast({
        variant: "success",
        description:
          "재검토를 허용했습니다. 다음 수집에서 현재 일정 상태를 다시 평가합니다.",
      });
    },
    onError: (error) => {
      console.error("Failed to reopen schedule candidate rejection:", error);
      toast({
        variant: "error",
        description: "재검토 허용에 실패했습니다.",
      });
    },
  });

  const data = rejectionQuery.data;
  return (
    <section
      id="auto-update-panel-rejections"
      role="tabpanel"
      aria-labelledby="auto-update-tab-rejections"
      className="space-y-4"
    >
      <div>
        <h2 className="text-base font-semibold">거부 제외</h2>
        <p className="text-sm text-muted-foreground">
          활성 제외 후보를 조회하고, 필요한 항목만 다시 수집되도록 재검토를
          허용합니다.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 lg:grid-cols-[minmax(220px,1fr)_180px_160px_160px]">
          <div className="space-y-1.5">
            <Label htmlFor="rejection-search">멤버·제목·VOD ID 검색</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="rejection-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
                placeholder="검색어 입력"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rejection-reason">거부 사유</Label>
            <Select
              value={reasonCode}
              onValueChange={(value) => {
                setReasonCode(value as PendingRejectionReasonCode | "all");
                setPage(1);
              }}
            >
              <SelectTrigger id="rejection-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 사유</SelectItem>
                {REJECTION_REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rejection-from">거부일 시작</Label>
            <Input
              id="rejection-from"
              type="date"
              value={rejectedFrom}
              max={rejectedTo || undefined}
              onChange={(event) => {
                setRejectedFrom(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rejection-to">거부일 종료</Label>
            <Input
              id="rejection-to"
              type="date"
              value={rejectedTo}
              min={rejectedFrom || undefined}
              onChange={(event) => {
                setRejectedTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {rejectionQuery.isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          거부 제외 목록을 불러오는 중...
        </div>
      ) : rejectionQuery.isError ? (
        <div className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">
          거부 제외 목록을 불러오지 못했습니다.
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          조건에 맞는 활성 제외 항목이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>총 {data.total}건</span>
            <span>
              {data.page}/{Math.max(data.totalPages, 1)} 페이지
            </span>
          </div>
          {data.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-start lg:justify-between">
                <RejectionSnapshot item={item} />
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">
                    {getCandidateLabel(item)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReopenTarget(item)}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    재검토 허용
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.totalPages === 0 || page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={reopenTarget !== null}
        onOpenChange={(open) => {
          if (!open && !reopenMutation.isPending) setReopenTarget(null);
        }}
        title="재검토 허용"
        description={
          <div className="space-y-3">
            <p>
              제외 기록을 제거합니다. 즉시 pending을 만들지는 않으며 다음 자동·수동
              수집에서 현재 일정 상태를 다시 평가합니다.
            </p>
            {reopenTarget ? <RejectionSnapshot item={reopenTarget} /> : null}
          </div>
        }
        confirmLabel="재검토 허용"
        onConfirm={() => {
          if (reopenTarget) reopenMutation.mutate(reopenTarget.id);
        }}
        isProcessing={reopenMutation.isPending}
      />
    </section>
  );
}
