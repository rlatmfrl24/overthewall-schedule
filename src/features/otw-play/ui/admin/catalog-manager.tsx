import { ReviewSegmentPlayer } from "./review-segment-player";
import { BroadcastMetadataFields } from "../broadcast-metadata-fields";
import { emptySubmissionBroadcast } from "../../model/submission-broadcast";
import { ReviewInbox } from "./review-inbox";
import { ChannelCollectionSettings } from "./channel-collection-settings";
import { isRegistrationChannelSearch, type RegistrationChannelTarget, type RegistrationChannelVisit } from "./registration-channel";
import { PlayAutomationControl } from "./play-automation-control";
import { TabsList } from "@/shared/ui/tabs-list";
import { LabeledField as Field } from "@/shared/ui/labeled-field";
import { useConfirmation } from "@/shared/lib/confirmation";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { AdminSectionHeader } from "@/app/admin";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
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
  deleteOtwPlayChannel,
  fetchOtwPlayAdminCatalog,
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
  useOtwPlayChannelMonitors,
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


export type Section =
  | "catalog"
  | "import"
  | "requests"
  | "clips"
  | "clip-channels"
  | "channels"
  | "automatic-review"
  | "review"
  | "source-health"
  | "operations";

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: "catalog", label: "카탈로그" }, { value: "import", label: "가져오기/검수" },
  { value: "requests", label: "사용자 곡 요청" },
  { value: "channels", label: "채널" }, { value: "operations", label: "운영" },
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
  Extract<OtwPlayReleaseType, "official_mv" | "official_video" | "broadcast">,
  string
