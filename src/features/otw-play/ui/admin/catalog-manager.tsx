import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  OtwPlayAdminChannelDto,
  OtwPlayAdminEntityDto,
  OtwPlayChannelRole,
} from "@contracts/otw-play";
import { AdminSectionHeader } from "@/app/admin";
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
import { useToast } from "@/shared/ui/toast";
import {
  Loader2,
  Pencil,
  RefreshCw,
  Settings2,
  Video,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";
import {
  createOtwPlayChannel,
  rejectOtwPlayProposal,
  updateOtwPlayChannel,
  updateOtwPlayEntity,
} from "../../api/admin";
import {
  useOtwPlayAdminCatalog,
  useOtwPlayAdminProposals,
} from "../../queries/use-admin-catalog";
import { CatalogEntryDialog } from "./catalog-entry-dialog";
import { WorkflowCatalog } from "./workflow-catalog";

type Section = "catalog" | "review";

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: "catalog", label: "카탈로그" },
  { value: "review", label: "제안 검수" },
];

const channelRoleLabels: Record<OtwPlayChannelRole, string> = {
  otw_official: "OTW 공식",
  unit_official: "유닛 공식",
  member_music: "멤버 노래 채널",
  member_main: "멤버 메인 채널",
  project_official: "승인 프로젝트",
  approved_kirinuki: "승인 키리누키",
  other: "기타",
};

const channelVerificationLabels = {
  pending: "검수 대기",
  approved: "승인됨",
  revoked: "철회됨",
} as const;

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

export function OtwPlayCatalogManager() {
  const catalogQuery = useOtwPlayAdminCatalog();
  const proposalsQuery = useOtwPlayAdminProposals();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>("catalog");
  const [saving, setSaving] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [preselectedSongId, setPreselectedSongId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        description="YouTube 영상 하나를 확인해 곡, 가창, 참여자와 공식 채널을 한 흐름에서 등록합니다."
        count={catalog.songs.length}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setPreselectedSongId(null);
                setRegistrationOpen(true);
              }}
            >
              <Video className="h-4 w-4" /> 새 영상 등록
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(true)}>
              <Settings2 className="h-4 w-4" /> 고급 관리
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={catalogQuery.isFetching}
            >
              {catalogQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              새로고침
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">곡 {catalog.songs.length}</Badge>
        <Badge variant="secondary">가창 {catalog.performances.length}</Badge>
      </div>
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
      {section === "catalog" && (
        <WorkflowCatalog
          catalog={catalog}
          saving={effectiveSaving}
          run={run}
          onAddPerformance={(songId) => {
            setPreselectedSongId(songId);
            setRegistrationOpen(true);
          }}
        />
      )}

      <CatalogEntryDialog
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
        catalog={catalog}
        preselectedSongId={preselectedSongId}
        onSaved={refresh}
      />
      <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-3xl">
          <SheetTitle>고급 관리</SheetTitle>
          <SheetDescription>
            채널 상태와 외부 인물·그룹 identity만 관리합니다. 현재 멤버 정보는 members가 권위입니다.
          </SheetDescription>
          <div className="space-y-6 pb-8">
            <ChannelSection
              items={catalog.channels}
              entities={catalog.entities}
              saving={effectiveSaving}
              run={run}
            />
            <EntitySection
              items={catalog.entities.filter((item) => item.memberUid === null)}
              saving={effectiveSaving}
              run={run}
            />
          </div>
        </SheetContent>
      </Sheet>
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
  const [editing, setEditing] = useState<OtwPlayAdminEntityDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [archived, setArchived] = useState(false);

  const beginEdit = (item: OtwPlayAdminEntityDto) => {
    setEditing(item);
    setDisplayName(item.displayName);
    setArchived(Boolean(item.archivedAt));
  };

  const submit = async () => {
    if (!editing) return;
    const succeeded = await run("외부 identity 수정", () =>
      updateOtwPlayEntity({
        id: editing.id,
        expectedVersion: editing.version,
        displayName: displayName.trim(),
        slug: editing.slug,
        entityKind: editing.entityKind,
        memberUid: null,
        archived,
      }),
    );
    if (succeeded) setEditing(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">외부 인물·그룹 identity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          새 identity는 영상 등록의 외부 인물·그룹 칩에서 만듭니다. 여기서는 이름 수정과 보관만 관리합니다.
        </p>
        {editing && (
          <div className="space-y-3 rounded-lg border p-3">
            <Field label="표시명">
              <Input
                aria-label="외부 identity 표시명"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
              />
              공개 카탈로그에서 보관 처리
            </label>
            <div className="flex gap-2">
              <Button
                disabled={!displayName.trim() || saving !== null}
                onClick={() => void submit()}
              >
                수정 저장
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving !== null}
                onClick={() => setEditing(null)}
              >
                취소
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            저장된 외부 인물·그룹이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>표시명</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.displayName}</TableCell>
                    <TableCell>
                      {item.entityKind === "group" ? "그룹" : "외부 인물"}
                    </TableCell>
                    <TableCell>{item.archivedAt ? "보관" : "활성"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${item.displayName} 수정`}
                        onClick={() => beginEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
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
                    {channelRoleLabels[role as OtwPlayChannelRole]}
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
                  <SelectItem value="pending">검수 대기</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="revoked">철회됨</SelectItem>
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
                  <TableCell>{channelRoleLabels[item.channelRole]}</TableCell>
                  <TableCell>{channelVerificationLabels[item.verificationStatus]}</TableCell>
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
