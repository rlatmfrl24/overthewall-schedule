import { SecondaryAction } from "@/shared/ui/secondary-action";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { Input } from "@/shared/ui/input";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KirinukiChannelDto } from "@contracts/youtube";
import { PiSpinnerGapBold as Loader2, PiPlusCircleBold as PlusCircle, PiPencilSimpleBold as Pencil, PiTrashBold as Trash2, PiArrowSquareOutBold as ExternalLink, PiArrowsClockwiseBold as RefreshCw } from "react-icons/pi";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  KirinukiChannelFormDialog,
  type KirinukiChannelFormValues,
} from "./kirinuki-channel-form-dialog";
import {
  createKirinukiChannel,
  deleteKirinukiChannel,
  fetchKirinukiChannels,
  updateKirinukiChannel,
} from "../../api/kirinuki";
import { useToast } from "@/shared/ui/toast";
import { AdminSectionHeader } from "@/app/admin";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";

const KIRINUKI_SORT_OPTIONS = [
  { value: "name_asc", label: "채널명 오름차순" },
  { value: "name_desc", label: "채널명 내림차순" },
  { value: "id_asc", label: "채널 ID 오름차순" },
] as const;

type KirinukiSortKey = (typeof KIRINUKI_SORT_OPTIONS)[number]["value"];
const KIRINUKI_CHANNELS_QUERY_KEY = [
  "youtube",
  "kirinuki-channels",
] as const;