> = {
  official_mv: "공식 MV",
  official_video: "공식 영상",
  broadcast: "노래 클립",
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

export function OtwPlayCatalogManager({ activeSection, onSectionChange, monitorMode }: { activeSection?: Section; onSectionChange?: (section: Section) => void; monitorMode?: "review" | "sources" } = {}) {
  const catalogQuery = useOtwPlayAdminCatalog();
  const proposalsQuery = useOtwPlayAdminProposals();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [localSection, setLocalSection] = useState<Section>("catalog");
  const requestedSection = activeSection ?? localSection;
  const section = requestedSection === "source-health" ? "operations"
    : requestedSection === "automatic-review" ? (monitorMode === "sources" ? "channels" : "import")
    : requestedSection === "clip-channels" ? "channels" : requestedSection === "clips" ? "catalog"
    : requestedSection === "review" ? "import" : requestedSection;
  const [reviewSearch, updateReviewSearch] = useConsoleSearch();
  const catalogScope = reviewSearch.kind ?? (requestedSection === "clips" || reviewSearch.tab === "clips" ? "broadcast" : "official");
  const importView = reviewSearch.view ?? (reviewSearch.category && reviewSearch.tab === "import" ? "jobs" : "inbox");
  const openChannel = (id: string, kind: "official_video" | "singing_clip" = "singing_clip") => {
    if (!activeSection) setLocalSection("channels");
    updateReviewSearch({ tab: "channels", view: "channel-edit", channel: id, channelKind: kind, from: "play-review" }, false);
  };
  const returnToReview = () => {
    if (!activeSection) setLocalSection("import");
    updateReviewSearch({ tab: "import", view: "review", channel: undefined, channelKind: undefined, from: undefined }, false);
  };
  const [importVisited, setImportVisited] = useState(section === "import");
  useEffect(() => { if (section === "import") setImportVisited(true); }, [section]);
  const setSection = onSectionChange ?? setLocalSection;
  const openCatalog = (kind?: "official" | "broadcast" | "all") => { setSection("catalog"); updateReviewSearch({ tab: "catalog", kind: kind ?? reviewSearch.kind ?? "all", view: undefined, category: undefined, selected: undefined, state: undefined, q: undefined }); };
  const sourceHealthQuery = useOtwPlayAdminSourceHealth(
    section === "operations",
  );
  const observabilityQuery = useOtwPlayAdminObservability(
    section === "operations",
  );
  const releaseQuery = useOtwPlayAdminRelease(section === "operations");
  const [saving, setSaving] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationClip, setRegistrationClip] = useState(false);
  const [registeredScope, setRegisteredScope] = useState<"official" | "broadcast" | null>(null);
  const [preselectedSongId, setPreselectedSongId] = useState<string | null>(null);
  const [registrationVisit, setRegistrationVisit] = useState<RegistrationChannelVisit | null>(null);
  const registrationChannelOpen = Boolean(registrationOpen && registrationVisit && isRegistrationChannelSearch(reviewSearch, registrationVisit));
  const manageRegistrationChannel = (target: RegistrationChannelTarget) => {
    setRegistrationVisit({ target, returnSearch: { ...reviewSearch } });
  };
  const navigatedRegistrationVisit = useRef<RegistrationChannelVisit | null>(null);
  useEffect(() => {
    if (!registrationVisit || navigatedRegistrationVisit.current === registrationVisit) return;
    navigatedRegistrationVisit.current = registrationVisit;
    if (!activeSection) setLocalSection("channels");
    const { target } = registrationVisit;
    updateReviewSearch({ tab: "channels", view: "channel-edit", channel: target.externalChannelId, channelKind: target.kind, from: "play-registration" }, false);
  }, [registrationVisit, activeSection, updateReviewSearch]);
  useEffect(() => {
    if (registrationOpen && section !== "catalog" && !registrationChannelOpen &&
      (!registrationVisit || navigatedRegistrationVisit.current === registrationVisit)) {
      setRegistrationOpen(false);
      setRegistrationVisit(null);
    }
  }, [registrationOpen, section, registrationChannelOpen, registrationVisit]);
  const returnToRegistration = () => {
    if (!registrationVisit) return;
    if (!activeSection) setLocalSection("catalog");
    updateReviewSearch({ ...Object.fromEntries(Object.keys(reviewSearch).map(key => [key, undefined])), ...registrationVisit.returnSearch }, false);
  };
  const registrationChannel = registrationVisit && catalogQuery.data?.channels.find(item => item.externalChannelId === registrationVisit.target.externalChannelId);
  const registrationChannelReady = registrationChannel?.verificationStatus === "approved" && registrationChannel.active &&
    (registrationVisit?.target.kind === "singing_clip" ? registrationChannel.channelRole === "approved_kirinuki" : registrationChannel.channelRole !== "approved_kirinuki");
  useEffect(() => {
    if (registrationOpen || !registeredScope) return;
    if (catalogScope !== "all" && catalogScope !== registeredScope) {
      updateReviewSearch({ kind: registeredScope });
    }
    setRegisteredScope(null);
  }, [registrationOpen, registeredScope, catalogScope, updateReviewSearch]);

  const catalog = catalogQuery.data;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["otw-play-review-inbox"] }),
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
        error instanceof ApiError && error.fields?.broadcast === "extent_required"
          ? "가창 수정에서 완곡 또는 일부 가창 여부를 선택한 뒤 저장해 주세요."
          : error instanceof ApiError && error.fields?.sources === "approved_bounded_source_required"
            ? "가창 수정에서 재생 구간을 확인하고 저장해 주세요. 노래 클립은 승인·활성 채널의 재생 가능한 영상과 종료 위치가 필요합니다."
          : error instanceof ApiError && error.fields?.participants === "singing_participant_required"
            ? "가창 수정에서 메인 보컬·피처링 보컬·코러스 중 하나의 참여자를 지정해 주세요."
          :
        error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE"
          ? "다른 점검이 먼저 반영되었습니다. 최신 상태를 다시 불러왔습니다."
          : label === "외부 identity 삭제" &&
              error instanceof ApiError &&
              error.fields?.entity === "referenced"
            ? "곡·가창·승인 채널·제안 또는 저장된 후보 검수에 연결된 외부 주체는 삭제할 수 없습니다. 연결을 먼저 교정하거나 보관 처리해 주세요."
            : label === "제안 승인" && error instanceof ApiError
              ? `제안 승인에 실패했습니다. ${error.message}${error.code ? ` (${error.code})` : ""}${error.requestId ? ` · 요청 ID: ${error.requestId}` : ""}`
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
    section === "catalog" || section === "import" || section === "requests" || section === "channels";
  const readModelReady = catalog
    ? catalog.revision === catalog.readModelRevision
    : false;
  const effectiveSaving = readModelReady ? saving : "read-model-unavailable";

  return (
    <div className="otw-play-admin min-w-0 space-y-3">
      <AdminSectionHeader
        title={activeSection ? SECTIONS.find((item) => item.value === section)?.label ?? "OTW Play" : "OTW Play 카탈로그"}
        description={section === "requests" ? "사용자가 신청한 곡을 확인하고 영상·가창 정보를 검수해 승인하거나 거절합니다." : section === "import" ? "가져온 영상의 검토 대상을 선택하고, 근거를 확인해 카탈로그에 임시 저장합니다." : section === "channels" ? "채널 수집 감시, 승인 상태와 연결된 인물·그룹을 함께 관리합니다." : section === "operations" ? "공개 설정, 영상 재생 상태와 서비스 지표를 함께 확인합니다." : "곡과 가창을 검색하고 등록·공개 상태를 관리합니다."}
        metadata={catalogSection ? <><QueryReadback className="m-0" updatedAt={catalogQuery.dataUpdatedAt} fetching={catalogQuery.isFetching} error={catalogQuery.isError && Boolean(catalog)} />{catalog && section === "catalog" ? <span>곡 {catalog.songs.length} · 가창 {catalog.performances.length}</span> : null}</> : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {catalog && (section === "catalog") && (
              <Button
                size="sm"
                onClick={() => {
                  setPreselectedSongId(null);
                  setRegistrationClip(catalogScope === "broadcast");
                  setRegistrationOpen(true);
                }}
              >
                <Video className="h-4 w-4" /> {catalogScope === "broadcast" ? "새 노래 클립 등록" : "새 영상 등록"}
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
      {!activeSection && (
        <TabsList value={section} onValueChange={setSection} label="Play 관리 영역"
          items={SECTIONS.map((item) => ({ ...item, id: `play-admin-${item.value}-tab`, panelId: "play-admin-section-panel" }))} />
      )}
      <div id="play-admin-section-panel" role={activeSection ? "region" : "tabpanel"}
        aria-label={activeSection ? SECTIONS.find((item) => item.value === section)?.label : undefined}
        aria-labelledby={activeSection ? undefined : `play-admin-${section}-tab`} className="space-y-3">
      {catalog && !readModelReady && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
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
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          OTW Play 관리자 카탈로그를 불러오지 못했습니다. 카탈로그 작업은
          복구 후 다시 시도해 주세요. 운영·공개와 소스 상태는 위 메뉴에서
          독립적으로 확인할 수 있습니다.
        </div>
      )}

      {catalog && section === "catalog" && <div className="flex flex-wrap gap-2">
        <Button variant={reviewSearch.view !== "entities" ? "secondary" : "outline"} onClick={() => updateReviewSearch({ view: undefined })}>곡·가창</Button>
        <Button variant={reviewSearch.view === "entities" ? "secondary" : "outline"} onClick={() => updateReviewSearch({ view: "entities" })}>인물·그룹</Button>
        {reviewSearch.view !== "entities" && <select aria-label="카탈로그 영상 종류" className="rounded-md border bg-background p-2 text-sm" value={catalogScope} onChange={event => updateReviewSearch({ kind: event.target.value as "official" | "broadcast" | "all", selected: undefined })}><option value="official">공식 곡</option><option value="broadcast">노래 클립</option><option value="all">전체</option></select>}
      </div>}
      {catalog && section === "catalog" && reviewSearch.view === "entities" && <EntitySection items={catalog.entities.filter(entity => entity.memberUid === null)} referencedEntityIds={new Set([...catalog.songs.flatMap(song => song.originalArtists.map(artist => artist.entityId)), ...catalog.performances.flatMap(performance => performance.participants.map(participant => participant.entityId)), ...catalog.channels.flatMap(channel => channel.entityIds)])} saving={effectiveSaving} run={run} />}
      {(importVisited || section === "import") && <div hidden={section !== "import"} className="space-y-3">
        <div className="flex flex-wrap gap-2"><Button variant={importView !== "jobs" ? "secondary" : "outline"} onClick={() => updateReviewSearch({ view: "inbox", selected: undefined })}>검수 목록</Button><Button variant={importView === "jobs" ? "secondary" : "outline"} onClick={() => updateReviewSearch({ view: "jobs" })}>새 가져오기·이력</Button></div>
        <div hidden={importView === "jobs" || section !== "import"}><ReviewInbox active={section === "import" && importView !== "jobs"} catalog={catalog ?? null} onManageChannel={openChannel} onOpenCatalog={openCatalog} onProposal={id => updateReviewSearch({ proposal: id })} /></div>
        <div hidden={importView !== "jobs" || section !== "import"}><IngestionSection active={section === "import" && importView === "jobs"} /></div>
        {catalog && reviewSearch.proposal && <ProposalSection catalog={catalog} proposals={proposalsQuery.data ?? []} loading={proposalsQuery.isLoading} fetching={proposalsQuery.isFetching} error={proposalsQuery.error} refetch={proposalsQuery.refetch} saving={effectiveSaving} run={run} />}
      </div>}
      {section === "requests" && catalog && <ProposalSection catalog={catalog} proposals={proposalsQuery.data ?? []} loading={proposalsQuery.isLoading} fetching={proposalsQuery.isFetching} error={proposalsQuery.error} refetch={proposalsQuery.refetch} saving={effectiveSaving} run={run} />}
      {section === "channels" && catalog && <div className="space-y-3">
        {registrationChannelOpen && <Button disabled={effectiveSaving !== null} variant={registrationChannelReady ? "default" : "outline"} onClick={returnToRegistration}>{registrationChannelReady ? "설정 완료 · 곡 등록으로 돌아가기" : "작성 중인 곡으로 돌아가기"}</Button>}
        {reviewSearch.from === "play-review" && <Button variant="outline" disabled={effectiveSaving !== null} onClick={returnToReview}>작성 중인 검수로 돌아가기</Button>}
        <ChannelSection initialExternalChannelId={reviewSearch.from === "play-registration" && !registrationChannelOpen ? undefined : reviewSearch.channel} initialChannelRole={registrationChannelOpen ? registrationVisit!.target.role : reviewSearch.channelKind === "official_video" ? "member_music" : "approved_kirinuki"} registrationTarget={registrationChannelOpen ? registrationVisit!.target : undefined} items={catalog.channels} entities={catalog.entities} saving={effectiveSaving} run={run} />
      </div>}
      {(section === "catalog") && reviewSearch.view !== "entities" && catalog && (
        <WorkflowCatalog
          scope={catalogScope}
          catalog={catalog}
          saving={effectiveSaving}
          run={run}
          onPublishDrafts={publishDraftPerformances}
          onAddPerformance={(songId) => {
            setPreselectedSongId(songId);
            setRegistrationClip(catalogScope === "broadcast");
            setRegistrationOpen(true);
          }}
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
          sourceHealthPanel={
            <SourceHealthSection
              data={sourceHealthQuery.data}
              loading={sourceHealthQuery.isLoading}
              fetching={sourceHealthQuery.isFetching}
              error={sourceHealthQuery.error}
              saving={saving}
              run={run}
              refetch={sourceHealthQuery.refetch}
            />
          }
          onReleaseChanged={refreshRelease}
        />
      )}

      </div>
      {catalog && (
        <CatalogEntryDialog
          clip={registrationClip}
          open={registrationOpen}
          suspended={registrationOpen && section !== "catalog"}
          channelVisit={registrationVisit}
          onManageChannel={manageRegistrationChannel}
          refreshCatalog={async () => { await queryClient.fetchQuery({ queryKey: queryKeys.otwPlay.adminCatalog(), queryFn: fetchOtwPlayAdminCatalog, staleTime: 0 }); }}
          onOpenChange={value => { setRegistrationOpen(value); if (!value) setRegistrationVisit(null); }}
          catalog={catalog}
          preselectedSongId={preselectedSongId}
          onSaved={async (scope) => {
            await refresh();
            setRegisteredScope(scope);
          }}
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
  const confirm = useConfirmation();
  const [proposalDirty, setProposalDirty] = useState(false);
  useUnsavedChanges(proposalDirty);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, updateSearch] = useConsoleSearch();
  const selectedId = search.proposal ?? (!search.category && search.tab !== "automatic-review" ? search.selected : undefined) ?? null;
  const setSelectedId = (selected: string | null) => updateSearch({proposal: selected ?? undefined}, false);
  const [approvalPreflight, setApprovalPreflight] =
    useState<OtwPlayAdminCatalogEntryPreflightDto | null>(null);
  const approvalPreflightRequestId = useRef(0);
  const [singingCreditConfirmed, setSingingCreditConfirmed] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [channelRole, setChannelRole] =
    useState<Extract<OtwPlayChannelRole, "otw_official" | "unit_official" | "member_music" | "member_main" | "project_official" | "approved_kirinuki">>("project_official");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewSongId, setReviewSongId] = useState("__new");
  const [reviewSongTags, setReviewSongTags] = useState<string[]>([]);
  const [reviewPerformanceTags, setReviewPerformanceTags] = useState<string[]>([]);
  const [reviewParticipants, setReviewParticipants] = useState<ReviewParticipant[]>([]);
  const [reviewArtists, setReviewArtists] = useState<ReviewIdentity[]>([]);
  const [reviewChannelOwners, setReviewChannelOwners] = useState<ReviewChannelOwner[]>([]);
  const [reviewReleaseType, setReviewReleaseType] = useState<
    Extract<OtwPlayReleaseType, "official_mv" | "official_video" | "broadcast">
  >("official_video");
  const [reviewBroadcast, setReviewBroadcast] = useState(emptySubmissionBroadcast);
  const [reviewStart, setReviewStart] = useState(0);
  const [reviewEnd, setReviewEnd] = useState<number | null>(null);
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
  const approvalBlockers: string[] = [];
  if (reviewReleaseType === "broadcast" && !reviewBroadcast.extent) approvalBlockers.push("완곡 또는 일부 가창 여부를 확인해 주세요.");
  if (savingLocal) approvalBlockers.push("영상·채널을 확인하고 있습니다.");
  else if (!approvalPreflight) approvalBlockers.push("영상·채널 확인을 먼저 실행해 주세요.");
  if (approvalPreflight?.duplicate) approvalBlockers.push("이미 등록된 영상입니다. 기존 카탈로그 항목을 확인해 주세요.");
  if (approvalPreflight?.channel.state === "revoked") approvalBlockers.push("승인이 취소된 채널입니다. 채널 관리에서 상태를 확인해 주세요.");
  if (channelNeedsConfirmation && (reviewChannelOwners.length === 0 || reviewChannelOwners.some((owner) => !owner.submittedNameSnapshot.trim()))) approvalBlockers.push("공식 채널의 소유자를 입력해 주세요.");
  if (!reviewTitle.trim()) approvalBlockers.push("곡명을 입력해 주세요.");
  if (reviewSongId === "__new" && (reviewArtists.length === 0 || reviewArtists.some((artist) => !artist.submittedNameSnapshot.trim()))) approvalBlockers.push("새 곡의 원곡 가수를 입력해 주세요.");
  if (reviewParticipants.length === 0 || reviewParticipants.some((participant) => !participant.submittedNameSnapshot.trim())) approvalBlockers.push("가창 참여자 이름을 입력해 주세요.");
  if (!reviewParticipants.some((participant) => participant.participantRole !== "other")) approvalBlockers.push("보컬 역할의 가창 참여자가 한 명 이상 필요합니다.");
  if (!singingCreditConfirmed) approvalBlockers.push("영상의 실제 가창자와 입력한 참여자가 일치하는지 확인해 주세요.");
  if (saving !== null) approvalBlockers.push("진행 중인 저장 작업이 끝날 때까지 기다려 주세요.");

  useEffect(() => {
    setProposalDirty(false);
    setPreflightError(null);
    setSavingLocal(false);
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
    setReviewReleaseType(selected.submissionKind === "singing_clip" ? "broadcast" : "official_video");
    setChannelRole(selected.submissionKind === "singing_clip" ? "approved_kirinuki" : "project_official");
    setReviewBroadcast(selected.broadcast ?? emptySubmissionBroadcast());
    setReviewStart(0); setReviewEnd(null);
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
    setApprovalPreflight(null);
    setPreflightError(null);
    try {
      const result = await preflightOtwPlayCatalogEntry({
          youtubeUrl: selected.submittedUrl,
          startSeconds: 0,
        });
      if (
        requestId === approvalPreflightRequestId.current &&
        selectedProposalIdRef.current === selectedProposalId
      ) setApprovalPreflight(result);
    } catch (error) {
      if (requestId === approvalPreflightRequestId.current && selectedProposalIdRef.current === selectedProposalId) {
        setPreflightError(error instanceof Error ? error.message : "영상·채널 확인에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      if (requestId === approvalPreflightRequestId.current) setSavingLocal(false);
    }
  };
  const approveSelected = async () => {
    if (!selected || !approvalPreflight || approvalBlockers.length > 0) return;
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
    if (!await confirm({ title: "제안을 승인하고 게시할까요?", description: "최신 영상·채널 metadata와 실제 가창 credit을 확인하고 게시할까요?", confirmLabel: "승인하고 게시" })) return;
    const approved = await run("제안 승인", () =>
      approveOtwPlayProposal(selected.id, {
        expectedVersion: selected.version,
        expectedCatalogRevision: approvalPreflight.catalogRevision,
        song,
        participants: participantSubjects,
        channel,
        releaseType: reviewReleaseType,
        startSeconds: reviewStart, endSeconds: reviewEnd,
        broadcast: reviewReleaseType === "broadcast" ? reviewBroadcast : null,
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
      <CardContent className="space-y-3" onChangeCapture={() => setProposalDirty(true)}>
        <p className="text-sm text-muted-foreground">
          영상·채널과 실제 가창자를 확인한 뒤 신청 유형에 맞게 게시합니다. 노래 클립은 승인된 클리퍼 채널과 완곡 여부를 확인해 주세요.
        </p>
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>제안 목록을 불러오지 못했습니다. 빈 목록으로 간주하지 않습니다: {error.message}</span>
            <Button size="sm" variant="outline" disabled={fetching} onClick={() => void refetch()}>
              {fetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              다시 시도
            </Button>
          </div>
        ) : null}
        {!error && proposals.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
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
                      <div className="mt-1"><Badge variant="outline" aria-label="수집 출처: 사용자 제안">사용자 제안</Badge><Badge className="ml-1" variant="secondary">{proposal.submissionKind === "singing_clip" ? "노래 클립" : "공식 커버"}</Badge></div>

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
          <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[minmax(240px,360px)_minmax(0,1fr)]">
            <div>
              {reviewReleaseType === "broadcast" ? <ReviewSegmentPlayer videoId={selected.youtubeVideoId} startSeconds={reviewStart} endSeconds={reviewEnd ?? approvalPreflight?.video.durationSeconds ?? null} thumbnailUrl={approvalPreflight?.video.thumbnailUrl ?? null} valid={Number.isSafeInteger(reviewStart) && reviewStart >= 0 && (reviewEnd == null || reviewEnd > reviewStart)} /> : <iframe
                className="aspect-video w-full"
                src={`https://www.youtube-nocookie.com/embed/${selected.youtubeVideoId}`}
                title={`${selected.submittedTitle} 검수 영상`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />}
            </div>
            <div className="min-w-0 space-y-2 text-sm">
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
                {approvalPreflight ? (
                  <Badge variant={approvalPreflight.channel.state === "revoked" ? "destructive" : "secondary"}>
                    channel {approvalPreflight.channel.state}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 space-y-4 text-sm lg:col-span-2 [&_[data-slot=select-trigger]]:w-full">
              {approvalPreflight && channelNeedsConfirmation ? (
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <Field label="채널 역할">
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
                        <SelectItem value="approved_kirinuki">승인 클리퍼</SelectItem>
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
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2 rounded-md bg-muted/20 p-3 lg:grid-cols-[11rem_6rem_minmax(0,1fr)_2.25rem]"
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
              <div className="space-y-5 rounded-lg border bg-background p-4">
                <div>
                  <p className="font-semibold">승인 내용 편집</p>
                  <p className="text-xs text-muted-foreground">
                    곡 정보와 가창 정보를 확인한 뒤 아래에서 영상을 확인하고 승인해 주세요.
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
                        <div key={artist.rowKey} className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2 rounded-md bg-muted/20 p-3 lg:grid-cols-[11rem_6rem_minmax(0,1fr)_2.25rem]">
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
                    <div key={participant.rowKey} className="grid min-w-0 grid-cols-[minmax(0,1fr)_8rem] gap-2 rounded-md bg-muted/20 p-3 lg:grid-cols-[10rem_6rem_minmax(0,1fr)_8rem_2.25rem] [&>button:last-child]:col-start-2 [&>button:last-child]:justify-self-end lg:[&>button:last-child]:col-start-auto">
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
                {reviewReleaseType === "broadcast" ? <div className="space-y-4 rounded-lg border p-4"><BroadcastMetadataFields value={reviewBroadcast} onChange={setReviewBroadcast} idPrefix="proposal-broadcast" /><div className="grid grid-cols-2 gap-3"><Field label="재생 시작 (초)"><Input type="number" min={0} value={reviewStart} onChange={event => setReviewStart(Number(event.target.value))} /></Field><Field label="재생 종료 (초)"><Input type="number" min={reviewStart + 1} placeholder="영상 끝까지" value={reviewEnd ?? ""} onChange={event => setReviewEnd(event.target.value === "" ? null : Number(event.target.value))} /></Field></div></div> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="공개 형태">
                    <Select
                      value={reviewReleaseType}
                      onValueChange={(value) => {
                        setReviewReleaseType(value as typeof reviewReleaseType);
                        setChannelRole(value === "broadcast" ? "approved_kirinuki" : "project_official");
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
                  label="영상 라벨"
                  placeholder="이 영상만의 라벨 입력"
                  selectedLabel="선택한 영상 라벨"
                  description="승인할 영상에만 적용되며 곡 태그와 별도로 저장됩니다."
                  recommendedTags={[]}
                />
              </div>
              <div className="space-y-3 rounded-lg border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">최종 확인 및 승인</p>
                  <Button type="button" size="sm" variant="outline" disabled={savingLocal || saving !== null} onClick={() => void verifySelected()}>
                    {savingLocal ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    영상·채널 확인
                  </Button>
                </div>
                {preflightError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">영상·채널 확인 실패: {preflightError}</p>}
                {approvalPreflight && !approvalPreflight.duplicate && <p className="text-xs text-muted-foreground">영상·채널 확인 완료 · {approvalPreflight.video.title}</p>}
              <label className="flex items-start gap-2 rounded-md bg-muted/30 p-3">
                <Checkbox
                  checked={singingCreditConfirmed}
                  onCheckedChange={(checked) => setSingingCreditConfirmed(checked === true)}
                />
                <span>영상의 실제 가창자와 입력된 참여자 credit이 일치함을 확인했습니다.</span>
              </label>
              <div id="proposal-approval-status" role="status" className="text-xs text-muted-foreground">
                {approvalBlockers.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4">{approvalBlockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                ) : "승인 준비가 완료되었습니다. 승인하면 공개 카탈로그에 게시됩니다."}
              </div>
              <Button
                size="sm"
                className="w-full sm:w-auto"
                disabled={approvalBlockers.length > 0}
                aria-describedby="proposal-approval-status"
                onClick={() => void approveSelected()}
              >
                확인 후 승인·게시
              </Button>
              </div>
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
    <section aria-labelledby="external-entities-title" className="space-y-3 border-t pt-4">
      <div>
        <h3 id="external-entities-title" className="text-sm font-semibold">외부 인물·그룹</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          영상 등록에서 만든 외부 가수·참여자·그룹의 표시명과 보관 상태를 관리합니다.
        </p>
      </div>
      <div className="space-y-3">
        {editing && (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
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
          <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
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
  clipOnly = false,
  items,
  entities,
  initialExternalChannelId,
  initialChannelRole = "approved_kirinuki",
  registrationTarget,
  saving,
  run,
}: {
  clipOnly?: boolean;
  initialExternalChannelId?: string;
  initialChannelRole?: OtwPlayChannelRole;
  registrationTarget?: RegistrationChannelTarget;
  items: OtwPlayAdminChannelDto[];
  entities: OtwPlayAdminEntityDto[];
  saving: string | null;
  run: (label: string, task: () => Promise<unknown>) => Promise<boolean>;
}) {
  const confirm = useConfirmation();
  const [search, updateSearch] = useConsoleSearch();
  const focusedEditor = search.view === "channel-edit" && Boolean(initialExternalChannelId);
  const editorRef = useRef<HTMLHeadingElement>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  useEffect(() => { if (focusedEditor) editorRef.current?.focus(); }, [focusedEditor, focusRevision]);
  const monitorsQuery = useOtwPlayChannelMonitors();
  const [roleFilter, setRoleFilter] = useState(search.tab === "clip-channels" || search.tab === "play-monitor" ? "clips" : "all");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const monitors = monitorsQuery.data ?? [];
  const filteredItems = items.filter(item => (roleFilter === "all" || (roleFilter === "clips" ? item.channelRole === "approved_kirinuki" : item.channelRole !== "approved_kirinuki")) && (approvalFilter === "all" || item.verificationStatus === approvalFilter) && (!monitorsQuery.data || collectionFilter === "all" || (monitors.find(monitor => monitor.channelId === item.id)?.status ?? "none") === collectionFilter));
  const visibleChannels = filteredItems.filter((item) => !search.q || [item.displayName, ...item.entityIds.map((id) => entities.find((entity) => entity.id === id)?.displayName ?? "")].join(" ").toLocaleLowerCase().includes(search.q.toLocaleLowerCase()));
  const empty = {
    externalChannelId: focusedEditor ? initialExternalChannelId! : "",
    displayName: "",
    channelRole: (focusedEditor ? initialChannelRole : clipOnly ? "approved_kirinuki" : "member_music") as OtwPlayChannelRole,
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoLookupTarget = useRef<string | null>(null);
  const lookupRequestRef = useRef(0);
  const initializedExternalId = useRef<string | null>(null);
  const targetExternalId = initialExternalChannelId ?? (["play-monitor", "clip-channels"].includes(search.tab ?? "") ? monitors.find(monitor => monitor.id === search.category)?.externalChannelId : undefined);
  useEffect(() => {
    if (!targetExternalId || initializedExternalId.current === targetExternalId) return;
    initializedExternalId.current = targetExternalId;
    const channel = items.find(item => item.externalChannelId === targetExternalId);
    if (channel) {
      setEditing(channel); setForm({ externalChannelId: channel.externalChannelId, displayName: channel.displayName, channelRole: channel.channelRole, verificationStatus: channel.verificationStatus, active: channel.active, entityIds: channel.entityIds });
      setVerifiedChannelId(channel.externalChannelId); setLookupStatus("verified");
    } else setForm(current => ({ ...current, externalChannelId: targetExternalId, channelRole: initialChannelRole }));
  }, [targetExternalId, initialChannelRole, items, focusRevision]);
  const lookupChannel = useCallback(async (channelId: string) => {
    const externalChannelId = channelId.trim();
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
  }, []);
  useEffect(() => {
    if (!registrationTarget || !targetExternalId || items.some(item => item.externalChannelId === targetExternalId) || autoLookupTarget.current === targetExternalId) return;
    autoLookupTarget.current = targetExternalId;
    void lookupChannel(targetExternalId);
  }, [registrationTarget, targetExternalId, items, lookupChannel]);
  const persist = async () => {
    setSaveError(null);
    const core = {
      externalChannelId: form.externalChannelId.trim(),
      displayName: form.displayName,
      channelRole: clipOnly ? "approved_kirinuki" as const : form.channelRole,
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
    if (!succeeded) {
      setSaveError("채널을 저장하지 못했습니다. 입력은 유지되어 있으니 다시 시도하세요.");
      try {
        const latest = await fetchOtwPlayAdminCatalog();
        const current = latest.channels.find(item => item.externalChannelId === core.externalChannelId);
        if (current && (!editing || current.version !== editing.version)) {
          setEditing(current);
          setForm({ externalChannelId: current.externalChannelId, displayName: current.displayName, channelRole: current.channelRole, verificationStatus: current.verificationStatus, active: current.active, entityIds: current.entityIds });
          setVerifiedChannelId(current.externalChannelId);
          setLookupStatus("verified");
          setSaveError("다른 작업에서 저장된 최신 채널을 불러왔습니다. 승인 상태와 용도를 확인한 뒤 다시 저장하세요.");
        }
      } catch { /* Preserve the form and allow retry when readback also fails. */ }
      return;
    }
    if (focusedEditor) {
      initializedExternalId.current = null;
      setFocusRevision(current => current + 1);
      setConfirmingEntityChange(false);
      return;
    }
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
  const removeChannel = async (channel: OtwPlayAdminChannelDto) => {
    if (!await confirm({
      title: `${channel.displayName} 채널을 삭제할까요?`,
      description: "Play 채널 등록 정보를 영구 삭제합니다. 연결된 영상·수집 설정이 있으면 삭제할 수 없습니다. YouTube 채널 자체는 삭제되지 않습니다.",
      confirmLabel: "채널 삭제",
      destructive: true,
    })) return;
    const current = items.find(item => item.id === channel.id) ?? channel;
    if (!await run("채널 삭제", () => deleteOtwPlayChannel(current.id, { expectedVersion: current.version }))) return;
    if (editing?.id === channel.id) {
      lookupRequestRef.current += 1;
      setEditing(null);
      setForm({ ...empty, externalChannelId: "" });
      setLookupStatus("idle");
      setLookupError(null);
      setVerifiedChannelId(null);
      setEntitySearch("");
      setConfirmingEntityChange(false);
      if (focusedEditor) updateSearch({ view: undefined, channel: undefined });
    }
  };
  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base"><h2 id="approved-channels-title">Play 채널</h2></CardTitle>
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
      <CardContent className="space-y-3 p-3">
        {!focusedEditor && <PlayAutomationControl monitors={monitors} />}
        {monitorsQuery.isError && <p role="alert" className="text-sm">수집 상태를 불러오지 못했습니다. 채널 정보는 유지되며 수집 상태 필터는 잠시 사용할 수 없습니다.</p>}
        {!focusedEditor && <>
        <div className="flex flex-wrap gap-2">
          <select aria-label="채널 용도 필터" className="rounded border bg-background p-2" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="all">모든 용도</option><option value="official">공식 채널</option><option value="clips">노래 클립 채널</option></select>
          <select aria-label="채널 승인 필터" className="rounded border bg-background p-2" value={approvalFilter} onChange={event => setApprovalFilter(event.target.value)}><option value="all">모든 승인 상태</option><option value="pending">검수 대기</option><option value="approved">승인됨</option><option value="revoked">철회됨</option></select>
          <select disabled={monitorsQuery.isError || monitorsQuery.isLoading} aria-label="채널 수집 필터" className="rounded border bg-background p-2" value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)}><option value="all">모든 수집 상태</option><option value="active">수집 중</option><option value="paused">수집 중지</option><option value="none">수집 미설정</option></select>
        </div>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={`${item.displayName} 채널 삭제`}
                      disabled={saving !== null}
                      onClick={() => void removeChannel(item)}
                    >
                      <Trash2 className="h-4 w-4" /> 삭제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>

        </>}
        <div id="play-channel-editor" className={focusedEditor ? "space-y-5" : "space-y-3 rounded-xl border bg-muted/20 p-3"}>
          {registrationTarget && <p className="text-sm text-muted-foreground">{registrationTarget.displayName} · 곡 등록에 사용할 채널을 확인합니다. {editing ? "등록 완료 · 승인 상태와 영상 사용 허용을 확인하고 저장하세요." : "등록 후 승인 단계로 이어집니다."}</p>}
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 ref={editorRef} tabIndex={-1} className="font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{editing ? `${editing.displayName} 수정` : "채널 등록"}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                신규 채널은 검수 대기로 생성됩니다. 등록 후 승인 상태와 활성 여부를 확인하세요.
              </p>
            </div>
            {editing && <Badge variant="outline">version {editing.version}</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
          <Field
            className="min-w-0 lg:col-span-2"
            label="YouTube 채널 ID"
            htmlFor="advanced-channel-id"
            description="UC로 시작하는 channel ID를 입력한 뒤 조회하세요."
          >
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                className="min-w-0 w-full sm:flex-1"
                id="advanced-channel-id"
                aria-label="YouTube channel ID"
                value={form.externalChannelId}
                readOnly={Boolean(registrationTarget)}
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
                onClick={() => void lookupChannel(form.externalChannelId)}
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
          <div className="space-y-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
                  <Label htmlFor="advanced-channel-active">이 채널 영상 사용 허용</Label>
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
                  if (focusedEditor) {
                    initializedExternalId.current = null;
                    setFocusRevision(current => current + 1);
                    return;
                  }
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
        {editing && <><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">자동 수집 설정 (선택)</summary><div className="mt-3"><ChannelCollectionSettings channel={items.find(item => item.id === editing.id) ?? editing} /></div></details><Button variant="destructive" disabled={saving !== null} onClick={() => void removeChannel(editing)}>채널 삭제</Button></>}
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
