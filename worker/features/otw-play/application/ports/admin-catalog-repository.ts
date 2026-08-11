import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminApproveProposalRequest,
  OtwPlayAdminChannelDto,
  OtwPlayAdminCommandResponse,
  OtwPlayAdminCreateChannelRequest,
  OtwPlayAdminCreateEntityRequest,
  OtwPlayAdminCreatePerformanceRequest,
  OtwPlayAdminCreateSongRequest,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminEntityDto,
  OtwPlayAdminProposalDto,
  OtwPlayAdminRejectProposalRequest,
  OtwPlayAdminSongDto,
  OtwPlayAdminSourceDto,
  OtwPlayAdminUpdateChannelRequest,
  OtwPlayAdminUpdateEntityRequest,
  OtwPlayAdminUpdatePerformanceRequest,
  OtwPlayAdminUpdateSongRequest,
  OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";

export interface AdminCatalogActor {
  userId: string;
  displayName: string | null;
  ipAddress: string | null;
}

export interface VerifiedYouTubeVideo {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: number | null;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
}

export type AdminCatalogRepositoryErrorCode =
  | "not_found"
  | "stale_write"
  | "validation_failed"
  | "unavailable";

export class AdminCatalogRepositoryError extends Error {
  readonly code: AdminCatalogRepositoryErrorCode;

  constructor(code: AdminCatalogRepositoryErrorCode, message: string) {
    super(message);
    this.name = "AdminCatalogRepositoryError";
    this.code = code;
  }
}

export interface AdminCreatePerformanceCommand {
  input: OtwPlayAdminCreatePerformanceRequest;
  video: VerifiedYouTubeVideo;
  actor: AdminCatalogActor;
  now: number;
  ids: {
    performanceId: string;
    sourceId: string;
    eventId: string;
  };
}

export interface AdminUpdatePerformanceCommand {
  input: OtwPlayAdminUpdatePerformanceRequest;
  video: VerifiedYouTubeVideo;
  actor: AdminCatalogActor;
  now: number;
  ids: { sourceId: string; eventId: string };
}

export interface AdminApproveProposalCommand {
  proposalId: string;
  input: OtwPlayAdminApproveProposalRequest;
  video: VerifiedYouTubeVideo;
  actor: AdminCatalogActor;
  now: number;
  ids: {
    lockToken: string;
    songId: string;
    performanceId: string;
    sourceId: string;
    proposalEventId: string;
    songEventId: string;
    performanceEventId: string;
  };
}

export interface AdminCatalogRepository {
  readCatalog(): Promise<OtwPlayAdminCatalogDto>;
  readProposals(status?: string): Promise<OtwPlayAdminProposalDto[]>;
  createEntity(
    input: OtwPlayAdminCreateEntityRequest,
    actor: AdminCatalogActor,
    ids: { entityId: string; eventId: string },
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminEntityDto>>;
  updateEntity(
    input: OtwPlayAdminUpdateEntityRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminEntityDto>>;
  createSong(
    input: OtwPlayAdminCreateSongRequest,
    actor: AdminCatalogActor,
    ids: { songId: string; eventId: string },
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>>;
  updateSong(
    input: OtwPlayAdminUpdateSongRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>>;
  createPerformance(
    command: AdminCreatePerformanceCommand,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>;
  updatePerformance(
    command: AdminUpdatePerformanceCommand,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>;
  transitionPerformance(
    id: string,
    expectedVersion: number,
    target: "published" | "withdrawn",
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>;
  createChannel(
    input: OtwPlayAdminCreateChannelRequest,
    actor: AdminCatalogActor,
    ids: { channelId: string; eventId: string },
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
  updateChannel(
    input: OtwPlayAdminUpdateChannelRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
  deleteChannel(
    id: string,
    expectedVersion: number,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<{ id: string }>>;
  recheckSource(
    sourceId: string,
    expectedVersion: number,
    video: VerifiedYouTubeVideo,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminSourceDto>>;
  rejectProposal(
    proposalId: string,
    input: OtwPlayAdminRejectProposalRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminProposalDto>>;
  approveProposal(
    command: AdminApproveProposalCommand,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminProposalDto>>;
}

export interface AdminCatalogGlobalAudit {
  record(input: {
    eventType: string;
    resourceType: string;
    resourceId: string;
    actor: AdminCatalogActor;
    detail?: Record<string, unknown>;
  }): Promise<void>;
}
