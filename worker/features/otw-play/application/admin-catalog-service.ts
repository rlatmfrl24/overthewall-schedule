import type {
  OtwPlayAdminCatalogEntryPreflightRequest,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminCreateCatalogEntryRequest,
  OtwPlayAdminCreateChannelRequest,
  OtwPlayAdminApproveProposalRequest,
  OtwPlayAdminCreateEntityRequest,
  OtwPlayAdminCreatePerformanceRequest,
  OtwPlayAdminCreateSongRequest,
  OtwPlayAdminExpectedVersionRequest,
  OtwPlayAdminRejectProposalRequest,
  OtwPlayAdminRecheckSourceRequest,
  OtwPlayAdminUpdateChannelRequest,
  OtwPlayAdminUpdateEntityRequest,
  OtwPlayAdminUpdatePerformanceRequest,
  OtwPlayAdminUpdateSongRequest,
} from "@contracts/otw-play";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";
import type {
  AdminCatalogActor,
  AdminCatalogGlobalAudit,
  AdminCatalogRepository,
} from "./ports/admin-catalog-repository";
import type { OtwPlayYouTubeMetadataReader } from "./ports/youtube-metadata";

export type AdminCatalogServiceErrorCode =
  | "invalid_request"
  | "not_found"
  | "stale_write"
  | "validation_failed"
  | "policy_unresolved"
  | "external_service_unavailable";

export class AdminCatalogServiceError extends Error {
  readonly code: AdminCatalogServiceErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    code: AdminCatalogServiceErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AdminCatalogServiceError";
    this.code = code;
    this.fields = fields;
  }
}

const validateVersion = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AdminCatalogServiceError(
      "invalid_request",
      "expectedVersion must be a non-negative integer",
      { expectedVersion: "invalid" },
    );
  }
};

const subjectKey = (subject: OtwPlayAdminCatalogSubjectInput) =>
  subject.kind === "member"
    ? `member:${subject.memberUid}`
    : subject.kind === "new_external"
      ? `external:${subject.clientKey}`
      : null;

