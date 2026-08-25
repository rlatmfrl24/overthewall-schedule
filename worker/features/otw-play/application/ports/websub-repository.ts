import type {
  OtwPlayChannelMonitorDto,
  OtwPlayWebsubSubscriptionStatus,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "./youtube-metadata";

export interface WebsubSubscriptionAuthority {
  id: string;
  monitorId: string;
  monitorGeneration: number;
  externalChannelId: string;
  topicUrl: string;
  callbackTokenHash: string;
  secretVersion: number;
  status: OtwPlayWebsubSubscriptionStatus;
  pendingMode: "subscribe" | "unsubscribe" | null;
  requestedAt: number;
  leaseExpiresAt: number | null;
  monitorStatus: "active" | "paused";
  monitorDeletedAt: number | null;
  approvalStatus: "approved" | "revoked" | null;
}

export interface WebsubDeliveryWorkItem {
  id: string;
  subscriptionId: string;
  monitorId: string;
  monitorGeneration: number;
  externalChannelId: string;
  externalVideoId: string;
  providerUpdatedAt: number;
  status: "pending" | "enqueued" | "processing" | "failed";
  attemptCount: number;
  monitorVersion: number;
  monitorStatus: "active" | "paused";
  monitorDeletedAt: number | null;
  approvalStatus: "approved" | "revoked" | null;
}

export interface StaleWebsubIntent {
  monitorId: string;
  status: "pending" | "renewing" | "unsubscribing";
}

export interface WebsubRepository {
  getMonitor(id: string): Promise<OtwPlayChannelMonitorDto>;
  getCurrentSubscription(
    monitorId: string,
    monitorGeneration: number,
  ): Promise<WebsubSubscriptionAuthority | null>;
  findSubscriptionByTokenHash(
    callbackTokenHash: string,
  ): Promise<WebsubSubscriptionAuthority | null>;
  prepareSubscription(input: {
    id: string;
    monitorId: string;
    monitorGeneration: number;
    topicUrl: string;
    callbackTokenHash: string;
    secretVersion: number;
    status: "pending" | "renewing" | "unsubscribing";
    pendingMode: "subscribe" | "unsubscribe";
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<void>;
  markSubscriptionVerified(input: {
    id: string;
    mode: "subscribe" | "unsubscribe";
    leaseExpiresAt: number | null;
    now: number;
  }): Promise<void>;
  markSubscriptionDenied(id: string, errorCode: string, now: number): Promise<void>;
  markSubscriptionFailed(
    id: string,
    errorCode: string,
    fallbackStatus: "active" | "failed",
    now: number,
  ): Promise<void>;
  recordDelivery(input: {
    id: string;
    subscription: WebsubSubscriptionAuthority;
    externalChannelId: string;
    externalVideoId: string;
    providerUpdatedAt: number;
    now: number;
  }): Promise<{ id: string; shouldEnqueue: boolean }>;
  markDeliveryEnqueued(id: string, now: number): Promise<void>;
  markDeliveryFailed(id: string, errorCode: string, now: number): Promise<void>;
  claimDelivery(id: string, now: number): Promise<WebsubDeliveryWorkItem | null>;
  recordDeliveryObservation(input: {
    delivery: WebsubDeliveryWorkItem;
    observation: OtwPlayYouTubeVideoObservation;
    now: number;
  }): Promise<void>;
  rejectDelivery(id: string, errorCode: string, now: number): Promise<void>;
  markDeliveryDeadLetter(id: string, errorCode: string, now: number): Promise<void>;
  listRecoverableDeliveryIds(now: number, limit: number): Promise<string[]>;
  listStaleIntents(now: number, limit: number): Promise<StaleWebsubIntent[]>;
  listCleanupMonitorIds(limit: number): Promise<string[]>;
  listRenewalMonitorIds(now: number, limit: number): Promise<string[]>;
}

export interface WebsubHubClient {
  request(input: {
    mode: "subscribe" | "unsubscribe";
    topicUrl: string;
    callbackUrl: string;
    hubSecret: string;
  }): Promise<void>;
}

export interface WebsubQueueSender {
  send(message: OtwPlayWebsubQueueMessage): Promise<void>;
}

export interface OtwPlayWebsubQueueMessage {
  schemaVersion: 1;
  messageType: "channel_websub";
  deliveryId: string;
}
