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
import { Checkbox } from "@/shared/ui/checkbox";
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
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {description && (
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    )}
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
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-4xl">
          <div className="border-b bg-background p-6 pr-12">
            <SheetTitle className="text-lg">고급 관리</SheetTitle>
            <SheetDescription className="mt-1.5 max-w-2xl leading-relaxed">
              일상 등록에서 자동 처리하지 못한 채널 상태와 외부 인물·그룹만
              수정합니다. 현재 멤버 정보는 members가 권위입니다.
            </SheetDescription>
          </div>
          <div className="space-y-6 p-4 pb-10 sm:p-6">
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
      <CardHeader className="border-b">
        <CardTitle className="text-base">외부 인물·그룹</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          영상 등록에서 만든 외부 가수·참여자·그룹의 표시명과 보관 상태를 관리합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {editing && (
          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div>
              <div className="font-medium">{editing.displayName} 수정</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {editing.entityKind === "group" ? "그룹" : "외부 인물"} · 내부 식별자는 변경하지 않습니다.
              </div>
            </div>
            <Field
              label="표시명"
              htmlFor="advanced-entity-display-name"
              description="검색·칩·공개 크레딧에 표시되는 이름입니다."
            >
              <Input
                id="advanced-entity-display-name"
                aria-label="외부 identity 표시명"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
              <Checkbox
                id="advanced-entity-archived"
                checked={archived}
                onCheckedChange={(checked) => setArchived(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="advanced-entity-archived">보관 처리</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  새 등록 후보와 공개 카탈로그에서 제외하되 기존 기록은 유지합니다.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={saving !== null}
                onClick={() => setEditing(null)}
              >
                취소
              </Button>
              <Button
                disabled={!displayName.trim() || saving !== null}
                onClick={() => void submit()}
              >
                수정 저장
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            저장된 외부 인물·그룹이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-medium">저장된 identity</div>
            <div className="overflow-x-auto rounded-lg border">
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
      <CardHeader className="border-b">
        <CardTitle className="text-base">공식 채널</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          인라인 등록에서 확인된 YouTube 채널의 역할, 연결 주체와 사용 가능 상태를 관리합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-5 rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">{editing ? `${editing.displayName} 수정` : "채널 수동 등록"}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                일반 등록에서는 영상 확인 단계가 채널을 자동 인식합니다. 이 폼은 예외 보정용입니다.
              </p>
            </div>
            {editing && <Badge variant="outline">version {editing.version}</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="YouTube 채널 ID"
            htmlFor="advanced-channel-id"
            description="YouTube의 UC로 시작하는 권위 channel ID를 입력합니다."
          >
            <Input
              id="advanced-channel-id"
              aria-label="YouTube channel ID"
              value={form.externalChannelId}
              onChange={(e) =>
                setForm({ ...form, externalChannelId: e.target.value })
              }
            />
          </Field>
          <Field
            label="채널 표시명"
            htmlFor="advanced-channel-display-name"
            description="관리 화면과 출처 정보에 표시할 이름입니다."
          >
            <Input
              id="advanced-channel-display-name"
              aria-label="채널 표시명"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </Field>
          <Field label="채널 역할" description="공개 source 우선순위와 공식성 판단에 사용합니다.">
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
          <Field
            label="소유·연결 주체"
            description="이 채널을 공식적으로 소유하거나 운영하는 멤버·그룹을 모두 선택합니다."
          >
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
              {entities.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">선택할 identity가 없습니다.</p>
              )}
              {entities.map((entity) => (
                <label
                  key={entity.id}
                  htmlFor={`advanced-channel-owner-${entity.id}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={`advanced-channel-owner-${entity.id}`}
                    checked={form.entityIds.includes(entity.id)}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        entityIds: checked === true
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
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <Field label="검수 상태" description="승인됨 상태에서만 채널을 활성화할 수 있습니다.">
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
                <SelectTrigger aria-label="채널 검수 상태">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">검수 대기</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="revoked">철회됨</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
              <Checkbox
                id="advanced-channel-active"
                checked={form.active}
                disabled={form.verificationStatus !== "approved"}
                onCheckedChange={(checked) => setForm({ ...form, active: checked === true })}
              />
              <div className="space-y-1">
                <Label htmlFor="advanced-channel-active">카탈로그 source에 사용</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  비활성 채널의 영상은 공개 source 후보로 선택되지 않습니다.
                </p>
              </div>
            </div>
          </div>
        )}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {editing && (
              <Button
                type="button"
                variant="outline"
                disabled={saving !== null}
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                취소
              </Button>
            )}
            <Button
              disabled={!form.externalChannelId.trim() || !form.displayName.trim() || saving !== null}
              onClick={() => void submit()}
            >
              {editing ? "채널 수정 저장" : "채널 확인 후 등록"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">등록된 채널</div>
          <div className="overflow-x-auto rounded-lg border">
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
        </div>
      </CardContent>
    </Card>
  );
}