const bestEffortAudit = async (
  audit: AdminCatalogGlobalAudit,
  input: Parameters<AdminCatalogGlobalAudit["record"]>[0],
) => {
  try {
    await audit.record(input);
  } catch (error) {
    console.warn("OTW Play global audit write failed", {
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
};

export class AdminCatalogService {
  private readonly repository: AdminCatalogRepository;
  private readonly youtube: OtwPlayYouTubeMetadataReader;
  private readonly audit: AdminCatalogGlobalAudit;
  private readonly clock: () => number;
  private readonly createId: () => string;
  private readonly officialCoverPolicyEnabled: boolean;

  constructor(
    repository: AdminCatalogRepository,
    youtube: OtwPlayYouTubeMetadataReader,
    audit: AdminCatalogGlobalAudit,
    createId: () => string,
    officialCoverPolicyEnabled: boolean,
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.audit = audit;
    this.clock = clock;
    this.createId = createId;
    this.officialCoverPolicyEnabled = officialCoverPolicyEnabled;
  }

  readCatalog() {
    return this.repository.readCatalog();
  }

  readProposals(status?: string) {
    return this.repository.readProposals(status);
  }

  private async readVerifiedVideo(youtubeUrl: string) {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "A supported YouTube video URL is required",
        { youtubeUrl: "invalid" },
      );
    }
    const metadata = await this.youtube.readVideo(videoId);
    if (!metadata || metadata.videoId !== videoId) {
      throw new AdminCatalogServiceError(
        "external_service_unavailable",
        "YouTube video metadata is unavailable",
      );
    }
    return metadata;
  }

  async preflightCatalogEntry(
    input: OtwPlayAdminCatalogEntryPreflightRequest,
  ) {
    if (!Number.isSafeInteger(input.startSeconds) || input.startSeconds < 0) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "startSeconds must be a non-negative integer",
        { startSeconds: "invalid" },
      );
    }
    return this.repository.preflightCatalogEntry(
      await this.readVerifiedVideo(input.youtubeUrl),
      input.startSeconds,
    );
  }

  async createCatalogEntry(
    input: OtwPlayAdminCreateCatalogEntryRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedCatalogRevision);
    if (
      !Number.isSafeInteger(input.startSeconds) ||
      input.startSeconds < 0 ||
      (input.endSeconds !== null &&
        input.endSeconds !== undefined &&
        (!Number.isSafeInteger(input.endSeconds) ||
          input.endSeconds <= input.startSeconds))
    ) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "The source segment is invalid",
        { startSeconds: "invalid_segment" },
      );
    }

    const subjects = [
      ...input.participants.map((item) => item.subject),
      ...(input.song.kind === "create"
        ? input.song.originalArtists.map((item) => item.subject)
        : []),
      ...(input.channel.kind === "confirm" || input.channel.kind === "pending"
        ? input.channel.owners
        : input.channel.kind === "recognized_member"
          ? [{ kind: "member" as const, memberUid: input.channel.memberUid }]
          : []),
    ];
    const definitions = new Map<string, string>();
    const entityIds: Record<string, string> = {};
    const entityEventIds: Record<string, string> = {};
    for (const subject of subjects) {
      const key = subjectKey(subject);
      if (!key) continue;
      const definition = JSON.stringify(subject);
      const previous = definitions.get(key);
      if (previous && previous !== definition) {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "A subject key cannot describe multiple identities",
          { subjects: "conflicting_identity" },
        );
      }
      definitions.set(key, definition);
      if (!entityIds[key]) {
        entityIds[key] = this.createId();
        entityEventIds[key] = this.createId();
      }
    }

    const video = await this.readVerifiedVideo(input.youtubeUrl);
    const performanceId = this.createId();
    const result = await this.repository.createCatalogEntry({
      input,
      video,
      actor,
      now: this.clock(),
      ids: {
        entityIds,
        entityEventIds,
        channelId: this.createId(),
        channelEventId: this.createId(),
        songId: this.createId(),
        songEventId: this.createId(),
        performanceId,
        performanceEventId: this.createId(),
        sourceId: this.createId(),
      },
    });
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.catalog_entry.created",
      resourceType: "music_performance",
      resourceId: performanceId,
      actor,
      detail: { publicationTarget: input.publicationTarget },
    });
    return result;
  }

  async createEntity(
    input: OtwPlayAdminCreateEntityRequest,
    actor: AdminCatalogActor,
  ) {
    const entityId = this.createId();
    const result = await this.repository.createEntity(
      input,
      actor,
      { entityId, eventId: this.createId() },
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.entity.created",
      resourceType: "music_entity",
      resourceId: entityId,
      actor,
    });
    return result;
  }

  async updateEntity(
    input: OtwPlayAdminUpdateEntityRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const result = await this.repository.updateEntity(
      input,
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.entity.updated",
      resourceType: "music_entity",
      resourceId: input.id,
      actor,
    });
    return result;
  }

  async createSong(
    input: OtwPlayAdminCreateSongRequest,
    actor: AdminCatalogActor,
  ) {
    const songId = this.createId();
    const result = await this.repository.createSong(
      input,
      actor,
      { songId, eventId: this.createId() },
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.song.created",
      resourceType: "music_song",
      resourceId: songId,
      actor,
    });
    return result;
  }

  async updateSong(
    input: OtwPlayAdminUpdateSongRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const entityIds: Record<string, string> = {};
    const entityEventIds: Record<string, string> = {};
    const definitions = new Map<string, string>();
    for (const artist of input.originalArtists) {
      const key = subjectKey(artist.subject);
      if (!key) continue;
      const definition = JSON.stringify(artist.subject);
      const previous = definitions.get(key);
      if (previous && previous !== definition) {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "A subject key cannot describe multiple identities",
          { originalArtists: "conflicting_identity" },
        );
      }
      definitions.set(key, definition);
      if (!entityIds[key]) {
        entityIds[key] = this.createId();
        entityEventIds[key] = this.createId();
      }
    }
    const result = await this.repository.updateSong({
      input,
      actor,
      now: this.clock(),
      ids: {
        entityIds,
        entityEventIds,
        songEventId: this.createId(),
      },
    });
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.song.updated",
      resourceType: "music_song",
      resourceId: input.id,
      actor,
    });
    return result;
  }

  private async verifyVideo(
    input: Pick<OtwPlayAdminCreatePerformanceRequest, "source">,
  ) {
    const videoId = extractYouTubeVideoId(input.source.youtubeUrl);
    if (!videoId) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "A supported YouTube video URL is required",
        { "source.youtubeUrl": "invalid" },
      );
    }
    const metadata = await this.youtube.readVideo(videoId);
    if (!metadata) {
      throw new AdminCatalogServiceError(
        "external_service_unavailable",
        "YouTube video metadata is unavailable",
      );
    }
    const catalog = await this.repository.readCatalog();
    const channel = catalog.channels.find(
      (item) => item.id === input.source.channelId,
    );
    if (
      !channel ||
      metadata.videoId !== videoId ||
      metadata.channelId !== channel.externalChannelId
    ) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "YouTube video and channel metadata do not match",
        { "source.channelId": "mismatch" },
      );
    }
    return metadata;
  }

  async createPerformance(
    input: OtwPlayAdminCreatePerformanceRequest,
    actor: AdminCatalogActor,
  ) {
    const video = await this.verifyVideo(input);
    const performanceId = this.createId();
    const result = await this.repository.createPerformance({
      input,
      video,
      actor,
      now: this.clock(),
      ids: {
        performanceId,
        sourceId: this.createId(),
        eventId: this.createId(),
      },
    });
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.performance.created",
      resourceType: "music_performance",
      resourceId: performanceId,
      actor,
    });
    return result;
  }

  async updatePerformance(
    input: OtwPlayAdminUpdatePerformanceRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const entityIds: Record<string, string> = {};
    const entityEventIds: Record<string, string> = {};
    const definitions = new Map<string, string>();
    for (const participant of input.participants) {
      const key = subjectKey(participant.subject);
      if (!key) continue;
      const definition = JSON.stringify(participant.subject);
      const previous = definitions.get(key);
      if (previous && previous !== definition) {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "A subject key cannot describe multiple identities",
          { participants: "conflicting_identity" },
        );
      }
      definitions.set(key, definition);
      if (!entityIds[key]) {
        entityIds[key] = this.createId();
        entityEventIds[key] = this.createId();
      }
    }
    const video = await this.verifyVideo(input);
    const result = await this.repository.updatePerformance({
      input,
      video,
      actor,
      now: this.clock(),
      ids: {
        entityIds,
        entityEventIds,
        sourceId: this.createId(),
        eventId: this.createId(),
      },
    });
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.performance.updated",
      resourceType: "music_performance",
      resourceId: input.id,
      actor,
    });
    return result;
  }

  async deleteSong(
    id: string,
    input: OtwPlayAdminExpectedVersionRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const result = await this.repository.deleteSong(
      id,
      input.expectedVersion,
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.song.deleted",
      resourceType: "music_song",
      resourceId: id,
      actor,
    });
    return result;
  }

  async deletePerformance(
    id: string,
    input: OtwPlayAdminExpectedVersionRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const result = await this.repository.deletePerformance(
      id,
      input.expectedVersion,
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.performance.deleted",
      resourceType: "music_performance",
      resourceId: id,
      actor,
    });
    return result;
  }

  async transitionPerformance(
    id: string,
    input: OtwPlayAdminExpectedVersionRequest,
    target: "published" | "withdrawn",
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const result = await this.repository.transitionPerformance(
      id,
      input.expectedVersion,
      target,
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: `otw_play.performance.${target}`,
      resourceType: "music_performance",
      resourceId: id,
      actor,
    });
    return result;
  }

  async createChannel(
    input: OtwPlayAdminCreateChannelRequest,
    actor: AdminCatalogActor,
  ) {
    const metadata = await this.youtube.readChannel(input.externalChannelId);
    if (!metadata || metadata.channelId !== input.externalChannelId) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "YouTube channel metadata could not be verified",
        { externalChannelId: "unverified" },
      );
    }
    const channelId = this.createId();
    const result = await this.repository.createChannel(
      { ...input, displayName: metadata.displayName },
      actor,
      { channelId, eventId: this.createId() },
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.channel.created",
      resourceType: "music_channel",
      resourceId: channelId,
      actor,
    });
    return result;
  }

  async updateChannel(
    input: OtwPlayAdminUpdateChannelRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const metadata = await this.youtube.readChannel(input.externalChannelId);
    if (!metadata || metadata.channelId !== input.externalChannelId) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "YouTube channel metadata could not be verified",
        { externalChannelId: "unverified" },
      );
    }
    const result = await this.repository.updateChannel(
      { ...input, displayName: metadata.displayName },
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.channel.updated",
      resourceType: "music_channel",
      resourceId: input.id,
      actor,
    });
    return result;
  }

  async deleteChannel(
    id: string,
    input: OtwPlayAdminExpectedVersionRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    return this.repository.deleteChannel(
      id,
      input.expectedVersion,
      actor,
      this.createId(),
      this.clock(),
    );
  }

  async recheckSource(
    id: string,
    input: OtwPlayAdminRecheckSourceRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "A supported YouTube video URL is required",
        { youtubeUrl: "invalid" },
      );
    }
    const catalog = await this.repository.readCatalog();
    const source = catalog.performances
      .flatMap((performance) => performance.sources.map((item) => item.source))
      .find((item) => item.id === id);
    const channel = catalog.channels.find(
      (item) => item.id === input.channelId,
    );
    if (
      !source ||
      source.externalId !== videoId ||
      source.channelId !== input.channelId ||
      !channel
    ) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "Stored source and channel identity do not match the recheck request",
      );
    }
    const remoteVideo = await this.youtube.readVideo(videoId);
    const video = remoteVideo ?? {
      videoId: source.externalId,
      channelId: channel.externalChannelId,
      channelTitle: channel.displayName,
      title: source.title ?? source.externalId,
      thumbnailUrl: source.thumbnailUrl,
      durationSeconds: source.durationSeconds,
      publishedAt: source.providerPublishedAt,
      availabilityStatus: "unavailable" as const,
    };
    if (
      video.videoId !== videoId ||
      video.channelId !== channel.externalChannelId
    ) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "YouTube video and channel metadata do not match",
      );
    }
    return this.repository.recheckSource(
      id,
      input.expectedVersion,
      video,
      actor,
      this.createId(),
      this.clock(),
    );
  }

  async approveProposal(
    id: string,
    input: OtwPlayAdminApproveProposalRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    validateVersion(input.expectedCatalogRevision);
    if (!this.officialCoverPolicyEnabled) {
      throw new AdminCatalogServiceError(
        "policy_unresolved",
        "Official cover acceptance policy GATE-01 is not resolved",
      );
    }
    const proposal = (await this.repository.readProposals()).find(
      (item) => item.id === id,
    );
    if (!proposal) {
      throw new AdminCatalogServiceError("not_found", "Proposal not found");
    }
    if (
      proposal.status === "approved" &&
      proposal.approvedPerformanceId !== null &&
      proposal.version === input.expectedVersion + 1
    ) {
      const catalog = await this.repository.readCatalog();
      return { data: proposal, catalogRevision: catalog.revision };
    }
    if (proposal.status !== "pending_review") {
      throw new AdminCatalogServiceError(
        "stale_write",
        "Proposal is no longer pending review",
      );
    }
    if (proposal.version !== input.expectedVersion) {
      throw new AdminCatalogServiceError(
        "stale_write",
        "Proposal changed during review",
      );
    }
    const catalog = await this.repository.readCatalog();
    if (catalog.revision !== input.expectedCatalogRevision) {
      throw new AdminCatalogServiceError(
        "stale_write",
        "Catalog changed during proposal review",
      );
    }
    if (
      !input.singingCreditConfirmed ||
      !input.publish ||
      !input.participants.some((item) =>
        ["vocal", "featured_vocal", "chorus"].includes(item.participantRole),
      )
    ) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "Approval requires a confirmed actual singing credit",
      );
    }
    if (input.channel.kind === "pending") {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "Publishing requires an approved active official channel",
      );
    }
    const allowedRoles = new Set([
      "otw_official",
      "unit_official",
      "member_music",
      "member_main",
      "project_official",
    ]);
    const channelDecision = input.channel;
    const selectedChannel =
      channelDecision.kind === "existing"
        ? catalog.channels.find((item) => item.id === channelDecision.channelId)
        : null;
    const selectedRole =
      channelDecision.kind === "existing"
        ? selectedChannel?.channelRole
        : channelDecision.channelRole;
    const video = await this.youtube.readVideo(proposal.youtubeVideoId);
    if (
      !video ||
      video.videoId !== proposal.youtubeVideoId ||
      video.availabilityStatus !== "playable" ||
      !selectedRole ||
      !allowedRoles.has(selectedRole) ||
      (channelDecision.kind === "existing" &&
        (!selectedChannel ||
          selectedChannel.verificationStatus !== "approved" ||
          !selectedChannel.active ||
          video.channelId !== selectedChannel.externalChannelId))
    ) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "Proposal video must belong to an approved active official channel",
      );
    }
    const subjects = [
      ...input.participants.map((item) => item.subject),
      ...(input.song.kind === "create"
        ? input.song.originalArtists.map((item) => item.subject)
        : []),
      ...(input.channel.kind === "confirm"
        ? input.channel.owners
        : input.channel.kind === "recognized_member"
          ? [{ kind: "member" as const, memberUid: input.channel.memberUid }]
          : []),
    ];
    const entityIds: Record<string, string> = {};
    const entityEventIds: Record<string, string> = {};
    for (const subject of subjects) {
      const key = subjectKey(subject);
      if (!key || entityIds[key]) continue;
      entityIds[key] = this.createId();
      entityEventIds[key] = this.createId();
    }
    const result = await this.repository.approveProposal({
      proposalId: id,
      input,
      video,
      actor,
      now: this.clock(),
      ids: {
        lockToken: this.createId(),
        entityIds,
        entityEventIds,
        channelId: this.createId(),
        channelEventId: this.createId(),
        songId: this.createId(),
        performanceId: this.createId(),
        sourceId: this.createId(),
        proposalEventId: this.createId(),
        songEventId: this.createId(),
        performanceEventId: this.createId(),
      },
    });
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.proposal.approved",
      resourceType: "music_cover_proposal",
      resourceId: id,
      actor,
      detail: { performanceId: result.data.approvedPerformanceId },
    });
    return result;
  }

  rejectProposal(
    id: string,
    input: OtwPlayAdminRejectProposalRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    return this.repository.rejectProposal(
      id,
      input,
      actor,
      this.createId(),
      this.clock(),
    );
  }
}
