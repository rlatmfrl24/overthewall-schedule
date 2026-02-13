import { useState, useCallback, useEffect, useMemo } from "react";
import { type KirinukiChannel } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Youtube,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  KirinukiChannelFormDialog,
  type KirinukiChannelFormValues,
} from "./kirinuki-channel-form-dialog";
import {
  createKirinukiChannel,
  deleteKirinukiChannel,
  fetchKirinukiChannels,
  updateKirinukiChannel,
} from "@/lib/api/kirinuki";
import { useToast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./components/confirm-action-dialog";
import { AdminSectionHeader } from "./components/admin-section-header";

const KIRINUKI_SORT_OPTIONS = [
  { value: "name_asc", label: "채널명 오름차순" },
  { value: "name_desc", label: "채널명 내림차순" },
  { value: "id_asc", label: "채널 ID 오름차순" },
] as const;

type KirinukiSortKey = (typeof KIRINUKI_SORT_OPTIONS)[number]["value"];

export function KirinukiChannelManager() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<KirinukiChannel[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<KirinukiChannel | null>(
    null,
  );
  const [deletingChannel, setDeletingChannel] = useState<KirinukiChannel | null>(
    null,
  );
  const [channelSort, setChannelSort] = useState<KirinukiSortKey>("name_asc");

  const loadChannels = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchKirinukiChannels();
      setChannels(data);
    } catch (error) {
      console.error("Failed to load kirinuki channels:", error);
      toast({
        variant: "error",
        description: "키리누키 채널 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const sortedChannels = useMemo(() => {
    const list = [...channels];
    if (channelSort === "name_desc") {
      return list.sort((a, b) => b.channel_name.localeCompare(a.channel_name));
    }
    if (channelSort === "id_asc") {
      return list.sort((a, b) =>
        a.youtube_channel_id.localeCompare(b.youtube_channel_id),
      );
    }
    return list.sort((a, b) => a.channel_name.localeCompare(b.channel_name));
  }, [channels, channelSort]);

  const handleOpenCreate = () => {
    setEditingChannel(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (channel: KirinukiChannel) => {
    setEditingChannel(channel);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingChannel?.id) return;
    try {
      await deleteKirinukiChannel(deletingChannel.id);
      await loadChannels();
      toast({
        variant: "success",
        description: "키리누키 채널을 삭제했습니다.",
      });
    } catch (error) {
      console.error("Delete failed:", error);
      toast({
        variant: "error",
        description: "키리누키 채널 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingChannel(null);
    }
  };

  const handleSubmit = async (data: KirinukiChannelFormValues) => {
    setIsSaving(true);
    try {
      if (editingChannel?.id) {
        await updateKirinukiChannel({ ...data, id: editingChannel.id });
      } else {
        await createKirinukiChannel(data);
      }

      await loadChannels();
      setIsDialogOpen(false);
      toast({
        variant: "success",
        description: editingChannel?.id
          ? "키리누키 채널을 수정했습니다."
          : "키리누키 채널을 등록했습니다.",
      });
    } catch (error) {
      console.error("Failed to save channel:", error);
      toast({
        variant: "error",
        description: "키리누키 채널 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="키리누키 채널 관리"
        description="VOD 페이지 키리누키 섹션에 표시될 유튜브 채널을 관리합니다."
        count={sortedChannels.length}
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
              onClick={() => void loadChannels()}
              disabled={isFetching}
            >
              {isFetching ? (
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

      {isFetching && sortedChannels.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedChannels.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 키리누키 채널이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">구분</TableHead>
                <TableHead className="w-[220px]">채널명</TableHead>
                <TableHead className="w-[240px]">채널 ID</TableHead>
                <TableHead>채널 URL</TableHead>
                <TableHead className="w-[90px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedChannels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100">
                      <Youtube className="h-4 w-4 text-red-600" />
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{channel.channel_name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {channel.youtube_channel_id}
                  </TableCell>
                  <TableCell>
                    <a
                      href={channel.channel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[330px] items-center gap-1 truncate text-xs text-primary hover:underline"
                      title={channel.channel_url}
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {channel.channel_url}
                    </a>
                  </TableCell>
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
        isSaving={isSaving}
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
