import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  OtwPlayAdminChannelDto,
  OtwPlayAdminEntityDto,
  OtwPlayChannelRole,
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogChannelDecision,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogSongDecision,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminPerformanceDto,
  OtwPlayEntityKind,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayReleaseType,
} from "@contracts/otw-play";
import { AdminSectionHeader, ConfirmActionDialog } from "@/app/admin";
import { ApiError } from "@/shared/api/client";
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
  Plus,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import {
  createOtwPlayChannel,
  deleteOtwPlayEntity,
  lookupOtwPlayChannel,
  approveOtwPlayProposal,
  publishOtwPlayPerformance,
  preflightOtwPlayCatalogEntry,
  rejectOtwPlayProposal,
  updateOtwPlayChannel,
  updateOtwPlayEntity,
} from "../../api/admin";
import {
  useOtwPlayAdminCatalog,
  useOtwPlayAdminObservability,
  useOtwPlayAdminProposals,
  useOtwPlayAdminRelease,
  useOtwPlayAdminSourceHealth,
} from "../../queries/use-admin-catalog";
import { CatalogEntryDialog } from "./catalog-entry-dialog";
import { SongTagPicker } from "../song-tag-picker";
import { WorkflowCatalog } from "./workflow-catalog";
import { SourceHealthSection } from "./source-health-section";
import { OperationsSection } from "./operations-section";
import { IngestionSection } from "./ingestion-section";
import { ChannelMonitorSection } from "./channel-monitor-section";

export type Section =
  | "catalog"
  | "import"
  | "channels"
  | "automatic-review"
  | "review"
  | "source-health"
  | "operations";

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: "catalog", label: "카탈로그" },
  { value: "import", label: "가져오기" },
  { value: "channels", label: "승인 채널" },
  { value: "automatic-review", label: "자동 검수" },
  { value: "review", label: "제안 검수" },
  { value: "source-health", label: "소스 상태" },
  { value: "operations", label: "운영·공개" },
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

const participantRoleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};

const releaseTypeLabels: Record<
  Extract<OtwPlayReleaseType, "official_mv" | "official_video">,
  string
> = {
  official_mv: "공식 MV",
  official_video: "공식 영상",
};

const participationTypeLabels: Record<OtwPlayParticipationType, string> = {
  solo: "솔로",
  duet: "듀엣",
  unit: "유닛",
  group: "단체",
  external_collab: "외부 협업",
};

type ReviewIdentity = {
  rowKey: string;
  resolvedEntityId: string | null;
  submittedMemberUid: number | null;
  submittedNameSnapshot: string;
  entityKind: Extract<OtwPlayEntityKind, "person" | "group">;
};

type ReviewParticipant = ReviewIdentity & {
  participantRole: OtwPlayParticipantRole;
};

type ReviewChannelOwner = ReviewIdentity & {
  source: "custom" | `participant:${string}` | `artist:${string}`;
};

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

