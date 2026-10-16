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
import type {VideoCatalogCommand,VideoEntryIds,CandidateConversionInput} from "../domain/video-catalog-command";
type CandidateConversionCommand=Extract<VideoCatalogCommand,{action:"candidate_convert"}>;
import type {ChannelMutationCommand} from "../domain/channel-mutation";

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

const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/u;

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

  readCatalog(scope?: import("./ports/admin-catalog-repository").AdminCatalogScope) {
    return this.repository.readCatalog(scope);
  }

  readProposals(status?: string) {
    return this.repository.readProposals(status);
  }

  async lookupChannel(externalChannelId: string) {
    return this.verifyChannel(externalChannelId,this.youtube);
  }

  private async verifyChannel(externalChannelId:string,reader:OtwPlayYouTubeMetadataReader) {
    const normalizedChannelId = externalChannelId.trim();
    if (!YOUTUBE_CHANNEL_ID_PATTERN.test(normalizedChannelId)) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "A valid YouTube channel ID is required",
        { externalChannelId: "invalid" },
      );
    }
    const metadata = await reader.readChannel(normalizedChannelId);
    if (!metadata || metadata.channelId !== normalizedChannelId) {
      throw new AdminCatalogServiceError(
        "validation_failed",
        "YouTube channel metadata could not be verified",
        { externalChannelId: "unverified" },
      );
    }
    return {
      externalChannelId: metadata.channelId,
      displayName: metadata.displayName,
    };
  }

  private async readVerifiedVideo(youtubeUrl: string,reader=this.youtube) {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "A supported YouTube video URL is required",
        { youtubeUrl: "invalid" },
      );
    }
    const metadata = await reader.readVideo(videoId);
    if (!metadata || metadata.videoId !== videoId) {
      throw new AdminCatalogServiceError(
        "external_service_unavailable",
        "YouTube video metadata is unavailable",
      );
    }
    return metadata;
  }

  private validateSourceSegment(
    startSeconds: number,
    endSeconds: number | null | undefined,
    durationSeconds: number | null,
  ) {
    if (!Number.isSafeInteger(startSeconds) || startSeconds < 0) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "The source segment is invalid",
        { startSeconds: "invalid_segment" },
      );
    }
    if (
      endSeconds !== null &&
      endSeconds !== undefined &&
      (!Number.isSafeInteger(endSeconds) || endSeconds <= startSeconds)
    ) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "The source segment is invalid",
        { endSeconds: "invalid_segment" },
      );
    }
    if (durationSeconds !== null && startSeconds >= durationSeconds) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "The source segment is outside the video duration",
        { startSeconds: "invalid_segment" },
      );
    }
    if (
      durationSeconds !== null &&
      endSeconds !== null &&
      endSeconds !== undefined &&
      endSeconds > durationSeconds
    ) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "The source segment is outside the video duration",
        { endSeconds: "invalid_segment" },
      );
    }
  }

  async preflightCatalogEntry(
    input: OtwPlayAdminCatalogEntryPreflightRequest,
    reader=this.youtube,
  ) {
    this.validateSourceSegment(input.startSeconds, input.endSeconds, null);
    const video = await this.readVerifiedVideo(input.youtubeUrl,reader);
    this.validateSourceSegment(
      input.startSeconds,
      input.endSeconds,
      video.durationSeconds,
    );
    return this.repository.preflightCatalogEntry(video, input.startSeconds);
  }

  private videoEntityIds(subjects:readonly OtwPlayAdminCatalogSubjectInput[]) {
    const entityIds:Record<string,string>={},entityEventIds:Record<string,string>={};
    for(const subject of subjects) {const key=subjectKey(subject);if(key&&!entityIds[key]) {entityIds[key]=this.createId();entityEventIds[key]=this.createId();}}
    return {entityIds,entityEventIds};
  }
  private videoEntryIds(input:OtwPlayAdminCreateCatalogEntryRequest|OtwPlayAdminApproveProposalRequest) {
    const subjects=[...input.participants.map(item=>item.subject),...(input.song.kind==='create'?input.song.originalArtists.map(item=>item.subject):[]),...(input.channel.kind==='confirm'||input.channel.kind==='pending'?input.channel.owners:input.channel.kind==='recognized_member'?[{kind:'member' as const,memberUid:input.channel.memberUid}]:[])];
    return {...this.videoEntityIds(subjects),channelId:this.createId(),channelEventId:this.createId(),songId:this.createId(),songEventId:this.createId(),performanceId:this.createId(),performanceEventId:this.createId(),sourceId:this.createId()};
  }
  /** Only the validated retained Queue command supplies a null transferred actor. */

  private runCreatePerformance(command:Extract<VideoCatalogCommand,{action:'performance_create'}>) {
    const execute=(actual:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>{if(actual.action!=='performance_create') throw new Error('Original performance command mismatch');return this.createPerformanceOriginal(actual.input,actual.actor,actual,reader);};
    return execute(command,this.youtube);
  }
  private runUpdatePerformance(command:Extract<VideoCatalogCommand,{action:'performance_update'}>) {
    const execute=(actual:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>{if(actual.action!=='performance_update') throw new Error('Original performance command mismatch');return this.updatePerformanceOriginal(actual.input,actual.actor,actual,reader);};
    return execute(command,this.youtube);
  }
  private runCreateCatalogEntry(command:Extract<VideoCatalogCommand,{action:'catalog_create'}>) {
    const execute=(actual:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>{if(actual.action!=='catalog_create') throw new Error('Original catalog command mismatch');return this.createCatalogEntryOriginal(actual.input,actual.actor,undefined,actual,reader);};
    return execute(command,this.youtube);
  }
  private runApproveProposal(command:Extract<VideoCatalogCommand,{action:'proposal_approve'}>) {
    const execute=(actual:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>{if(actual.action!=='proposal_approve') throw new Error('Original approval command mismatch');return this.approveProposalOriginal(actual.proposalId,actual.input,actual.actor,actual,reader);};
    return execute(command,this.youtube);
  }
  async createCatalogEntry(input:OtwPlayAdminCreateCatalogEntryRequest,actor:AdminCatalogActor,candidateConversion?:Parameters<AdminCatalogRepository['createCatalogEntry']>[0]['candidateConversion']) {
    if(candidateConversion) return this.createCatalogEntryOriginal(input,actor,candidateConversion);
    return this.runCreateCatalogEntry({action:'catalog_create',input,actor,ids:this.videoEntryIds(input),now:this.clock()});
  }
  prepareCandidateConversion(input:CandidateConversionInput,actor:AdminCatalogActor):CandidateConversionCommand {
    const subjects=[...input.reviewInput.participants.map(item=>item.subject),...(input.reviewInput.song.kind==='create'?input.reviewInput.song.originalArtists.map(item=>item.subject):[])];
    return {action:'candidate_convert',input,actor,now:this.clock(),ids:{...this.videoEntityIds(subjects),channelId:this.createId(),channelEventId:this.createId(),songId:this.createId(),songEventId:this.createId(),performanceId:this.createId(),performanceEventId:this.createId(),sourceId:this.createId(),candidateEventId:this.createId(),outcomeEventId:this.createId()}};
  }
  createConvertedCatalogEntry(input:OtwPlayAdminCreateCatalogEntryRequest,command:CandidateConversionCommand,reader:OtwPlayYouTubeMetadataReader) {
    return this.createCatalogEntryOriginal(input,command.actor,{jobId:command.input.jobId,candidateId:command.input.candidateId,expectedVersion:command.input.expectedVersion,eventId:command.ids.candidateEventId},command,reader);
  }
  private async createCatalogEntryOriginal(
    input: OtwPlayAdminCreateCatalogEntryRequest,
    actor: AdminCatalogActor|null,
    candidateConversion?: {
      jobId: string | null;
      candidateId: string;
      expectedVersion: number;
      eventId: string;
    },
    command?:{ids:VideoEntryIds;now:number},reader=this.youtube,
  ) {
    if (input.releaseType === "broadcast") input = { ...input, relationType: "singing_clip" };
    else if (input.relationType === "singing_clip") throw new AdminCatalogServiceError("invalid_request", "Singing clips require a broadcast release");

    validateVersion(input.expectedCatalogRevision);
    if (input.registrationMode === "medley_segment") {
      if (input.relationType !== "cover") {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "Medley segments must be registered as covers",
          { relationType: "cover_required" },
        );
      }
      if (input.song.kind === "from_video") {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "Medley segments require an explicit song",
          { song: "explicit_song_required" },
        );
      }
      if (input.endSeconds === null || input.endSeconds === undefined) {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "Medley segments require an end position",
          { endSeconds: "required" },
        );
      }
      if (input.publicationTarget !== "draft") {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "Medley segments must be reviewed as drafts",
          { publicationTarget: "draft_required" },
        );
      }
    }
    if (input.releaseType === "broadcast" && input.publicationTarget !== "draft") {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "Broadcast entries must be reviewed as drafts before publication support is enabled",
        { publicationTarget: "draft_required" },
      );
    }
    this.validateSourceSegment(input.startSeconds, input.endSeconds, null);

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
        entityIds[key] = command?.ids.entityIds[key]??this.createId();
        entityEventIds[key] = command?.ids.entityEventIds[key]??this.createId();
      }
    }

    const video = await this.readVerifiedVideo(input.youtubeUrl,reader);
    if (
      input.registrationMode === "medley_segment" &&
      video.durationSeconds === null
    ) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "Medley segments require an authoritative video duration",
        { endSeconds: "duration_unavailable" },
      );
    }
    // An omitted clip end means the end of this verified video, not an unbounded source.
    if (input.releaseType === "broadcast" && input.endSeconds == null && video.durationSeconds !== null) {
      input = { ...input, endSeconds: video.durationSeconds };
    }
    this.validateSourceSegment(
      input.startSeconds,
      input.endSeconds,
      video.durationSeconds,
    );
    const performanceId = command?.ids.performanceId??this.createId();
    const result = await this.repository.createCatalogEntry({
      input,
      video,
      actor,
      now: command?.now??this.clock(),
      ids: {
        entityIds,
        entityEventIds,
        channelId: command?.ids.channelId??this.createId(),
        channelEventId: command?.ids.channelEventId??this.createId(),
        songId: command?.ids.songId??this.createId(),
        songEventId: command?.ids.songEventId??this.createId(),
        performanceId,
        performanceEventId: command?.ids.performanceEventId??this.createId(),
        sourceId: command?.ids.sourceId??this.createId(),
      },
      candidateConversion,
    });
    if(actor) await bestEffortAudit(this.audit, {
      eventType: "otw_play.catalog_entry.created",
      resourceType: "music_performance",
      resourceId: result.data.performance.id,
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
      resourceId: result.data.id,
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

  async deleteEntity(
    id: string,
    input: OtwPlayAdminExpectedVersionRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    const result = await this.repository.deleteEntity(
      id,
      input.expectedVersion,
      actor,
      this.createId(),
      this.clock(),
    );
    await bestEffortAudit(this.audit, {
      eventType: "otw_play.entity.deleted",
      resourceType: "music_entity",
      resourceId: id,
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
      resourceId: result.data.id,
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

  private async verifyPerformanceSources(
    input: Pick<OtwPlayAdminCreatePerformanceRequest, "sources" | "releaseType">,
    reader=this.youtube,sourceIds?:readonly string[],
  ) {
    if (
      input.sources.length === 0 ||
      input.sources.filter((source) => source.isPrimary).length !== 1 ||
      new Set(input.sources.map((source) => source.priority)).size !==
        input.sources.length
    ) {
      throw new AdminCatalogServiceError(
        "invalid_request",
        "Sources require one primary item and unique priorities",
        { sources: "invalid" },
      );
    }
    const catalog = await this.repository.readCatalog({ channelIds: input.sources.map(source => source.channelId) });
    const seenSegments = new Set<string>();
    const verified = [];
    for (const [index, source] of input.sources.entries()) {
      const videoId = extractYouTubeVideoId(source.youtubeUrl);
      if (!videoId) {
        throw new AdminCatalogServiceError(
          "invalid_request",
          "A supported YouTube video URL is required",
          { [`sources.${index}.youtubeUrl`]: "invalid" },
        );
      }
      const metadata = await reader.readVideo(videoId);
      if (!metadata) {
        throw new AdminCatalogServiceError(
          "external_service_unavailable",
          "YouTube video metadata is unavailable",
        );
      }
      const channel = catalog.channels.find(
        (item) => item.id === source.channelId,
      );
      if (
        !channel ||
        metadata.videoId !== videoId ||
        metadata.channelId !== channel.externalChannelId
      ) {
        throw new AdminCatalogServiceError(
          "validation_failed",
          "YouTube video and channel metadata do not match",
          { [`sources.${index}.channelId`]: "mismatch" },
        );
      }
      const sourceInput = input.releaseType === "broadcast" && source.endSeconds == null && metadata.durationSeconds !== null
        ? { ...source, endSeconds: metadata.durationSeconds }
        : source;
      const segmentKey = `${videoId}:${sourceInput.startSeconds}:${sourceInput.endSeconds ?? ""}`;
      if (seenSegments.has(segmentKey)) {
        throw new AdminCatalogServiceError("invalid_request", "Duplicate source segments are not allowed", { sources: "duplicate_segment" });
      }
      seenSegments.add(segmentKey);
      this.validateSourceSegment(
        sourceInput.startSeconds,
        sourceInput.endSeconds,
        metadata.durationSeconds,
      );
      verified.push({ input: sourceInput, video: metadata, sourceId: sourceIds?.[index]??this.createId() });
    }
    return verified;
  }

  createPerformance(input:OtwPlayAdminCreatePerformanceRequest,actor:AdminCatalogActor) {
    return this.runCreatePerformance({action:"performance_create",input,actor,ids:{performanceId:this.createId(),eventId:this.createId()},sourceIds:input.sources.map(()=>this.createId()),now:this.clock()});
  }
  private async createPerformanceOriginal(
    input: OtwPlayAdminCreatePerformanceRequest,
    actor: AdminCatalogActor|null,
    command:Extract<VideoCatalogCommand,{action:"performance_create"}>,reader:OtwPlayYouTubeMetadataReader,
  ) {
    if (input.releaseType === "broadcast") input = { ...input, relationType: "singing_clip" };
    else if (input.relationType === "singing_clip") throw new AdminCatalogServiceError("invalid_request", "Singing clips require a broadcast release");

    const sources = await this.verifyPerformanceSources(input,reader,command.sourceIds);
    const performanceId = command.ids.performanceId;
    const result = await this.repository.createPerformance({
      input,
      sources,
      actor,
      now: command.now,
      ids: {
        performanceId,
        eventId: command.ids.eventId,
      },
    });
    if(actor) await bestEffortAudit(this.audit, {
      eventType: "otw_play.performance.created",
      resourceType: "music_performance",
      resourceId: result.data.id,
      actor,
    });
    return result;
  }

  updatePerformance(input:OtwPlayAdminUpdatePerformanceRequest,actor:AdminCatalogActor) {
    return this.runUpdatePerformance({action:"performance_update",input,actor,ids:{...this.videoEntityIds(input.participants.map(item=>item.subject)),eventId:this.createId()},sourceIds:input.sources.map(()=>this.createId()),now:this.clock()});
  }
  private async updatePerformanceOriginal(
    input: OtwPlayAdminUpdatePerformanceRequest,
    actor: AdminCatalogActor|null,
    command:Extract<VideoCatalogCommand,{action:"performance_update"}>,reader:OtwPlayYouTubeMetadataReader,
  ) {
    if (input.releaseType === "broadcast") input = { ...input, relationType: "singing_clip" };
    else if (input.relationType === "singing_clip") throw new AdminCatalogServiceError("invalid_request", "Singing clips require a broadcast release");

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
        entityIds[key] = command.ids.entityIds[key];
        entityEventIds[key] = command.ids.entityEventIds[key];
      }
    }
    const sources = await this.verifyPerformanceSources(input,reader,command.sourceIds);
    const result = await this.repository.updatePerformance({
      input,
      sources,
      actor,
      now: command.now,
      ids: {
        entityIds,
        entityEventIds,
        eventId: command.ids.eventId,
      },
    });
    if(actor) await bestEffortAudit(this.audit, {
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
    return this.runChannel({action:"create",id:this.createId(),input,actor,eventId:this.createId(),now:this.clock()});
  }

  async updateChannel(
    input: OtwPlayAdminUpdateChannelRequest,
    actor: AdminCatalogActor,
  ) {
    validateVersion(input.expectedVersion);
    return this.runChannel({action:"update",id:input.id,input,actor,eventId:this.createId(),now:this.clock()});
  }

  /** Internal Queue entry. Its transition port verifies the retained operation
   * and original command before admitting a nullable transferred-source actor. */

  private runChannel(command:ChannelMutationCommand) {
    const execute=async(original:ChannelMutationCommand,reader:OtwPlayYouTubeMetadataReader)=>{
      const metadata=await this.verifyChannel(original.input.externalChannelId,reader);
      const result=original.action==="create"
        ?await this.repository.createChannel({...original.input,displayName:metadata.displayName},original.actor,{channelId:original.id,eventId:original.eventId},original.now)
        :await this.repository.updateChannel({...original.input,displayName:metadata.displayName},original.actor,original.eventId,original.now);
      if(original.actor) await bestEffortAudit(this.audit,{eventType:`otw_play.channel.${original.action==="create"?"created":"updated"}`,resourceType:"music_channel",resourceId:result.data.id,actor:original.actor});
      return result;
    };
    if(!command.actor) throw new Error("Channel writes require their own authenticated actor");
    return execute(command,this.youtube);
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

  async approveProposal(id:string,input:OtwPlayAdminApproveProposalRequest,actor:AdminCatalogActor) {
    const proposal=(await this.repository.readProposals()).find(item=>item.id===id);
    if(!proposal) throw new AdminCatalogServiceError('not_found','Proposal not found');
    return this.runApproveProposal({action:'proposal_approve',proposalId:id,proposalVideoId:proposal.youtubeVideoId,input,actor,ids:{...this.videoEntryIds(input),proposalEventId:this.createId()},now:this.clock()});
  }
  private async approveProposalOriginal(
    id: string,
    input: OtwPlayAdminApproveProposalRequest,
    actor: AdminCatalogActor|null,
    command:Extract<VideoCatalogCommand,{action:"proposal_approve"}>,reader:OtwPlayYouTubeMetadataReader,
  ) {
    validateVersion(input.expectedVersion);
    validateVersion(input.expectedCatalogRevision);
    if (input.releaseType !== "broadcast" && !this.officialCoverPolicyEnabled) {
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
      const catalog = await this.repository.readCatalog({});
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
    const catalog = await this.repository.readCatalog({ channelIds: input.channel.kind === "existing" ? [input.channel.channelId] : [] });
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
        "게시하려면 신청 유형에 맞는 승인된 활성 채널이 필요합니다.",
      );
    }
    const allowedRoles = new Set(input.releaseType === "broadcast" ? ["approved_kirinuki"] : [
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
    const video = await reader.readVideo(proposal.youtubeVideoId);
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
        "영상의 채널이 승인된 활성 채널인지, 공식 영상·클립 분류에 맞는지 확인해 주세요.",
      );
    }
    const startSeconds = input.startSeconds ?? 0;
    const endSeconds = input.releaseType === "broadcast" ? input.endSeconds ?? video.durationSeconds : input.endSeconds;
    this.validateSourceSegment(startSeconds, endSeconds, video.durationSeconds);
    if (input.releaseType === "broadcast" && (!input.broadcast?.extent || endSeconds == null || video.durationSeconds == null)) {
      throw new AdminCatalogServiceError("validation_failed", "클립의 완곡 여부와 재생 종료 구간을 확인해 주세요.", { broadcast: "extent_and_segment_required" });
    }
    input = { ...input, startSeconds, endSeconds };
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
      entityIds[key] = command.ids.entityIds[key];
      entityEventIds[key] = command.ids.entityEventIds[key];
    }
    const result = await this.repository.approveProposal({
      proposalId: id,
      input,
      video,
      actor,
      now: command.now,
      ids: {
        lockToken: command.reviewLockToken??this.createId(),
        entityIds,
        entityEventIds,
        channelId: command.ids.channelId,
        channelEventId: command.ids.channelEventId,
        songId: command.ids.songId,
        performanceId: command.ids.performanceId,
        sourceId: command.ids.sourceId,
        proposalEventId: command.ids.proposalEventId,
        songEventId: command.ids.songEventId,
        performanceEventId: command.ids.performanceEventId,
      },
    });
    if(actor) await bestEffortAudit(this.audit, {
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