export function KirinukiChannelManager() {
  const [search, updateSearch] = useConsoleSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<KirinukiChannelDto | null>(
    null,
  );
  const [deletingChannel, setDeletingChannel] = useState<KirinukiChannelDto | null>(
    null,
  );
  const [channelSort, setChannelSort] = useState<KirinukiSortKey>("name_asc");

  const channelsQuery = useQuery({
    queryKey: KIRINUKI_CHANNELS_QUERY_KEY,
    queryFn: fetchKirinukiChannels,
  });
  useEffect(() => {
    if (channelsQuery.error) {
      console.error("Failed to load kirinuki channels:", channelsQuery.error);
      toast({
        variant: "error",
        description: "방송 클립 채널 목록을 불러오지 못했습니다.",
      });
    }
  }, [channelsQuery.error, toast]);

  const saveMutation = useMutation({
    mutationFn: async ({
      data,
      channelId,
    }: {
      data: KirinukiChannelFormValues;
      channelId: number | null;
    }) => {
      if (channelId) {
        await updateKirinukiChannel({ ...data, id: channelId });
      } else {
        await createKirinukiChannel(data);
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: KIRINUKI_CHANNELS_QUERY_KEY,
      });
      setIsDialogOpen(false);
      toast({
        variant: "success",
        description: variables.channelId
          ? "방송 클립 채널을 수정했습니다."
          : "방송 클립 채널을 등록했습니다.",
      });
    },
    onError: (error) => {
      console.error("Failed to save channel:", error);
      toast({
        variant: "error",
        description: "방송 클립 채널 저장에 실패했습니다.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKirinukiChannel,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: KIRINUKI_CHANNELS_QUERY_KEY,
      });
      toast({
        variant: "success",
        description: "방송 클립 채널을 삭제했습니다.",
      });
    },
    onError: (error) => {
      console.error("Delete failed:", error);
      toast({
        variant: "error",
        description: "방송 클립 채널 삭제에 실패했습니다.",
      });
    },
    onSettled: () => setDeletingChannel(null),
  });

  const sortedChannels = useMemo(() => {
    const list = [...(channelsQuery.data ?? [])];
    if (channelSort === "name_desc") {
      return list.sort((a, b) => b.channel_name.localeCompare(a.channel_name));
    }
    if (channelSort === "id_asc") {
      return list.sort((a, b) =>
        a.youtube_channel_id.localeCompare(b.youtube_channel_id),
      );
    }
    return list.sort((a, b) => a.channel_name.localeCompare(b.channel_name));
  }, [channelsQuery.data, channelSort]);
  const filteredChannels = sortedChannels.filter((channel) =>
    `${channel.channel_name} ${channel.youtube_channel_id}`.toLocaleLowerCase().includes((search.q ?? "").trim().toLocaleLowerCase()),
  );

  const handleOpenCreate = () => {
    setEditingChannel(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (channel: KirinukiChannelDto) => {
    setEditingChannel(channel);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingChannel?.id) return;
    await deleteMutation.mutateAsync(deletingChannel.id).catch(() => undefined);
  };

  const handleSubmit = async (data: KirinukiChannelFormValues) => {
    await saveMutation
      .mutateAsync({
        data,
        channelId: editingChannel?.id ?? null,
      })
      .catch(() => undefined);
  };

  return (
    <div className="admin-dense-panel min-w-0 space-y-3">
      <AdminSectionHeader
        title="방송 클립 채널"
        count={channelsQuery.data ? sortedChannels.length : undefined}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              aria-label="방송 클립 채널 상태 새로고침"
              onClick={() => void channelsQuery.refetch()}
              disabled={channelsQuery.isFetching}
            >
              {channelsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              새 채널
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="방송 클립 채널 검색" placeholder="채널명 또는 채널 ID 검색" className="min-w-0 flex-1 basis-60" value={search.q ?? ""} onChange={(event) => updateSearch({q: event.target.value})}/>
        <Select value={channelSort} onValueChange={(value) => setChannelSort(value as KirinukiSortKey)}>
          <SelectTrigger aria-label="방송 클립 채널 정렬" size="sm" className="w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>{KIRINUKI_SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {search.q && <Button size="sm" variant="ghost" onClick={() => updateSearch({ q: undefined })}>초기화</Button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <QueryReadback updatedAt={channelsQuery.dataUpdatedAt} fetching={channelsQuery.isFetching} error={channelsQuery.isError} />
        {channelsQuery.data && <span className="tabular-nums">{filteredChannels.length} / {sortedChannels.length}채널</span>}
      </div>
      {channelsQuery.isError && !channelsQuery.data ? <p>채널 목록을 확인할 수 없습니다.</p> : channelsQuery.isFetching && sortedChannels.length === 0 ? (
        <div role="status" aria-label="채널 목록 확인 중" className="space-y-2 rounded-lg border p-3">{[1, 2, 3].map((row) => <Skeleton key={row} className="h-11 w-full" />)}</div>
      ) : sortedChannels.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          등록된 방송 클립 채널이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">채널</TableHead>
                <TableHead>사용처</TableHead>
                <TableHead className="text-right pr-3">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChannels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="px-3 whitespace-normal">
                    <a className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" href={channel.channel_url} target="_blank" rel="noreferrer">
                      {channel.channel_name}<ExternalLink className="size-3 shrink-0 text-muted-foreground" /><span className="sr-only">YouTube 채널 새 탭에서 열기</span>
                    </a>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{channel.youtube_channel_id}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">VOD 키리누키</Badge></TableCell>
                  <TableCell className="text-right pr-3">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenEdit(channel)}
                        title="수정"
                        aria-label={`${channel.channel_name} 수정`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <SecondaryAction
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingChannel(channel)}
                        title="삭제"
                        aria-label={`${channel.channel_name} 삭제`}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </SecondaryAction>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredChannels.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">검색 조건에 맞는 채널이 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild><a href="/admin/otw-play?tab=clip-channels">노래 클립 채널 관리</a></Button>
        <Button variant="ghost" size="sm" asChild><a href="/admin/otw-play?tab=play-monitor">Play 감시 대상</a></Button>
      </div>

      <KirinukiChannelFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingChannel}
        isSaving={saveMutation.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(deletingChannel)}
        onOpenChange={(open) => {
          if (!open) setDeletingChannel(null);
        }}
        title="채널 삭제 확인"
        description={`${deletingChannel?.channel_name ?? ""} 방송 클립 채널을 삭제하시겠습니까?`}
        confirmLabel="삭제"
        destructive
        isProcessing={deleteMutation.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