export function OtwPlayCatalogManager({ activeSection, onSectionChange, monitorMode }: { activeSection?: Section; onSectionChange?: (section: Section) => void; monitorMode?: "review" | "sources" } = {}) {
  const catalogQuery = useOtwPlayAdminCatalog();
  const proposalsQuery = useOtwPlayAdminProposals();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [localSection, setLocalSection] = useState<Section>("catalog");
  const section = activeSection ?? localSection;
  const setSection = onSectionChange ?? setLocalSection;
  const sourceHealthQuery = useOtwPlayAdminSourceHealth(
    section === "source-health" || section === "operations",
  );
  const observabilityQuery = useOtwPlayAdminObservability(
    section === "operations",
  );
  const releaseQuery = useOtwPlayAdminRelease(section === "operations");
  const [saving, setSaving] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [preselectedSongId, setPreselectedSongId] = useState<string | null>(null);

  const catalog = catalogQuery.data;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminCatalog(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminProposals("pending_review"),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminSourceHealth(),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
    ]);
  };
  const refreshRelease = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminRelease(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminObservability(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminSourceHealth(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.config("public"),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.config("admin-preview"),
      }),
    ]);
  };
  const run = async (label: string, task: () => Promise<unknown>) => {
    setSaving(label);
    try {
      const result = await task();
      await refresh();
      const check = (
        result as { check?: { status?: string; retryCode?: string } } | null
      )?.check;
      if (check?.status === "retry_scheduled") {
        toast({
          variant: "info",
          description: `외부 API 재시도 대기 상태로 저장했습니다 (${check.retryCode ?? "unknown"}).`,
        });
      } else {
        toast({
          variant: "success",
          description: `${label.startsWith("source:") ? "source 재검사" : label} 작업을 완료했습니다.`,
        });
      }
      return true;
    } catch (error) {
      console.error("OTW Play admin command failed", error);
      const description =
        error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE"
          ? "다른 점검이 먼저 반영되었습니다. 최신 상태를 다시 불러왔습니다."
          : label === "외부 identity 삭제" &&
              error instanceof ApiError &&
              error.fields?.entity === "referenced"
            ? "곡·가창·승인 채널·제안 또는 저장된 후보 검수에 연결된 외부 주체는 삭제할 수 없습니다. 연결을 먼저 교정하거나 보관 처리해 주세요."
            : `${label.startsWith("source:") ? "source 재검사" : label} 작업에 실패했습니다.`;
      toast({
        variant: "error",
        description,
      });
      if (error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE") {
        await refresh();
      }
      return false;
    } finally {
      setSaving(null);
    }
  };

  const publishDraftPerformances = async (
    performances: OtwPlayAdminPerformanceDto[],
  ) => {
    if (saving !== null || performances.length === 0) return;
    let published = 0;
    let failed = 0;
    try {
      for (const [index, performance] of performances.entries()) {
        setSaving(`미게시 가창 게시 ${index + 1}/${performances.length}`);
        try {
          await publishOtwPlayPerformance(performance.id, {
            expectedVersion: performance.version,
          });
          published += 1;
        } catch {
          failed += 1;
        }
      }
      await refresh();
      if (failed === 0) {
        toast({
          variant: "success",
          description: `미게시 가창 ${published}개를 모두 게시했습니다.`,
        });
      } else if (published > 0) {
        toast({
          variant: "info",
          description: `${published}개를 게시했고 ${failed}개는 검증 실패 또는 동시 변경으로 임시 저장 상태를 유지했습니다.`,
        });
      } else {
        toast({
          variant: "error",
          description: `${failed}개 항목을 게시하지 못했습니다. 채널 승인, 가창 참여자와 최신 상태를 확인해 주세요.`,
        });
      }
    } finally {
      setSaving(null);
    }
  };

  const catalogSection =
    section === "catalog" || section === "import" || section === "channels" || section === "review";
  const readModelReady = catalog
    ? catalog.revision === catalog.readModelRevision
    : false;
  const effectiveSaving = readModelReady ? saving : "read-model-unavailable";

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        title={monitorMode === "sources" && section === "automatic-review" ? "Play 채널 감시" : activeSection ? SECTIONS.find((item) => item.value === section)?.label ?? "OTW Play" : "OTW Play 카탈로그"}
        description={section === "import" ? "가져온 영상의 검토 대상을 선택하고, 근거를 확인해 카탈로그에 임시 저장합니다." : section === "automatic-review" ? monitorMode === "sources" ? "감시 채널의 수집 상태와 승인 연결을 확인합니다." : "새 업로드 후보를 오래된 순서로 검토합니다. 검토 저장과 게시는 별도 동작입니다." : section === "review" ? "사용자 제안의 영상·곡·참여자를 확인한 뒤 승인하거나 거절합니다." : "곡, 가창, 참여자와 공식 채널을 연결하고 공개 상태를 관리합니다."}
        count={section === "catalog" ? catalog?.songs.length : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {catalog && section === "catalog" && (
              <Button
                size="sm"
                onClick={() => {
                  setPreselectedSongId(null);
                  setRegistrationOpen(true);
                }}
              >
                <Video className="h-4 w-4" /> 새 영상 등록
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={catalogQuery.isFetching}
            >
              {catalogQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              상태 새로고침
            </Button>
          </div>
        }
      />
      <QueryReadback updatedAt={catalogQuery.dataUpdatedAt} fetching={catalogQuery.isFetching} error={catalogQuery.isError && Boolean(catalog)} />
      {catalog && section === "catalog" && (
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">곡 {catalog.songs.length}</Badge>
          <Badge variant="secondary">가창 {catalog.performances.length}</Badge>
        </div>
      )}
      <div className={activeSection && section !== "catalog" ? "hidden" : "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"}>
        {!activeSection && SECTIONS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={section === item.value ? "default" : "ghost"}
            onClick={() => setSection(item.value)}
          >
            {item.label}
          </Button>
        ))}
        {catalog && (
          <details className="ml-auto text-xs text-muted-foreground"><summary className="cursor-pointer">공개 데이터 {readModelReady ? "반영됨" : "불일치 확인 필요"}</summary><div className="mt-2 flex gap-2">
            <Badge variant="outline">카탈로그 r{catalog.revision}</Badge>
            <Badge
              variant={readModelReady ? "secondary" : "destructive"}
            >
              공개 데이터 r{catalog.readModelRevision}
            </Badge>
          </div></details>
        )}
      </div>
      {catalog && !readModelReady && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          저장된 카탈로그와 공개용 데이터가 일치하지 않습니다. 데이터 반영 상태를 복구하고
          검증할 때까지 편집할 수 없습니다.
        </div>
      )}

      {catalogSection && catalogQuery.isLoading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      )}
      {catalogSection && !catalogQuery.isLoading && !catalog && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm"
        >
          OTW Play 관리자 카탈로그를 불러오지 못했습니다. 카탈로그 작업은
          복구 후 다시 시도해 주세요. 운영·공개와 소스 상태는 위 메뉴에서
          독립적으로 확인할 수 있습니다.
        </div>
      )}

      {section === "review" && catalog && (
        <ProposalSection
          catalog={catalog}
          proposals={proposalsQuery.data ?? []}
          loading={proposalsQuery.isLoading}
          fetching={proposalsQuery.isFetching}
          error={proposalsQuery.error}
          refetch={proposalsQuery.refetch}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "import" && catalog && (
        <IngestionSection
          catalog={catalog}
          onOpenCatalog={() => setSection("catalog")}
        />
      )}
      {section === "automatic-review" && (
        <ChannelMonitorSection
          mode={monitorMode}
          catalog={catalog ?? null}
          catalogLoading={catalogQuery.isLoading}
          onOpenCatalog={() => setSection("catalog")}
        />
      )}
      {section === "channels" && catalog && (
        <ChannelSection
          items={catalog.channels}
          entities={catalog.entities}
          referencedEntityIds={new Set([
            ...catalog.songs.flatMap((song) =>
              song.originalArtists.map((artist) => artist.entityId)
            ),
            ...catalog.performances.flatMap((performance) =>
              performance.participants.map((participant) => participant.entityId)
            ),
            ...catalog.channels.flatMap((channel) => channel.entityIds),
            ...(proposalsQuery.data ?? []).flatMap((proposal) => [
              ...proposal.participants.flatMap((participant) =>
                participant.resolvedEntityId ? [participant.resolvedEntityId] : []
              ),
              ...proposal.originalArtists.flatMap((artist) =>
                artist.resolvedEntityId ? [artist.resolvedEntityId] : []
              ),
            ]),
          ])}
          saving={effectiveSaving}
          run={run}
        />
      )}
      {section === "catalog" && catalog && (
        <WorkflowCatalog
          catalog={catalog}
          saving={effectiveSaving}
          run={run}
          onPublishDrafts={publishDraftPerformances}
          onAddPerformance={(songId) => {
            setPreselectedSongId(songId);
            setRegistrationOpen(true);
          }}
        />
      )}
      {section === "source-health" && (
        <SourceHealthSection
          data={sourceHealthQuery.data}
          loading={sourceHealthQuery.isLoading}
          fetching={sourceHealthQuery.isFetching}
          error={sourceHealthQuery.error}
          saving={saving}
          run={run}
          refetch={sourceHealthQuery.refetch}
        />
      )}
      {section === "operations" && (
        <OperationsSection
          observability={observabilityQuery.data}
          observabilityLoading={observabilityQuery.isLoading}
          observabilityError={observabilityQuery.error}
          observabilityFetching={observabilityQuery.isFetching}
          refetchObservability={observabilityQuery.refetch}
          release={releaseQuery.data}
          releaseLoading={releaseQuery.isLoading}
          releaseError={releaseQuery.error}
          sourceHealth={sourceHealthQuery.data}
          onReleaseChanged={refreshRelease}
          onOpenSourceHealth={() => setSection("source-health")}
        />
      )}

      {catalog && (
        <CatalogEntryDialog
          open={registrationOpen}
          onOpenChange={setRegistrationOpen}
          catalog={catalog}
          preselectedSongId={preselectedSongId}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function ProposalSection({
  catalog,
  proposals,
  loading,
  fetching,
  error,
  refetch,
  saving,
  run,
}: {
  catalog: OtwPlayAdminCatalogDto;
  proposals: ReturnType<typeof useOtwPlayAdminProposals>["data"] extends infer T
    ? NonNullable<T>
    : never;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [proposalDirty, setProposalDirty] = useState(false);
  useUnsavedChanges(proposalDirty);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, updateSearch] = useConsoleSearch();
  const selectedId = search.selected ?? null;
  const setSelectedId = (selected: string | null) => updateSearch({selected: selected ?? undefined}, false);
  const [approvalPreflight, setApprovalPreflight] =
    useState<OtwPlayAdminCatalogEntryPreflightDto | null>(null);
  const approvalPreflightRequestId = useRef(0);
  const [singingCreditConfirmed, setSingingCreditConfirmed] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);
  const [channelRole, setChannelRole] =
    useState<Extract<OtwPlayChannelRole, "otw_official" | "unit_official" | "member_music" | "member_main" | "project_official">>("project_official");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewSongId, setReviewSongId] = useState("__new");
  const [reviewSongTags, setReviewSongTags] = useState<string[]>([]);
  const [reviewPerformanceTags, setReviewPerformanceTags] = useState<string[]>([]);
  const [reviewParticipants, setReviewParticipants] = useState<ReviewParticipant[]>([]);
  const [reviewArtists, setReviewArtists] = useState<ReviewIdentity[]>([]);
  const [reviewChannelOwners, setReviewChannelOwners] = useState<ReviewChannelOwner[]>([]);
  const [reviewReleaseType, setReviewReleaseType] = useState<
    Extract<OtwPlayReleaseType, "official_mv" | "official_video">
  >("official_video");
  const [reviewParticipationType, setReviewParticipationType] =
    useState<OtwPlayParticipationType>("solo");
  const selected =
    proposals.find((proposal) => proposal.id === selectedId) ??
    proposals[0] ??
    null;
  const selectedProposalIdRef = useRef<string | null>(selected?.id ?? null);
  const channelNeedsConfirmation = Boolean(
    approvalPreflight &&
      ["unknown", "pending", "inactive"].includes(approvalPreflight.channel.state),
  );

  useEffect(() => {
    setProposalDirty(false);
    selectedProposalIdRef.current = selected?.id ?? null;
    approvalPreflightRequestId.current += 1;
    if (!selected) {
      setReviewTitle("");
      setReviewSongId("__new");
      setReviewSongTags([]);
      setReviewPerformanceTags([]);
      setReviewParticipants([]);
      setReviewArtists([]);
      setReviewChannelOwners([]);
      setApprovalPreflight(null);
      return;
    }
    setReviewTitle(selected.submittedTitle);
    setReviewSongId(selected.suggestedSongId ?? "__new");
    setReviewSongTags(selected.suggestedSongId ? [] : selected.tags);
    setReviewPerformanceTags([]);
    setReviewParticipants(
      selected.participants.map((participant) => ({
        rowKey: `proposal-participant-${participant.creditOrder}`,
        resolvedEntityId: participant.resolvedEntityId,
        submittedMemberUid: participant.submittedMemberUid,
        submittedNameSnapshot: participant.submittedNameSnapshot,
        participantRole: participant.participantRole,
        entityKind:
          catalog.entities.find((entity) => entity.id === participant.resolvedEntityId)
            ?.entityKind === "group"
            ? "group"
            : "person",
      })),
    );
    setReviewArtists(
      selected.originalArtists.map((artist) => ({
        rowKey: `proposal-artist-${artist.creditOrder}`,
        resolvedEntityId: artist.resolvedEntityId,
        submittedMemberUid: artist.submittedMemberUid,
        submittedNameSnapshot: artist.submittedNameSnapshot,
        entityKind:
          catalog.entities.find((entity) => entity.id === artist.resolvedEntityId)
            ?.entityKind === "group"
            ? "group"
            : "person",
      })),
    );
    setReviewChannelOwners([]);
    setReviewReleaseType("official_video");
    setReviewParticipationType(
      selected.participants.length === 1
        ? "solo"
        : selected.participants.length === 2
          ? "duet"
          : "external_collab",
    );
    setApprovalPreflight(null);
    setSingingCreditConfirmed(false);
  }, [catalog.entities, selected]);
  const proposalSubject = (
    value: ReviewIdentity,
    clientKey: string,
  ): OtwPlayAdminCatalogSubjectInput =>
    typeof value.submittedMemberUid === "number"
      ? { kind: "member", memberUid: value.submittedMemberUid }
      : value.resolvedEntityId
      ? { kind: "entity", entityId: value.resolvedEntityId }
      : {
          kind: "new_external",
          clientKey,
          displayName: value.submittedNameSnapshot,
          entityKind: value.entityKind,
        };
  const channelOwnerSubject = (owner: ReviewChannelOwner, index: number) => {
    if (owner.source.startsWith("participant:")) {
      const participantKey = owner.source.slice("participant:".length);
      const participant = reviewParticipants.find((item) => item.rowKey === participantKey);
      if (participant) {
        return proposalSubject(participant, participant.rowKey);
      }
    }
    if (owner.source.startsWith("artist:")) {
      const artistKey = owner.source.slice("artist:".length);
      const artist = reviewArtists.find((item) => item.rowKey === artistKey);
      if (artist) {
        return proposalSubject(artist, artist.rowKey);
      }
    }
    return proposalSubject(owner, `proposal-channel-owner-${index}`);
  };

  const verifySelected = async () => {
    if (!selected) return;
    const selectedProposalId = selected.id;
    const requestId = ++approvalPreflightRequestId.current;
    setSavingLocal(true);
    try {
      const result = await preflightOtwPlayCatalogEntry({
          youtubeUrl: selected.submittedUrl,
          startSeconds: 0,
        });
      if (
        requestId === approvalPreflightRequestId.current &&
        selectedProposalIdRef.current === selectedProposalId
      ) setApprovalPreflight(result);
    } finally {
      if (requestId === approvalPreflightRequestId.current) setSavingLocal(false);
    }
  };
  const approveSelected = async () => {
    if (!selected || !approvalPreflight || !singingCreditConfirmed) return;
    if (channelNeedsConfirmation && reviewChannelOwners.length === 0) return;
    const participantSubjects = reviewParticipants.map((participant, index) => ({
      subject: proposalSubject(participant, `proposal-participant-${index}`),
      participantRole: participant.participantRole,
      creditOrder: index,
      creditNameSnapshot: participant.submittedNameSnapshot,
    }));
    if (participantSubjects.length === 0) return;
    const channel: OtwPlayAdminCatalogChannelDecision =
      approvalPreflight.channel.state === "approved" &&
      approvalPreflight.channel.catalogChannelId
        ? { kind: "existing", channelId: approvalPreflight.channel.catalogChannelId }
        : approvalPreflight.channel.state === "recognized_member" &&
            approvalPreflight.channel.memberUid &&
            (approvalPreflight.channel.channelRole === "member_music" ||
              approvalPreflight.channel.channelRole === "member_main")
          ? {
              kind: "recognized_member",
              memberUid: approvalPreflight.channel.memberUid,
              channelRole: approvalPreflight.channel.channelRole,
            }
          : {
              kind: "confirm",
              channelRole,
              owners: reviewChannelOwners.map(channelOwnerSubject),
            };
    const existingSong = reviewSongId !== "__new"
      ? catalog.songs.find((song) => song.id === reviewSongId)
      : null;
    const song: OtwPlayAdminCatalogSongDecision = existingSong
      ? { kind: "existing", songId: existingSong.id }
      : {
          kind: "create",
          title: reviewTitle.trim(),
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [],
          tags: reviewSongTags,
          originalArtists: reviewArtists.map((artist, index) => ({
            subject: proposalSubject(artist, `proposal-artist-${index}`),
            creditOrder: index,
            isPrimary: index === 0,
          })),
        };
    if (!window.confirm("최신 영상·채널 metadata와 실제 가창 credit을 확인하고 게시할까요?")) return;
    const approved = await run("제안 승인", () =>
      approveOtwPlayProposal(selected.id, {
        expectedVersion: selected.version,
        expectedCatalogRevision: approvalPreflight.catalogRevision,
        song,
        participants: participantSubjects,
        channel,
        releaseType: reviewReleaseType,
        participationType: reviewParticipationType,
        ...(reviewPerformanceTags.length > 0
          ? { performanceTags: reviewPerformanceTags }
          : {}),
        singingCreditConfirmed: true,
        publish: true,
      }),
    );
    if (approved) { setProposalDirty(false); setApprovalPreflight(null); setSingingCreditConfirmed(false); }
  };
  if (loading) return <Loader2 className="mx-auto h-7 w-7 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">공식 커버 제안 검수</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" onChangeCapture={() => setProposalDirty(true)}>
        <p className="text-sm text-muted-foreground">
          최신 YouTube metadata, 승인·활성 공식 채널과 실제 가창 credit을 모두 확인한 뒤 게시합니다.
        </p>
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span>제안 목록을 불러오지 못했습니다. 빈 목록으로 간주하지 않습니다: {error.message}</span>
            <Button size="sm" variant="outline" disabled={fetching} onClick={() => void refetch()}>
              {fetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              다시 시도
            </Button>
          </div>
        ) : null}
        {!error && proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            대기 중인 제안이 없습니다.
          </div>
        ) : !error ? (
          <div className="overflow-x-auto">
            <Table className="console-history-table w-full">
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
                    <TableCell className="whitespace-normal">
                      <button
                        type="button"
                        className="font-medium text-left hover:underline"
                        onClick={() => {
                          setSelectedId(proposal.id);
                        }}
                      >
                        {proposal.submittedTitle}
                      </button>

                    </TableCell>
                    <TableCell>
                      <a
                        className="text-primary hover:underline"
                        href={proposal.submittedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        원본 영상
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
                    <TableCell className="whitespace-normal"><div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedId(proposal.id);
                        }}
                      >
                        검수
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
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {!error && selected && (
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
              {selected.tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>장르(분류):</span>
                  {selected.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                </div>
              ) : null}
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
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={savingLocal || saving !== null}
                  onClick={() => void verifySelected()}
                >
                  {savingLocal ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  영상·채널 확인
                </Button>
                {approvalPreflight ? (
                  <Badge variant={approvalPreflight.channel.state === "revoked" ? "destructive" : "secondary"}>
                    channel {approvalPreflight.channel.state}
                  </Badge>
                ) : null}
              </div>
              {approvalPreflight && channelNeedsConfirmation ? (
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <Field label="공식 채널 역할">
                    <Select
                      value={channelRole}
                      onValueChange={(value) => {
                        setChannelRole(value as typeof channelRole);
                        setSingingCreditConfirmed(false);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="otw_official">OTW 공식</SelectItem>
                        <SelectItem value="unit_official">유닛 공식</SelectItem>
                        <SelectItem value="member_music">멤버 노래 채널</SelectItem>
                        <SelectItem value="member_main">멤버 메인 채널</SelectItem>
                        <SelectItem value="project_official">승인 프로젝트</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label>채널 소유 주체</Label>
                      <p className="text-xs text-muted-foreground">
                        첫 가창자를 자동 소유자로 간주하지 않고 실제 소유 인물·그룹을 확인합니다.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReviewChannelOwners((items) => [
                          ...items,
                          {
                            rowKey: crypto.randomUUID(),
                            resolvedEntityId: null,
                            submittedMemberUid: null,
                            submittedNameSnapshot: "",
                            entityKind: "person",
                            source: "custom",
                          },
                        ]);
                        setSingingCreditConfirmed(false);
                      }}
                    >
                      <Plus /> 소유자 추가
                    </Button>
                  </div>
                  {reviewChannelOwners.map((owner, index) => (
                    <div
                      key={owner.rowKey}
                      className="grid gap-2 sm:grid-cols-[11rem_7rem_minmax(0,1fr)_2.25rem]"
                    >
                      <Select
                        value={
                          owner.source !== "custom"
                            ? owner.source
                            : owner.resolvedEntityId
                              ? `entity:${owner.resolvedEntityId}`
                              : "external"
                        }
                        onValueChange={(value) => {
                          if (value.startsWith("participant:")) {
                            const participantKey = value.slice("participant:".length);
                            const participant = reviewParticipants.find((item) => item.rowKey === participantKey);
                            if (!participant) return;
                            setReviewChannelOwners((items) => items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...participant, rowKey: item.rowKey, source: value as ReviewChannelOwner["source"] }
                                : item,
                            ));
                            setSingingCreditConfirmed(false);
                            return;
                          }
                          if (value.startsWith("artist:")) {
                            const artistKey = value.slice("artist:".length);
                            const artist = reviewArtists.find((item) => item.rowKey === artistKey);
                            if (!artist) return;
                            setReviewChannelOwners((items) => items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...artist, rowKey: item.rowKey, source: value as ReviewChannelOwner["source"] }
                                : item,
                            ));
                            setSingingCreditConfirmed(false);
                            return;
                          }
                          const entityId = value.startsWith("entity:") ? value.slice(7) : null;
                          const entity = catalog.entities.find((item) => item.id === entityId);
                          setReviewChannelOwners((items) => items.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  source: "custom",
                                  resolvedEntityId: entityId,
                                  submittedNameSnapshot: entity?.displayName ?? item.submittedNameSnapshot,
                                  entityKind: entity
                                    ? entity.entityKind === "group" ? "group" : "person"
                                    : item.entityKind,
                                }
                              : item,
                          ));
                          setSingingCreditConfirmed(false);
                        }}
                      >
                        <SelectTrigger aria-label={`${index + 1}번째 채널 소유 identity`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="external">새 identity</SelectItem>
                          {reviewParticipants.map((participant, participantIndex) => (
                            <SelectItem key={`participant:${participant.rowKey}`} value={`participant:${participant.rowKey}`}>
                              가창자 · {participant.submittedNameSnapshot || `${participantIndex + 1}번째 참여자`}
                            </SelectItem>
                          ))}
                          {reviewArtists.map((artist, artistIndex) => (
                            <SelectItem key={`artist:${artist.rowKey}`} value={`artist:${artist.rowKey}`}>
                              원곡 가수 · {artist.submittedNameSnapshot || `${artistIndex + 1}번째 가수`}
                            </SelectItem>
                          ))}
                          {catalog.entities.filter((entity) => entity.archivedAt === null).map((entity) => (
                            <SelectItem key={entity.id} value={`entity:${entity.id}`}>{entity.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={owner.entityKind}
                        disabled={owner.source !== "custom" || Boolean(owner.resolvedEntityId)}
                        onValueChange={(value) => {
                          setReviewChannelOwners((items) => items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, entityKind: value as ReviewIdentity["entityKind"] }
                              : item,
                          ));
                          setSingingCreditConfirmed(false);
                        }}
                      >
                        <SelectTrigger aria-label={`${index + 1}번째 채널 소유 종류`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="person">인물</SelectItem>
                          <SelectItem value="group">그룹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={`${index + 1}번째 채널 소유 이름`}
                        value={owner.submittedNameSnapshot}
                        disabled={owner.source !== "custom" || Boolean(owner.resolvedEntityId)}
                        onChange={(event) => {
                          setReviewChannelOwners((items) => items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, submittedNameSnapshot: event.target.value }
                              : item,
                          ));
                          setSingingCreditConfirmed(false);
                        }}
                        maxLength={300}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${index + 1}번째 채널 소유자 삭제`}
                        onClick={() => {
                          setReviewChannelOwners((items) => items.filter((_, itemIndex) => itemIndex !== index));
                          setSingingCreditConfirmed(false);
                        }}
                      ><Trash2 /></Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="space-y-4 rounded-lg border bg-background p-3">
                <div>
                  <p className="font-semibold">승인 내용 편집</p>
                  <p className="text-xs text-muted-foreground">
                    원 제안 snapshot은 보존하고, 아래 값으로 catalog에 반영합니다.
                  </p>
                </div>
                <Field label="연결할 곡">
                  <Select
                    value={reviewSongId}
                    onValueChange={(value) => {
                      setReviewSongId(value);
                      const song = catalog.songs.find((item) => item.id === value);
                      if (song) {
                        setReviewTitle(song.title);
                        setReviewSongTags([]);
                      } else {
                        setReviewTitle(selected.submittedTitle);
                        setReviewSongTags(selected.tags);
                      }
                      setSingingCreditConfirmed(false);
                    }}
                  >
                    <SelectTrigger aria-label="승인할 곡 선택"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new">새 곡 생성</SelectItem>
                      {catalog.songs.filter((song) => song.archivedAt === null).map((song) => (
                        <SelectItem key={song.id} value={song.id}>{song.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {reviewSongId === "__new" ? (
                  <>
                    <Field label="곡명" htmlFor="proposal-review-title">
                      <Input
                        id="proposal-review-title"
                        value={reviewTitle}
                        onChange={(event) => {
                          setReviewTitle(event.target.value);
                          setSingingCreditConfirmed(false);
                        }}
                        maxLength={300}
                      />
                    </Field>
                    <SongTagPicker
                      tags={reviewSongTags}
                      onChange={(tags) => {
                        setReviewSongTags(tags);
                        setSingingCreditConfirmed(false);
                      }}
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>원곡 가수</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewArtists((items) => [
                            ...items,
                            {
                              rowKey: crypto.randomUUID(),
                              resolvedEntityId: null,
                              submittedMemberUid: null,
                              submittedNameSnapshot: "",
                              entityKind: "person",
                            },
                          ])}
                        ><Plus /> 가수 추가</Button>
                      </div>
                      {reviewArtists.map((artist, index) => (
                        <div key={artist.rowKey} className="grid gap-2 sm:grid-cols-[11rem_7rem_minmax(0,1fr)_2.25rem]">
                          <Select
                            value={artist.resolvedEntityId ? `entity:${artist.resolvedEntityId}` : "external"}
                            onValueChange={(value) => {
                              const entityId = value.startsWith("entity:") ? value.slice(7) : null;
                              const entity = catalog.entities.find((item) => item.id === entityId);
                              setReviewArtists((items) => items.map((item, itemIndex) => itemIndex === index
                                ? {
                                    ...item,
                                    resolvedEntityId: entityId,
                                    submittedMemberUid: null,
                                    submittedNameSnapshot: entity?.displayName ?? item.submittedNameSnapshot,
                                    entityKind: entity
                                      ? entity.entityKind === "group" ? "group" : "person"
                                      : item.entityKind,
                                  }
                                : item));
                            }}
                          >
                            <SelectTrigger aria-label={`${index + 1}번째 원곡 가수 identity`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="external">외부 identity</SelectItem>
                              {catalog.entities.filter((entity) => entity.archivedAt === null).map((entity) => <SelectItem key={entity.id} value={`entity:${entity.id}`}>{entity.displayName}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select
                            value={artist.entityKind}
                            disabled={Boolean(artist.resolvedEntityId)}
                            onValueChange={(value) => setReviewArtists((items) => items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, entityKind: value as ReviewIdentity["entityKind"] }
                                : item,
                            ))}
                          >
                            <SelectTrigger aria-label={`${index + 1}번째 원곡 가수 종류`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="person">인물</SelectItem>
                              <SelectItem value="group">그룹</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            aria-label={`${index + 1}번째 원곡 가수명`}
                            value={artist.submittedNameSnapshot}
                            disabled={Boolean(artist.resolvedEntityId)}
                            onChange={(event) => setReviewArtists((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, submittedNameSnapshot: event.target.value } : item))}
                            maxLength={300}
                          />
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`${index + 1}번째 원곡 가수 삭제`} onClick={() => setReviewArtists((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>가창 참여자와 역할</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewParticipants((items) => [
                        ...items,
                        {
                          rowKey: crypto.randomUUID(),
                          resolvedEntityId: null,
                          submittedMemberUid: null,
                          submittedNameSnapshot: "",
                          entityKind: "person",
                          participantRole: "vocal",
                        },
                      ])}
                    ><Plus /> 참여자 추가</Button>
                  </div>
                  {reviewParticipants.map((participant, index) => (
                    <div key={participant.rowKey} className="grid gap-2 sm:grid-cols-[10rem_7rem_minmax(0,1fr)_9rem_2.25rem]">
                      <Select
                        value={participant.resolvedEntityId ? `entity:${participant.resolvedEntityId}` : "external"}
                        onValueChange={(value) => {
                          const entityId = value.startsWith("entity:") ? value.slice(7) : null;
                          const entity = catalog.entities.find((item) => item.id === entityId);
                          setReviewParticipants((items) => items.map((item, itemIndex) => itemIndex === index
                            ? {
                                ...item,
                                resolvedEntityId: entityId,
                                submittedMemberUid: null,
                                submittedNameSnapshot: entity?.displayName ?? item.submittedNameSnapshot,
                                entityKind: entity
                                  ? entity.entityKind === "group" ? "group" : "person"
                                  : item.entityKind,
                              }
                            : item));
                          setSingingCreditConfirmed(false);
                        }}
                      >
                        <SelectTrigger aria-label={`${index + 1}번째 참여자 identity`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="external">외부 identity</SelectItem>
                          {catalog.entities.filter((entity) => entity.archivedAt === null).map((entity) => <SelectItem key={entity.id} value={`entity:${entity.id}`}>{entity.displayName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select
                        value={participant.entityKind}
                        disabled={Boolean(participant.resolvedEntityId)}
                        onValueChange={(value) => {
                          setReviewParticipants((items) => items.map((item, itemIndex) => itemIndex === index
                            ? { ...item, entityKind: value as ReviewIdentity["entityKind"] }
                            : item));
                          setSingingCreditConfirmed(false);
                        }}
                      >
                        <SelectTrigger aria-label={`${index + 1}번째 참여자 종류`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="person">인물</SelectItem>
                          <SelectItem value="group">그룹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={`${index + 1}번째 참여자명`}
                        value={participant.submittedNameSnapshot}
                        onChange={(event) => {
                          setReviewParticipants((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, submittedNameSnapshot: event.target.value } : item));
                          setSingingCreditConfirmed(false);
                        }}
                        maxLength={300}
                      />
                      <Select
                        value={participant.participantRole}
                        onValueChange={(value) => {
                          setReviewParticipants((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, participantRole: value as OtwPlayParticipantRole } : item));
                          setSingingCreditConfirmed(false);
                        }}
                      >
                        <SelectTrigger aria-label={`${participant.submittedNameSnapshot || `${index + 1}번째 참여자`} 가창 역할`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(participantRoleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`${index + 1}번째 참여자 삭제`} onClick={() => { setReviewParticipants((items) => items.filter((_, itemIndex) => itemIndex !== index)); setSingingCreditConfirmed(false); }}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="공개 형태">
                    <Select
                      value={reviewReleaseType}
                      onValueChange={(value) => {
                        setReviewReleaseType(value as typeof reviewReleaseType);
                        setSingingCreditConfirmed(false);
                      }}
                    >
                      <SelectTrigger aria-label="승인할 공개 형태"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(releaseTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="참여 형태">
                    <Select
                      value={reviewParticipationType}
                      onValueChange={(value) => {
                        setReviewParticipationType(value as OtwPlayParticipationType);
                        setSingingCreditConfirmed(false);
                      }}
                    >
                      <SelectTrigger aria-label="승인할 참여 형태"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(participationTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <SongTagPicker
                  tags={reviewPerformanceTags}
                  onChange={(tags) => {
                    setReviewPerformanceTags(tags);
                    setSingingCreditConfirmed(false);
                  }}
                  label="커버 영상 라벨"
                  placeholder="이 영상만의 라벨 입력"
                  selectedLabel="선택한 커버 영상 라벨"
                  description="승인할 커버 영상에만 적용되며 곡 태그와 별도로 저장됩니다."
                  recommendedTags={[]}
                />
              </div>
              <label className="flex items-start gap-2 rounded-lg border bg-background p-3">
                <Checkbox
                  checked={singingCreditConfirmed}
                  onCheckedChange={(checked) => setSingingCreditConfirmed(checked === true)}
                />
                <span>영상의 실제 가창자와 입력된 참여자 credit이 일치함을 확인했습니다.</span>
              </label>
              <Button
                size="sm"
                disabled={
                  !approvalPreflight ||
                  Boolean(approvalPreflight.duplicate) ||
                  approvalPreflight.channel.state === "revoked" ||
                  (channelNeedsConfirmation &&
                    (reviewChannelOwners.length === 0 ||
                      reviewChannelOwners.some((owner) => !owner.submittedNameSnapshot.trim()))) ||
                  !reviewTitle.trim() ||
                  (reviewSongId === "__new" && (reviewArtists.length === 0 || reviewArtists.some((artist) => !artist.submittedNameSnapshot.trim()))) ||
                  reviewParticipants.length === 0 ||
                  reviewParticipants.some((participant) => !participant.submittedNameSnapshot.trim()) ||
                  !reviewParticipants.some((participant) => participant.participantRole !== "other") ||
                  !singingCreditConfirmed ||
                  saving !== null
                }
                onClick={() => void approveSelected()}
              >
                확인 후 승인·게시
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function EntitySection({
  items,
  referencedEntityIds,
  saving,
  run,
}: {
  items: OtwPlayAdminEntityDto[];
  referencedEntityIds: ReadonlySet<string>;
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<OtwPlayAdminEntityDto | null>(null);
  const [deleting, setDeleting] = useState<OtwPlayAdminEntityDto | null>(null);
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
    <section aria-labelledby="external-entities-title" className="space-y-4 border-t pt-4">
      <div>
        <h3 id="external-entities-title" className="text-sm font-semibold">외부 인물·그룹</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          영상 등록에서 만든 외부 가수·참여자·그룹의 표시명과 보관 상태를 관리합니다.
        </p>
      </div>
      <div className="space-y-5">
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
                {items.map((item) => {
                  const deletionBlocked = referencedEntityIds.has(item.id);
                  const deletionReasonId = `external-entity-delete-reason-${item.id}`;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.displayName}</TableCell>
                      <TableCell>
                        {item.entityKind === "group" ? "그룹" : "외부 인물"}
                      </TableCell>
                      <TableCell>
                        <div>{item.archivedAt ? "보관" : "활성"}</div>
                        {deletionBlocked ? (
                          <div
                            id={deletionReasonId}
                            className="text-xs text-muted-foreground"
                          >
                            연결 사용 중 · 삭제 불가
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`${item.displayName} 수정`}
                            onClick={() => beginEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            aria-label={`${item.displayName} 삭제`}
                            aria-describedby={deletionBlocked ? deletionReasonId : undefined}
                            disabled={saving !== null || deletionBlocked}
                            onClick={() => setDeleting(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </div>
      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="외부 주체를 삭제할까요?"
        description={deleting
          ? `“${deleting.displayName}” identity와 별칭을 영구 삭제합니다. 이 작업은 되돌릴 수 없으며, 연결된 곡·가창·승인 채널·제안·후보 검수가 있으면 삭제되지 않습니다.`
          : "외부 identity를 영구 삭제합니다."}
        confirmLabel="영구 삭제"
        destructive
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void run("외부 identity 삭제", () =>
            deleteOtwPlayEntity(target.id, {
              expectedVersion: target.version,
            })
          ).then((succeeded) => {
            if (succeeded && editing?.id === target.id) setEditing(null);
          });
        }}
      />
    </section>
  );
}

function ChannelSection({
  items,
  entities,
  referencedEntityIds,
  saving,
  run,
}: {
  items: OtwPlayAdminChannelDto[];
  entities: OtwPlayAdminEntityDto[];
  referencedEntityIds: ReadonlySet<string>;
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [search, updateSearch] = useConsoleSearch();
  const visibleChannels = items.filter((item) => !search.q || [item.displayName, ...item.entityIds.map((id) => entities.find((entity) => entity.id === id)?.displayName ?? "")].join(" ").toLocaleLowerCase().includes(search.q.toLocaleLowerCase()));
  const empty = {
    externalChannelId: "",
    displayName: "",
    channelRole: "member_music" as OtwPlayChannelRole,
    verificationStatus: "pending" as const,
    active: false,
    entityIds: [] as string[],
  };
  const [form, setForm] = useState<{
    externalChannelId: string;
    displayName: string;
    channelRole: OtwPlayChannelRole;
    verificationStatus: "pending" | "approved" | "revoked";
    active: boolean;
    entityIds: string[];
  }>(empty);
  const [editing, setEditing] = useState<OtwPlayAdminChannelDto | null>(null);
  const formDirty = JSON.stringify(form) !== JSON.stringify(editing ? {
    externalChannelId: editing.externalChannelId, displayName: editing.displayName, channelRole: editing.channelRole,
    verificationStatus: editing.verificationStatus, active: editing.active, entityIds: editing.entityIds,
  } : empty);
  const canDiscard = useUnsavedChanges(formDirty);
  const [entitySearch, setEntitySearch] = useState("");
  const [confirmingEntityChange, setConfirmingEntityChange] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "verified" | "error"
  >("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [verifiedChannelId, setVerifiedChannelId] = useState<string | null>(null);
  const lookupRequestRef = useRef(0);
  const lookupChannel = async () => {
    const externalChannelId = form.externalChannelId.trim();
    if (!/^UC[A-Za-z0-9_-]{22}$/u.test(externalChannelId)) return;
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    setLookupStatus("loading");
    setLookupError(null);
    try {
      const channel = await lookupOtwPlayChannel(externalChannelId);
      if (lookupRequestRef.current !== requestId) return;
      setForm((current) => current.externalChannelId.trim() === externalChannelId
        ? { ...current, externalChannelId, displayName: channel.displayName }
        : current);
      setVerifiedChannelId(externalChannelId);
      setLookupStatus("verified");
    } catch (error) {
      if (lookupRequestRef.current !== requestId) return;
      console.error("OTW Play channel lookup failed", error);
      setLookupStatus("error");
      setVerifiedChannelId(null);
      setLookupError("채널을 확인하지 못했습니다. ID와 YouTube API 상태를 확인해 주세요.");
    }
  };
  const persist = async () => {
    const core = {
      externalChannelId: form.externalChannelId.trim(),
      displayName: form.displayName,
      channelRole: form.channelRole,
      entityIds: editing ? form.entityIds : [],
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
    setLookupStatus("idle");
    setLookupError(null);
    setVerifiedChannelId(null);
    setEntitySearch("");
    setConfirmingEntityChange(false);
  };
  const entityIdsChanged =
    editing !== null &&
    JSON.stringify([...editing.entityIds].sort()) !==
      JSON.stringify([...form.entityIds].sort());
  const submit = () => {
    if (entityIdsChanged) {
      setConfirmingEntityChange(true);
      return;
    }
    void persist();
  };
  const normalizedEntitySearch = entitySearch
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
  const selectableEntities = entities
    .filter(
      (entity) =>
        entity.archivedAt === null || form.entityIds.includes(entity.id),
    )
    .filter((entity) => {
      if (!normalizedEntitySearch) return true;
      return [entity.displayName, entity.slug].some((value) =>
        value
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(normalizedEntitySearch),
      );
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ko"));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base"><h2 id="approved-channels-title">승인 채널·외부 주체 관리</h2></CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              승인 채널과 영상 등록에서 생성된 외부 인물·그룹을 한 화면에서 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">전체 {items.length}</Badge>
            <Badge variant="secondary">
              활성 {items.filter((item) => item.verificationStatus === "approved" && item.active).length}
            </Badge>
            <Badge variant="outline">
              키리누키 {items.filter((item) => item.channelRole === "approved_kirinuki").length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2"><Input aria-label="Play 승인 채널 검색" placeholder="채널명·연결 주체 검색" className="max-w-sm" value={search.q ?? ""} onChange={(event) => updateSearch({q: event.target.value})}/><a href="#play-channel-editor" className="text-sm underline">채널 등록·수정 ↓</a></div>
        <div className="space-y-2">
          <div className="text-sm font-medium">등록된 채널</div>
          <div className="overflow-x-auto rounded-lg border">
          <Table className="console-history-table w-full">
            <TableHeader>
              <TableRow>
                <TableHead>채널</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>연결 주체</TableHead>
                <TableHead>검수</TableHead>
                <TableHead>활성</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleChannels.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-normal">
                    <div>{item.displayName}</div>
                    <details className="text-xs text-muted-foreground"><summary>채널 ID</summary><span className="break-all">{item.externalChannelId}</span></details>
                  </TableCell>
                  <TableCell>{channelRoleLabels[item.channelRole]}</TableCell>
                  <TableCell>
                    {item.entityIds.length === 0 ? (
                      <span className="text-muted-foreground">없음</span>
                    ) : (
                      <div className="flex max-w-72 flex-wrap gap-1">
                        {item.entityIds.map((entityId) => (
                          <Badge key={entityId} variant="outline">
                            {entityById.get(entityId)?.displayName ?? entityId}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{channelVerificationLabels[item.verificationStatus]}</TableCell>
                  <TableCell>{item.active ? "예" : "아니오"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${item.displayName} 수정`}
                      onClick={async () => {
                        if (formDirty && !await canDiscard()) return;
                        document.getElementById("play-channel-editor")?.scrollIntoView({block: "start"});
                        lookupRequestRef.current += 1;
                        setEditing(item);
                        setForm({
                          externalChannelId: item.externalChannelId,
                          displayName: item.displayName,
                          channelRole: item.channelRole,
                          verificationStatus: item.verificationStatus,
                          active: item.active,
                          entityIds: [...item.entityIds],
                        });
                        setLookupStatus("verified");
                        setLookupError(null);
                        setVerifiedChannelId(item.externalChannelId);
                        setEntitySearch("");
                        setConfirmingEntityChange(false);
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

        <div id="play-channel-editor" className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">{editing ? `${editing.displayName} 수정` : "채널 등록"}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                신규 채널은 검수 대기로 생성됩니다. 등록 후 아래 목록에서 승인 상태와 활성 여부를 확정하세요.
              </p>
            </div>
            {editing && <Badge variant="outline">version {editing.version}</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
          <Field
            label="YouTube 채널 ID"
            htmlFor="advanced-channel-id"
            description="UC로 시작하는 channel ID를 입력한 뒤 조회하세요."
          >
            <div className="flex gap-2">
              <Input
                id="advanced-channel-id"
                aria-label="YouTube channel ID"
                value={form.externalChannelId}
                onChange={(event) => {
                  lookupRequestRef.current += 1;
                  setForm({
                    ...form,
                    externalChannelId: event.target.value,
                    displayName: "",
                  });
                  setLookupStatus("idle");
                  setLookupError(null);
                  setVerifiedChannelId(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  !/^UC[A-Za-z0-9_-]{22}$/u.test(form.externalChannelId.trim()) ||
                  lookupStatus === "loading" ||
                  saving !== null
                }
                onClick={() => void lookupChannel()}
              >
                {lookupStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                채널 조회
              </Button>
            </div>
            {lookupError ? <p role="alert" className="text-xs text-destructive">{lookupError}</p> : null}
          </Field>
          <Field
            label="채널 표시명"
            htmlFor="advanced-channel-display-name"
            description="YouTube 조회 결과를 자동으로 사용합니다."
          >
            <Input
              id="advanced-channel-display-name"
              aria-label="채널 표시명"
              value={form.displayName}
              placeholder="채널 조회 후 자동 입력"
              readOnly
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
                  "approved_kirinuki",
                ].map((role) => (
                  <SelectItem key={role} value={role}>
                    {channelRoleLabels[role as OtwPlayChannelRole]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          </div>
        {editing && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  onCheckedChange={(checked) =>
                    setForm({ ...form, active: checked === true })
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="advanced-channel-active">카탈로그 source에 사용</Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    비활성 채널의 영상은 공개 source 후보로 선택되지 않습니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Label htmlFor="advanced-channel-entity-search">연결 주체</Label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    이 채널을 실제로 소유하거나 운영하는 멤버·외부 인물·그룹을 선택하세요. 연결 없이 저장할 수도 있습니다.
                  </p>
                </div>
                <Badge variant="outline">선택 {form.entityIds.length}/30</Badge>
              </div>
              <Input
                id="advanced-channel-entity-search"
                value={entitySearch}
                onChange={(event) => setEntitySearch(event.target.value)}
                placeholder="표시명 또는 slug 검색"
              />
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {selectableEntities.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
                ) : selectableEntities.map((entity) => {
                  const checked = form.entityIds.includes(entity.id);
                  const kindLabel = entity.memberUid !== null
                    ? "멤버"
                    : entity.entityKind === "group" ? "외부 그룹" : "외부 인물";
                  return (
                    <label
                      key={entity.id}
                      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        aria-label={`${entity.displayName} 연결`}
                        disabled={!checked && form.entityIds.length >= 30}
                        onCheckedChange={(nextChecked) => setForm((current) => ({
                          ...current,
                          entityIds: nextChecked === true
                            ? [...current.entityIds, entity.id]
                            : current.entityIds.filter((entityId) => entityId !== entity.id),
                        }))}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{entity.displayName}</span>
                      <Badge variant={entity.memberUid !== null ? "secondary" : "outline"}>{kindLabel}</Badge>
                      {entity.archivedAt !== null ? <Badge variant="outline">보관됨</Badge> : null}
                    </label>
                  );
                })}
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
                  lookupRequestRef.current += 1;
                  setEditing(null);
                  setForm(empty);
                  setLookupStatus("idle");
                  setLookupError(null);
                  setVerifiedChannelId(null);
                  setEntitySearch("");
                  setConfirmingEntityChange(false);
                }}
              >
                취소
              </Button>
            )}
            <Button
              disabled={
                !form.displayName.trim() ||
                verifiedChannelId !== form.externalChannelId.trim() ||
                lookupStatus !== "verified" ||
                saving !== null
              }
              onClick={submit}
            >
              {editing ? "채널 수정 저장" : "채널 등록"}
            </Button>
          </div>
        </div>
        <EntitySection
          items={entities.filter((item) => item.memberUid === null)}
          referencedEntityIds={referencedEntityIds}
          saving={saving}
          run={run}
        />
      </CardContent>
      <ConfirmActionDialog
        open={confirmingEntityChange}
        onOpenChange={setConfirmingEntityChange}
        title="채널 연결 주체를 변경할까요?"
        description="연결 주체를 바꾸면 채널의 소유·소속 관계와 외부 주체 삭제 가능 여부가 함께 변경됩니다. 선택한 연결로 저장할까요?"
        confirmLabel="연결 변경 저장"
        isProcessing={saving !== null}
        onConfirm={() => void persist()}
      />
    </Card>
  );
}
