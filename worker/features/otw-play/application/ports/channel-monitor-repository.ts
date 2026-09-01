import type {
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayChannelMonitorDto,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "./youtube-metadata";
import type { ChannelMonitorCandidateCursor } from "../../domain/channel-monitor-cursor";

export interface EligibleChannelMonitorTarget {
  id: string;
  externalChannelId: string;
  displayName: string;
}

export interface ChannelMonitorAutomationApprovalInput {
  scope: "candidate_collection";
  operatorReference: string;
  approvalReference: string;
  revocationProcedure: string;
  confirmed: true;
}

export interface ChannelMonitorRepository {
  findApprovableChannel(externalChannelId: string): Promise<EligibleChannelMonitorTarget | null>;
  findEligibleChannel(externalChannelId: string): Promise<EligibleChannelMonitorTarget | null>;
  findByExternalChannel(externalChannelId: string): Promise<OtwPlayChannelMonitorDto | null>;
  get(id: string): Promise<OtwPlayChannelMonitorDto>;
  list(): Promise<OtwPlayChannelMonitorDto[]>;
  listCandidates(
    id: string,
    limit: number,
    cursor: ChannelMonitorCandidateCursor | null,
    generationScope?: "current" | "previous",
  ): Promise<{ items: OtwPlayChannelMonitorCandidateDto[]; hasMore: boolean }>;
  create(input: {
    id: string;
    eventId: string;
    approvalEventId: string;
    channel: EligibleChannelMonitorTarget;
    uploadsPlaylistId: string;
    lastSeenVideoId: string | null;
    approval: ChannelMonitorAutomationApprovalInput;
    actorUserId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  updateStatus(input: {
    id: string;
    expectedVersion: number;
    status: OtwPlayChannelMonitorStatus;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  updateTarget(input: {
    id: string;
    expectedVersion: number;
    channel: EligibleChannelMonitorTarget;
    uploadsPlaylistId: string;
    lastSeenVideoId: string | null;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  resetWatermark(input: {
    id: string;
    expectedVersion: number;
    lastSeenVideoId: string | null;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  revokeApproval(input: {
    id: string;
    expectedVersion: number;
    expectedApprovalVersion: number;
    actorUserId: string;
    approvalEventId: string;
    monitorEventId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  remove(input: {
    id: string;
    expectedVersion: number;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<{ id: string }>;
  listDueIds(now: number, limit: number): Promise<string[]>;
  listRecentDueIds(now: number, limit: number): Promise<string[]>;
  claim(id: string, now: number): Promise<OtwPlayChannelMonitorDto | null>;
  recordCandidates(input: {
    monitorId: string;
    expectedVersion: number;
    monitorGeneration: number;
    observations: OtwPlayYouTubeVideoObservation[];
    now: number;
  }): Promise<number>;
  saveContinuation(input: {
    id: string;
    expectedVersion: number;
    monitorGeneration: number;
    pageToken: string;
    baseVideoId: string | null;
    newestVideoId: string | null;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  complete(input: {
    id: string;
    expectedVersion: number;
    monitorGeneration: number;
    lastSeenVideoId: string | null;
    lastSeenPublishedAt: number | null;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  completeSupplemental(input: {
    id: string;
    expectedVersion: number;
    monitorGeneration: number;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  markGapSuspected(input: {
    id: string;
    expectedVersion: number;
    monitorGeneration: number;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  fail(input: {
    id: string;
    expectedVersion: number;
    monitorGeneration: number;
    errorCode: string;
    now: number;
  }): Promise<void>;
}
