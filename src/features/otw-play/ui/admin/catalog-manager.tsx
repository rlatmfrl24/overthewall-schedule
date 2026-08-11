import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  OtwPlayAdminChannelDto,
  OtwPlayAdminEntityDto,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminSongDto,
  OtwPlayChannelRole,
  OtwPlayEntityKind,
  OtwPlayParticipationType,
  OtwPlayReleaseType,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { AdminSectionHeader, ConfirmActionDialog } from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import { Loader2, Pencil, PlusCircle, RefreshCw } from "lucide-react";
import {
  createOtwPlayChannel,
  createOtwPlayEntity,
  createOtwPlayPerformance,
  createOtwPlaySong,
  publishOtwPlayPerformance,
  recheckOtwPlaySource,
  rejectOtwPlayProposal,
  updateOtwPlayChannel,
  updateOtwPlayEntity,
  updateOtwPlayPerformance,
  updateOtwPlaySong,
  withdrawOtwPlayPerformance,
} from "../../api/admin";
import {
  useOtwPlayAdminCatalog,
  useOtwPlayAdminProposals,
} from "../../queries/use-admin-catalog";

type Section = "review" | "songs" | "performances" | "channels" | "entities";

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: "review", label: "제안 검수" },
  { value: "songs", label: "곡" },
  { value: "performances", label: "가창" },
  { value: "channels", label: "공식 채널" },
  { value: "entities", label: "인물·그룹" },
];

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

const asEpoch = (value: string) =>
  value ? Date.parse(`${value}T00:00:00Z`) : null;
