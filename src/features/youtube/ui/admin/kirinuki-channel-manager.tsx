import { QueryReadback } from "@/shared/ui/query-readback";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { Input } from "@/shared/ui/input";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KirinukiChannelDto } from "@contracts/youtube";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  Youtube,
  RefreshCw,
} from "lucide-react";
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
import { AdminSectionHeader, ConfirmActionDialog } from "@/app/admin";

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
        description: "키리누키 채널 목록을 불러오지 못했습니다.",
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
          ? "키리누키 채널을 수정했습니다."
          : "키리누키 채널을 등록했습니다.",
      });
    },
    onError: (error) => {
      console.error("Failed to save channel:", error);
      toast({
        variant: "error",
        description: "키리누키 채널 저장에 실패했습니다.",
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
        description: "키리누키 채널을 삭제했습니다.",
      });
    },
    onError: (error) => {
      console.error("Delete failed:", error);
      toast({
        variant: "error",
        description: "키리누키 채널 삭제에 실패했습니다.",
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
    <div className="space-y-4">
      <AdminSectionHeader
        title="키리누키 채널 관리"
        description="VOD 페이지 키리누키 섹션에 표시될 유튜브 채널을 관리합니다."
        count={channelsQuery.data ? sortedChannels.length : undefined}
        actions={
          <>
            <Select
              value={channelSort}
              onValueChange={(value) => setChannelSort(value as KirinukiSortKey)}
            >
              <SelectTrigger className="h-8 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIRINUKI_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              aria-label="키리누키 채널 상태 새로고침"
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

      <div className="flex flex-wrap gap-3"><Input aria-label="키리누키 채널 검색" placeholder="채널명 검색" className="max-w-sm" value={search.q ?? ""} onChange={(event) => updateSearch({q: event.target.value})}/><a className="text-sm underline" href="/admin/otw-play?tab=channels">Play 승인 채널 →</a><a className="text-sm underline" href="/admin/otw-play?tab=play-monitor">Play 감시 대상 →</a></div>
      <QueryReadback updatedAt={channelsQuery.dataUpdatedAt} fetching={channelsQuery.isFetching} error={channelsQuery.isError} />
      {channelsQuery.isError && !channelsQuery.data ? <p>채널 목록을 확인할 수 없습니다.</p> : channelsQuery.isFetching && sortedChannels.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedChannels.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 키리누키 채널이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">구분</TableHead>
                <TableHead className="w-[220px]">채널명</TableHead>
                <TableHead>연결·사용처</TableHead>

                <TableHead className="w-[90px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedChannels.filter((channel) => !search.q || channel.channel_name.toLocaleLowerCase().includes(search.q.toLocaleLowerCase())).map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100">
                      <Youtube className="h-4 w-4 text-red-600" />
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{channel.channel_name}</TableCell>
                  <TableCell className="text-xs"><span>키리누키 피드</span><details><summary>채널 정보</summary><p className="break-all">{channel.youtube_channel_id}</p><a className="underline" href={channel.channel_url} target="_blank" rel="noreferrer">YouTube 채널 열기 ↗</a></details></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenEdit(channel)}
                        title="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingChannel(channel)}
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
        description="정말로 이 키리누키 채널을 삭제하시겠습니까?"
        confirmLabel="삭제"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
