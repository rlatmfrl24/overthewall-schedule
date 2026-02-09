import { useState, useCallback, useEffect } from "react";
import { type KirinukiChannel } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  MoreVertical,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  KirinukiChannelFormDialog,
  type KirinukiChannelFormValues,
} from "./kirinuki-channel-form-dialog";
import { cn } from "@/lib/utils";
import {
  createKirinukiChannel,
  deleteKirinukiChannel,
  fetchKirinukiChannels,
  updateKirinukiChannel,
} from "@/lib/api/kirinuki";

export function KirinukiChannelManager() {
  const [channels, setChannels] = useState<KirinukiChannel[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<KirinukiChannel | null>(
    null,
  );

  const loadChannels = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchKirinukiChannels();
      setChannels(data);
    } catch (error) {
      console.error("Failed to load kirinuki channels:", error);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const handleOpenCreate = () => {
    setEditingChannel(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (channel: KirinukiChannel) => {
    setEditingChannel(channel);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("정말로 이 채널을 삭제하시겠습니까?")) return;
    try {
      await deleteKirinukiChannel(id);
      await loadChannels();
    } catch (error) {
      console.error("Delete failed:", error);
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
    } catch (error) {
      console.error("Failed to save channel:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            키리누키 채널 관리
          </h2>
          <p className="text-muted-foreground">
            VOD 페이지의 키리누키 섹션에 표시될 유튜브 채널을 관리합니다.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 gap-2">
          <PlusCircle className="w-4 h-4" />새 채널 등록
        </Button>
      </div>

      <div className="grid gap-4">
        {isFetching && channels.length === 0 ? (
          <div className="flex items-center justify-center h-64 border rounded-xl border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border rounded-xl border-dashed bg-muted/30 text-muted-foreground gap-2">
            <p>등록된 키리누키 채널이 없습니다.</p>
            <Button variant="outline" size="sm" onClick={handleOpenCreate}>
              첫 채널 등록하기
            </Button>
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-2xl border bg-card">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/10",
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Youtube className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {channel.channel_name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {channel.youtube_channel_id}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEdit(channel)}>
                        <Pencil className="w-4 h-4 mr-2" /> 수정
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(channel.id!)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> 삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <a
                    href={channel.channel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md bg-muted/30 hover:bg-muted group/link"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover/link:text-primary transition-colors" />
                    <span className="truncate underline-offset-4 group-hover/link:underline max-w-[300px]">
                      {channel.channel_url}
                    </span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <KirinukiChannelFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingChannel}
        isSaving={isSaving}
      />
    </div>
  );
}
