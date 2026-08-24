import type {
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayChannelMonitorDto,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "./youtube-metadata";

export interface EligibleChannelMonitorTarget {
  id: string;
  externalChannelId: string;
  displayName: string;
}

export interface ChannelMonitorRepository {
  findEligibleChannel(channelId: string): Promise<EligibleChannelMonitorTarget | null>;
  findByChannel(channelId: string): Promise<OtwPlayChannelMonitorDto | null>;
  get(id: string): Promise<OtwPlayChannelMonitorDto>;
  list(): Promise<OtwPlayChannelMonitorDto[]>;
  listCandidates(id: string, limit: number): Promise<OtwPlayChannelMonitorCandidateDto[]>;
  create(input: {
    id: string;
    channel: EligibleChannelMonitorTarget;
    uploadsPlaylistId: string;
    lastSeenVideoId: string | null;
    actorUserId: string;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  updateStatus(input: {
    id: string;
    expectedVersion: number;
    status: OtwPlayChannelMonitorStatus;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  listDueIds(now: number, limit: number): Promise<string[]>;
  claim(id: string, now: number): Promise<OtwPlayChannelMonitorDto | null>;
  recordCandidates(input: {
    monitorId: string;
    observations: OtwPlayYouTubeVideoObservation[];
    now: number;
  }): Promise<number>;
  complete(input: {
    id: string;
    lastSeenVideoId: string | null;
    lastSeenPublishedAt: number | null;
    now: number;
  }): Promise<OtwPlayChannelMonitorDto>;
  fail(input: { id: string; errorCode: string; now: number }): Promise<void>;
}
