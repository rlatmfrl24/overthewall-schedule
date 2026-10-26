export type XActivityQueueMessage = { type: "x_activity" | "x_activity_dispatch"; eventId: string };

export type XApiOperation = "user_lookup" | "timeline" | "tweet_lookup";
export interface XApiGatewayRequest {
  id: string;
  operation: XApiOperation;
  path: string;
  estimatedCostMicros?: number;
}
export interface XApiGatewayResult {
  ok: boolean;
  status: number;
  body?: unknown;
  error?: string;
  costMicros: number;
  cached: boolean;
  dispatched: boolean;
}
export interface XSharedBudgetState {day:string;used:number;reserved:number;limit:number;remaining:number;seeded:boolean}
export interface XApiGateway {
  execute(request: XApiGatewayRequest): Promise<XApiGatewayResult>;
  readBudget(): Promise<XSharedBudgetState>;
  redactPost(postId:string): Promise<void>;
}

export const unavailableXApiGateway: XApiGateway = {
  execute: async () => ({ ok: false, status: 503, error: "shared_budget_unavailable", costMicros: 0, cached: false, dispatched: false }),
  readBudget: async()=>({day:new Date().toISOString().slice(0,10),used:0,reserved:0,limit:1_000_000,remaining:0,seeded:false}),
  redactPost:async()=>{throw new Error("shared_cache_unavailable");},
};
export const isXActivityQueueMessage = (value: unknown): value is XActivityQueueMessage => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.type === "x_activity" || item.type === "x_activity_dispatch") && typeof item.eventId === "string" && /^[A-Za-z0-9_:-]{1,256}$/.test(item.eventId);
};

export interface XRecoveryBudgetEstimate {
  targetCount: number; pageSize: number; continuationPageSize: number; perPageMicros: number; firstPagesMicros: number;
  identityMicros: number; siteLimitMicros: number; siteFirstPagesMicros: number;
}

export interface XActivityStatusDto {
  configured: boolean;
  callbackUrl: string | null;
  subscription: null | {
    handle: string; enabled: boolean; status: string; expiresAt: number | null;
    subscriptionId: string | null; lastError: string | null;
  };
  budget: { limitMicros: number; usedMicros: number; reservedMicros: number; strictDailyCap: false };
  events: Array<{
    postId: string; receivedAt: number; status: string;
    mediaSource: "raw" | "lookup" | "pending";
    mediaCount: number; mediaTypes: string; error: string | null;
  }>;
  site?: "otw" | "luvdia";
  mode?: "normal" | "registering" | "partial" | "budget_paused" | "user_paused" | "site_paused" | "unavailable";
  pauseReason?: string | null;
  resumeAt?: number | null;
  budgetDay?: string;
  budgetReady?: boolean;
  providerActiveCount?: number;
  cachePurgePending?: number;
  coordinatorError?: string | null;
  sites?: Array<{
    site: "otw" | "luvdia"; enabled: boolean; targetCount: number; activeCount: number;
    failedCount: number; pauseReason: string | null; resumeAt: number | null; lastError: string | null;
  }>;
  /** Member subscriptions for this site; common totals remain in sites/providerActiveCount. */
  subscriptions?: Array<{
    userId: string | null; handle: string; site: "otw" | "luvdia"; state: string;
    subscriptionId: string | null; expiresAt: number | null; error: string | null;
  }>;
  recovery?: { intervalHours: number; lastSuccessAt: number | null; pendingSources: number;
    budget?: XRecoveryBudgetEstimate & {day: string; sharedRemainingMicros: number; siteRemainingMicros: number; availableMicros: number};
  };
}

export interface XActivitySiteSnapshot {
  site: "otw" | "luvdia";
  collectionEnabled: boolean;
  targets: Array<{ handle: string; userId: string | null }>;
  budget: { day: string; used: number; reserved: number };
  recovery: { intervalHours: number; lastSuccessAt: number | null; pendingSources: number; estimate?: XRecoveryBudgetEstimate };
  cachePurgePending?: number;
}
export interface XActivityUserIdentity { id: string; username: string; protected?: boolean }
export interface XActivitySitePort {
  snapshot(): Promise<XActivitySiteSnapshot>;
  rememberUser(handle: string, user: XActivityUserIdentity): Promise<boolean>;
  accept(body: unknown): Promise<boolean>;
  events(): Promise<XActivityStatusDto["events"]>;
  setRecoveryInterval(): Promise<void>;
}
export type XActivityControlResult = {ok:true;value:XActivityStatusDto}|{ok:false;error:string;status:number};