const asDay = (value: number | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";
const isMvpReleaseType = (
  value: OtwPlayReleaseType,
): value is "official_mv" | "official_video" =>
  value === "official_mv" || value === "official_video";

export function OtwPlayCatalogManager() {
  const catalogQuery = useOtwPlayAdminCatalog();
  const proposalsQuery = useOtwPlayAdminProposals();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>("review");
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
    destructive?: boolean;
  } | null>(null);

  const catalog = catalogQuery.data;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminCatalog(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminProposals("pending_review"),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.all }),
    ]);
  };
  const run = async (label: string, task: () => Promise<unknown>) => {
    setSaving(label);
    try {
      await task();
      await refresh();
      toast({
        variant: "success",
        description: `${label} 작업을 완료했습니다.`,
      });
      return true;
    } catch (error) {
      console.error("OTW Play admin command failed", error);
      toast({ variant: "error", description: `${label} 작업에 실패했습니다.` });
      return false;
    } finally {
      setSaving(null);
    }
  };

  if (catalogQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        OTW Play 관리자 카탈로그를 불러오지 못했습니다.
        <Button
          className="ml-3"
          variant="outline"
          size="sm"
          onClick={() => void catalogQuery.refetch()}
        >
          다시 시도
        </Button>
      </div>
    );
  }

  const readModelReady = catalog.revision === catalog.readModelRevision;
  const effectiveSaving = readModelReady ? saving : "read-model-unavailable";

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        title="OTW Play 카탈로그"
        description="공식 채널과 YouTube metadata를 검수하고 곡·가창 draft를 게시합니다. 모든 command는 event와 공개 read model revision을 함께 갱신합니다."
        count={catalog.songs.length}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={catalogQuery.isFetching}
          >
            {catalogQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {SECTIONS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={section === item.value ? "default" : "ghost"}
            onClick={() => setSection(item.value)}
          >
            {item.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">catalog r{catalog.revision}</Badge>
          <Badge
            variant={
              catalog.revision === catalog.readModelRevision
                ? "secondary"
                : "destructive"
            }
          >
            read model r{catalog.readModelRevision}
          </Badge>
        </div>
      </div>
      {!readModelReady && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          공개 read model revision이 catalog와 다릅니다. 전체 projection 복구와
          검증이 끝날 때까지 관리자 쓰기를 중단했습니다.
        </div>
      )}

      {section === "review" && (
        <ProposalSection
          proposals={proposalsQuery.data ?? []}
          loading={proposalsQuery.isLoading}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "entities" && (
        <EntitySection
          items={catalog.entities}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "channels" && (
        <ChannelSection
          items={catalog.channels}
          entities={catalog.entities}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "songs" && (
        <SongSection
          items={catalog.songs}
          entities={catalog.entities}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "performances" && (
        <PerformanceSection
          items={catalog.performances}
          songs={catalog.songs}
          entities={catalog.entities}
          channels={catalog.channels}
          saving={effectiveSaving}
          run={run}
          confirm={setConfirmation}
        />
      )}

      <ConfirmActionDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={confirmation?.title ?? "확인"}
        description={confirmation?.description ?? ""}
        confirmLabel="계속"
        destructive={confirmation?.destructive}
        onConfirm={() => {
          const action = confirmation?.action;
          setConfirmation(null);
          if (action) void action();
        }}
      />
    </div>
  );
}

function ProposalSection({
  proposals,
  loading,
  saving,
  run,
}: {
  proposals: ReturnType<typeof useOtwPlayAdminProposals>["data"] extends infer T
    ? NonNullable<T>
    : never;
  loading: boolean;
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    proposals.find((proposal) => proposal.id === selectedId) ??
    proposals[0] ??
    null;
  if (loading) return <Loader2 className="mx-auto h-7 w-7 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">공식 커버 제안 검수</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          GATE-01이 확정될 때까지 승인은 잠겨 있습니다. 영상·채널·중복·크레딧
          검수와 거절 기록은 계속할 수 있습니다.
        </p>
        {selected && (
          <div className="grid gap-4 rounded-xl border bg-muted/20 p-3 lg:grid-cols-[minmax(280px,420px)_1fr]">
            <div className="aspect-video overflow-hidden rounded-lg bg-black">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${selected.youtubeVideoId}`}
                title={`${selected.submittedTitle} 검수 영상`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="space-y-2 text-sm">
              <div className="font-semibold">{selected.submittedTitle}</div>
              <div>
                제출자{" "}
                <span className="font-mono">{selected.submittedByUserId}</span>
              </div>
              <div>
                원곡 가수:{" "}
                {selected.originalArtists
                  .map((artist) => artist.submittedNameSnapshot)
                  .join(", ") || "미입력"}
              </div>
              <div>
                참여자:{" "}
                {selected.participants
                  .map((participant) => participant.submittedNameSnapshot)
                  .join(", ") || "미입력"}
              </div>
              {selected.submittedNote && (
                <div className="rounded-md bg-background p-2 text-muted-foreground">
                  {selected.submittedNote}
                </div>
              )}
            </div>
          </div>
        )}
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            대기 중인 제안이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[850px]">
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>YouTube</TableHead>
                  <TableHead>참여자</TableHead>
                  <TableHead>거절 코드</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((proposal) => (
                  <TableRow
                    key={proposal.id}
                    data-state={
                      selected?.id === proposal.id ? "selected" : undefined
                    }
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-left hover:underline"
                        onClick={() => setSelectedId(proposal.id)}
                      >
                        {proposal.submittedTitle}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        v{proposal.version}
                      </div>
                    </TableCell>
                    <TableCell>
                      <a
                        className="text-primary hover:underline"
                        href={proposal.submittedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {proposal.youtubeVideoId}
                      </a>
                    </TableCell>
                    <TableCell>
                      {proposal.participants
                        .map((item) => item.submittedNameSnapshot)
                        .join(", ") || "미입력"}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${proposal.submittedTitle} 거절 코드`}
                        value={reasons[proposal.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [proposal.id]: event.target.value,
                          }))
                        }
                        placeholder="duplicate 등"
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" disabled title="GATE-01 확정 후 활성화">
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          !reasons[proposal.id]?.trim() || saving !== null
                        }
                        onClick={() =>
                          void run("제안 거절", () =>
                            rejectOtwPlayProposal(proposal.id, {
                              expectedVersion: proposal.version,
                              resultCode: reasons[proposal.id]!.trim(),
                            }),
                          )
                        }
                      >
                        거절
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntitySection({
  items,
  saving,
  run,
}: {
  items: OtwPlayAdminEntityDto[];
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const empty = {
    displayName: "",
    slug: "",
    entityKind: "person" as OtwPlayEntityKind,
    memberUid: "",
    archived: false,
  };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<OtwPlayAdminEntityDto | null>(null);
  const submit = async () => {
    const payload = {
      displayName: form.displayName,
      slug: form.slug,
      entityKind: form.entityKind,
      memberUid: form.memberUid ? Number(form.memberUid) : null,
    };
    const succeeded = await run(editing ? "인물 수정" : "인물 등록", () =>
      editing
        ? updateOtwPlayEntity({
            ...payload,
            id: editing.id,
            expectedVersion: editing.version,
            archived: form.archived,
          })
        : createOtwPlayEntity(payload),
    );
    if (!succeeded) return;
    setEditing(null);
    setForm(empty);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">인물·그룹 identity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="표시명">
            <Input
              aria-label="인물·그룹 표시명"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </Field>
          <Field label="slug">
            <Input
              aria-label="인물·그룹 slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </Field>
          <Field label="종류">
            <Select
              value={form.entityKind}
              onValueChange={(value) =>
                setForm({ ...form, entityKind: value as OtwPlayEntityKind })
              }
            >
              <SelectTrigger aria-label="인물·그룹 종류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="person">인물</SelectItem>
                <SelectItem value="group">그룹</SelectItem>
                <SelectItem value="organization">조직</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="현재 멤버 UID">
            <Input
              aria-label="현재 멤버 UID"
              type="number"
              min="1"
              value={form.memberUid}
              onChange={(e) => setForm({ ...form, memberUid: e.target.value })}
              disabled={form.entityKind !== "person"}
            />
          </Field>
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.archived}
              onChange={(event) =>
                setForm({ ...form, archived: event.target.checked })
              }
            />
            공개 카탈로그에서 보관 처리
          </label>
        )}
        <Button
          disabled={
            !form.displayName.trim() || !form.slug.trim() || saving !== null
          }
          onClick={() => void submit()}
        >
          <PlusCircle className="h-4 w-4" />
          {editing ? "수정 저장" : "등록"}
        </Button>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>표시명</TableHead>
                <TableHead>종류</TableHead>
                <TableHead>멤버 UID</TableHead>
                <TableHead>상태</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.displayName}</TableCell>
                  <TableCell>{item.entityKind}</TableCell>
                  <TableCell>{item.memberUid ?? "-"}</TableCell>
                  <TableCell>{item.archivedAt ? "보관" : "활성"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${item.displayName} 수정`}
                      onClick={() => {
                        setEditing(item);
                        setForm({
                          displayName: item.displayName,
                          slug: item.slug,
                          entityKind: item.entityKind,
                          memberUid: item.memberUid?.toString() ?? "",
                          archived: Boolean(item.archivedAt),
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelSection({
  items,
  entities,
  saving,
  run,
}: {
  items: OtwPlayAdminChannelDto[];
  entities: OtwPlayAdminEntityDto[];
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const empty = {
    externalChannelId: "",
    displayName: "",
    channelRole: "member_music" as OtwPlayChannelRole,
    entityIds: [] as string[],
    verificationStatus: "pending" as const,
    active: false,
  };
  const [form, setForm] = useState<{
    externalChannelId: string;
    displayName: string;
    channelRole: OtwPlayChannelRole;
    entityIds: string[];
    verificationStatus: "pending" | "approved" | "revoked";
    active: boolean;
  }>(empty);
  const [editing, setEditing] = useState<OtwPlayAdminChannelDto | null>(null);
  const submit = async () => {
    const core = {
      externalChannelId: form.externalChannelId,
      displayName: form.displayName,
      channelRole: form.channelRole,
      entityIds: form.entityIds,
    };
    const succeeded = await run(editing ? "채널 수정" : "채널 등록", () =>
      editing
        ? updateOtwPlayChannel({
            ...core,
            id: editing.id,
            expectedVersion: editing.version,
            verificationStatus: form.verificationStatus,
            active: form.active,
          })
        : createOtwPlayChannel(core),
    );
    if (!succeeded) return;
    setEditing(null);
    setForm(empty);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">공식 채널 allowlist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="YouTube channel ID">
            <Input
              aria-label="YouTube channel ID"
              value={form.externalChannelId}
              onChange={(e) =>
                setForm({ ...form, externalChannelId: e.target.value })
              }
            />
          </Field>
          <Field label="표시명 (YouTube 확인값으로 대체)">
            <Input
              aria-label="채널 표시명"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </Field>
          <Field label="역할">
            <Select
              value={form.channelRole}
              onValueChange={(value) =>
                setForm({ ...form, channelRole: value as OtwPlayChannelRole })
              }
            >
              <SelectTrigger aria-label="채널 역할">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "otw_official",
                  "unit_official",
                  "member_music",
                  "member_main",
                  "project_official",
                ].map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="연결 entity (복수 선택 가능)">
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {entities.map((entity) => (
                <label
                  key={entity.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.entityIds.includes(entity.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        entityIds: event.target.checked
                          ? [...form.entityIds, entity.id]
                          : form.entityIds.filter((id) => id !== entity.id),
                      })
                    }
                  />
                  {entity.displayName}
                </label>
              ))}
            </div>
          </Field>
        </div>
        {editing && (
          <div className="flex gap-3">
            <Field label="검수 상태">
              <Select
                value={form.verificationStatus}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    verificationStatus: value as typeof form.verificationStatus,
                    active: value === "approved" ? form.active : false,
                  })
                }
              >
                <SelectTrigger className="w-40" aria-label="채널 검수 상태">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="approved">approved</SelectItem>
                  <SelectItem value="revoked">revoked</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                disabled={form.verificationStatus !== "approved"}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{" "}
              활성
            </label>
          </div>
        )}
        <Button
          disabled={!form.externalChannelId || saving !== null}
          onClick={() => void submit()}
        >
          {editing ? "검수 저장" : "채널 확인 후 등록"}
        </Button>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>채널</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>검수</TableHead>
                <TableHead>활성</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>{item.displayName}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {item.externalChannelId}
                    </div>
                  </TableCell>
                  <TableCell>{item.channelRole}</TableCell>
                  <TableCell>{item.verificationStatus}</TableCell>
                  <TableCell>{item.active ? "예" : "아니오"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${item.displayName} 수정`}
                      onClick={() => {
                        setEditing(item);
                        setForm({
                          externalChannelId: item.externalChannelId,
                          displayName: item.displayName,
                          channelRole: item.channelRole,
                          entityIds: item.entityIds,
                          verificationStatus: item.verificationStatus,
                          active: item.active,
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SongSection({
  items,
  entities,
  saving,
  run,
}: {
  items: OtwPlayAdminSongDto[];
  entities: OtwPlayAdminEntityDto[];
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const empty = {
    title: "",
    slug: "",
    artistIds: [] as string[],
    aliases: "",
    isOtwOriginal: false,
  };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<OtwPlayAdminSongDto | null>(null);
  const submit = async () => {
    const core = {
      title: form.title,
      slug: form.slug,
      isOtwOriginal: form.isOtwOriginal,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown" as const,
      aliases: form.aliases
        .split("\n")
        .map((alias) => alias.trim())
        .filter(Boolean)
        .map((alias) => ({ alias })),
      originalArtists: form.artistIds.map((entityId, creditOrder) => ({
        entityId,
        creditOrder,
        isPrimary: creditOrder === 0,
      })),
    };
    const succeeded = await run(editing ? "곡 수정" : "곡 등록", () =>
      editing
        ? updateOtwPlaySong({
            ...core,
            id: editing.id,
            expectedVersion: editing.version,
          })
        : createOtwPlaySong(core),
    );
    if (!succeeded) return;
    setEditing(null);
    setForm(empty);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">곡 identity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="곡명">
            <Input
              aria-label="곡명"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="slug">
            <Input
              aria-label="곡 slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </Field>
          <Field label="원곡 가수 (복수 선택 가능)">
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {entities.map((entity) => (
                <label
                  key={entity.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.artistIds.includes(entity.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        artistIds: event.target.checked
                          ? [...form.artistIds, entity.id]
                          : form.artistIds.filter((id) => id !== entity.id),
                      })
                    }
                  />
                  {entity.displayName}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Field label="별칭 (줄마다 하나)">
          <Textarea
            aria-label="곡 별칭"
            value={form.aliases}
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isOtwOriginal}
            onChange={(e) =>
              setForm({ ...form, isOtwOriginal: e.target.checked })
            }
          />{" "}
          OTW 오리지널
        </label>
        <Button
          disabled={
            !form.title ||
            !form.slug ||
            form.artistIds.length === 0 ||
            saving !== null
          }
          onClick={() => void submit()}
        >
          {editing ? "곡 수정 저장" : "곡 등록"}
        </Button>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>곡</TableHead>
                <TableHead>원곡 가수</TableHead>
                <TableHead>종류</TableHead>
                <TableHead>version</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.originalArtists
                      .map((artist) => artist.displayName)
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    {item.isOtwOriginal ? "오리지널" : "일반"}
                  </TableCell>
                  <TableCell>{item.version}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${item.title} 수정`}
                      onClick={() => {
                        setEditing(item);
                        setForm({
                          title: item.title,
                          slug: item.slug,
                          artistIds: item.originalArtists.map(
                            (artist) => artist.entityId,
                          ),
                          aliases: item.aliases
                            .map((alias) => alias.alias)
                            .join("\n"),
                          isOtwOriginal: item.isOtwOriginal,
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PerformanceSection({
  items,
  songs,
  entities,
  channels,
  saving,
  run,
  confirm,
}: {
  items: OtwPlayAdminPerformanceDto[];
  songs: OtwPlayAdminSongDto[];
  entities: OtwPlayAdminEntityDto[];
  channels: OtwPlayAdminChannelDto[];
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
  confirm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      action: () => Promise<void>;
      destructive?: boolean;
    } | null>
  >;
}) {
  const empty = {
    songId: "",
    participantIds: [] as string[],
    channelId: "",
    youtubeUrl: "",
    relationType: "cover" as OtwPlayRelationType,
    releaseType: "official_video" as "official_mv" | "official_video",
    participationType: "solo" as OtwPlayParticipationType,
    releasedAt: "",
  };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<OtwPlayAdminPerformanceDto | null>(
    null,
  );
  const channel = useMemo(
    () => channels.find((item) => item.id === form.channelId),
    [channels, form.channelId],
  );
  const submit = async () => {
    const core = {
      songId: form.songId,
      relationType: form.relationType,
      releaseType: form.releaseType,
      participationType: form.participationType,
      qualityStatus: "ok" as const,
      releasedAt: asEpoch(form.releasedAt),
      participants: form.participantIds.map((entityId, creditOrder) => {
        const participant = entities.find((item) => item.id === entityId)!;
        return {
          entityId,
          participantRole: "vocal" as const,
          creditOrder,
          creditNameSnapshot: participant.displayName,
        };
      }),
      source: {
        youtubeUrl: form.youtubeUrl,
        channelId: form.channelId,
        startSeconds: 0,
        sourceRole: "official" as const,
      },
    };
    const succeeded = await run(
      editing ? "가창 수정" : "가창 draft 등록",
      () =>
        editing
          ? updateOtwPlayPerformance({
              ...core,
              id: editing.id,
              expectedVersion: editing.version,
            })
          : createOtwPlayPerformance(core),
    );
    if (!succeeded) return;
    setEditing(null);
    setForm(empty);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">가창 draft와 게시</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="곡">
            <Select
              value={form.songId}
              onValueChange={(songId) => setForm({ ...form, songId })}
            >
              <SelectTrigger aria-label="가창 곡">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {songs.map((song) => (
                  <SelectItem key={song.id} value={song.id}>
                    {song.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="가창 참여자 (복수 선택 가능)">
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {entities.map((entity) => (
                <label
                  key={entity.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.participantIds.includes(entity.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        participantIds: event.target.checked
                          ? [...form.participantIds, entity.id]
                          : form.participantIds.filter(
                              (id) => id !== entity.id,
                            ),
                      })
                    }
                  />
                  {entity.displayName}
                </label>
              ))}
            </div>
          </Field>
          <Field label="승인 채널">
            <Select
              value={form.channelId}
              onValueChange={(channelId) => setForm({ ...form, channelId })}
            >
              <SelectTrigger aria-label="가창 승인 채널">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.displayName} · {item.verificationStatus}
                    {item.active ? " 활성" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="YouTube URL">
            <Input
              aria-label="가창 YouTube URL"
              value={form.youtubeUrl}
              onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
            />
          </Field>
          <Field label="공개일">
            <Input
              aria-label="가창 공개일"
              type="date"
              value={form.releasedAt}
              onChange={(e) => setForm({ ...form, releasedAt: e.target.value })}
            />
          </Field>
          <Field label="곡 관계">
            <Select
              value={form.relationType}
              onValueChange={(value) =>
                setForm({ ...form, relationType: value as OtwPlayRelationType })
              }
            >
              <SelectTrigger aria-label="곡 관계">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">original</SelectItem>
                <SelectItem value="cover">cover</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="공개 형태">
            <Select
              value={form.releaseType}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  releaseType: value as "official_mv" | "official_video",
                })
              }
            >
              <SelectTrigger aria-label="공개 형태">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="official_mv">official_mv</SelectItem>
                <SelectItem value="official_video">official_video</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="참여 형태">
            <Select
              value={form.participationType}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  participationType: value as OtwPlayParticipationType,
                })
              }
            >
              <SelectTrigger aria-label="참여 형태">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["solo", "duet", "unit", "group", "external_collab"].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {channel &&
          (!channel.active || channel.verificationStatus !== "approved") && (
            <p className="text-sm text-destructive">
              이 채널로 draft는 만들 수 있지만 게시할 수 없습니다.
            </p>
          )}
        <Button
          disabled={
            !form.songId ||
            form.participantIds.length === 0 ||
            !form.channelId ||
            !form.youtubeUrl ||
            saving !== null
          }
          onClick={() => void submit()}
        >
          {editing ? "가창 수정 저장" : "YouTube 확인 후 draft 생성"}
        </Button>
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>곡</TableHead>
                <TableHead>분류</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>참여자</TableHead>
                <TableHead>source</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {songs.find((song) => song.id === item.songId)?.title ??
                      item.songId}
                  </TableCell>
                  <TableCell>
                    {item.relationType} · {item.releaseType} ·{" "}
                    {item.participationType}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.publicationStatus === "published"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {item.publicationStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.participants
                      .map((participant) => participant.displayName)
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    {item.sources[0]?.source.externalId ?? "없음"}
                    {item.sources[0] && (
                      <Button
                        className="ml-2"
                        size="sm"
                        variant="outline"
                        disabled={saving !== null}
                        onClick={() => {
                          const source = item.sources[0]!.source;
                          void run("source 재검사", () =>
                            recheckOtwPlaySource(source.id, {
                              expectedVersion: source.version,
                              youtubeUrl: `https://www.youtube.com/watch?v=${source.externalId}`,
                              channelId: source.channelId,
                            }),
                          );
                        }}
                      >
                        재검사
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${songs.find((song) => song.id === item.songId)?.title ?? item.id} 가창 수정`}
                      disabled={
                        item.publicationStatus === "withdrawn" ||
                        !isMvpReleaseType(item.releaseType)
                      }
                      onClick={() => {
                        if (!isMvpReleaseType(item.releaseType)) return;
                        const source = item.sources[0];
                        setEditing(item);
                        setForm({
                          songId: item.songId,
                          participantIds: item.participants.map(
                            (participant) => participant.entityId,
                          ),
                          channelId: source?.source.channelId ?? "",
                          youtubeUrl: source
                            ? `https://www.youtube.com/watch?v=${source.source.externalId}`
                            : "",
                          relationType: item.relationType,
                          releaseType: item.releaseType,
                          participationType: item.participationType,
                          releasedAt: asDay(item.releasedAt),
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {item.publicationStatus === "draft" && (
                      <Button
                        size="sm"
                        disabled={saving !== null}
                        onClick={() =>
                          confirm({
                            title: "가창 게시",
                            description:
                              "승인·활성 공식 채널, 실제 가창 credit와 primary source를 확인한 뒤 공개합니다.",
                            action: async () => {
                              await run("가창 게시", () =>
                                publishOtwPlayPerformance(item.id, {
                                  expectedVersion: item.version,
                                }),
                              );
                            },
                          })
                        }
                      >
                        게시
                      </Button>
                    )}
                    {item.publicationStatus === "published" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving !== null}
                        onClick={() =>
                          confirm({
                            title: "가창 철회",
                            description:
                              "공개 목록에서는 제거되지만 metadata와 감사 이력은 보존됩니다.",
                            destructive: true,
                            action: async () => {
                              await run("가창 철회", () =>
                                withdrawOtwPlayPerformance(item.id, {
                                  expectedVersion: item.version,
                                }),
                              );
                            },
                          })
                        }
                      >
                        철회
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
