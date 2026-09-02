import type { ScheduledJobType } from "@contracts/scheduled-operations";
import { parseAutoUpdateIntervalHours } from "@contracts/configuration";
import { DATA_RETENTION_POLICIES } from "../../operations";
import {
  NAVER_CAFE_COLLECTION_SIZE,
  readEnabledNaverCafeSources,
} from "../../naver-cafe";
import {
  getScheduledXCollectionDecision,
  readActiveXHandles,
} from "../../x-posts";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { extractChzzkChannelId } from "../../../platform/http-helpers";
import { getLaneForJob } from "../../../platform/scheduled-jobs";
import type {
  D1ScheduledJobRepository,
  NewScheduledItem,
  ScheduledJobRunRecord,
} from "../../../platform/scheduled-jobs";

const chunk = <T>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const planXCollection = async (
  env: Env,
  run: ScheduledJobRunRecord,
  timestamp: number,
): Promise<NewScheduledItem[]> => {
  const rows = await env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'x_collection_enabled'`,
  ).first<{ value: string | null }>();
  if (rows?.value === "false") return [];
  if (run.source === "scheduled") {
    const decision = await getScheduledXCollectionDecision(
      getDb(env),
      timestamp,
    );
    if (!decision.shouldRun) return [];
  }
  const handles = await readActiveXHandles(getDb(env));
  return chunk(handles, 4).map((shard, index) => ({
    targetKey: `handles:${index}:${shard.join(",")}`,
    phase: "collect",
    lane: "x",
    continuation: { handles: shard },
  }));
};

const planNaverCafeCollection = async (
  env: Env,
  timestamp: number,
): Promise<NewScheduledItem[]> => {
  const sources = await readEnabledNaverCafeSources(env);
  if (sources.length === 0) return [];
  const latestPosts = await env.otw_db.prepare(
    `SELECT source_id AS sourceId, MAX(created_at) AS latestPostAt
     FROM naver_cafe_posts WHERE hidden_at IS NULL GROUP BY source_id`,
  ).all<{ sourceId: number; latestPostAt: string | null }>();
  const lastCheckedBySource = new Map(
    sources.map((source) => [
      source.id,
      Number(source.last_attempt_at ?? source.last_success_at) || 0,
    ]),
  );
  const latestPostBySource = new Map(
    latestPosts.results.map((row) => [
      row.sourceId,
      row.latestPostAt ? Date.parse(row.latestPostAt) : 0,
    ]),
  );
  const due = sources.filter((source) => {
    const latestPostAt = latestPostBySource.get(source.id) ?? 0;
    const inactiveMs = latestPostAt > 0 ? timestamp - latestPostAt : Infinity;
    const intervalHours = inactiveMs <= 24 * 60 * 60_000
      ? 1
      : inactiveMs <= 7 * 24 * 60 * 60_000
        ? 3
        : 6;
    return timestamp - (lastCheckedBySource.get(source.id) ?? 0) >=
      intervalHours * 60 * 60_000;
  });
  return chunk(due, 4).map((shard, index) => ({
    targetKey: `sources:${index}:${shard.map((source) => source.id).join(",")}`,
    phase: "collect",
    lane: "naver",
    continuation: {
      sourceIds: shard.map((source) => source.id),
      size: NAVER_CAFE_COLLECTION_SIZE,
    },
  }));
};

const planAutoUpdate = async (
  env: Env,
  run: ScheduledJobRunRecord,
  timestamp: number,
): Promise<NewScheduledItem[]> => {
  const enabled = await env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'auto_update_enabled'`,
  ).first<{ value: string | null }>();
  if (enabled?.value !== "true") return [];
  if (run.source === "scheduled") {
    const [interval, lastRun] = await Promise.all([
      env.otw_db.prepare(
        `SELECT value FROM settings WHERE key = 'auto_update_interval_hours'`,
      ).first<{ value: string | null }>(),
      env.otw_db.prepare(
        `SELECT value FROM settings WHERE key = 'auto_update_last_run'`,
      ).first<{ value: string | null }>(),
    ]);
    const intervalMs = parseAutoUpdateIntervalHours(interval?.value) * 60 * 60_000;
    const parsedLastRun = Number.parseInt(lastRun?.value ?? "", 10);
    if (
      Number.isFinite(parsedLastRun) &&
      parsedLastRun > 0 &&
      timestamp - parsedLastRun < intervalMs
    ) {
      return [];
    }
  }
  const rows = await env.otw_db.prepare(
    `SELECT url_chzzk AS urlChzzk FROM members
     WHERE is_deprecated IS NULL OR is_deprecated != 1`,
  ).all<{ urlChzzk: string | null }>();
  const channelIds = Array.from(new Set(rows.results.flatMap((row) => {
    const channelId = extractChzzkChannelId(row.urlChzzk)?.toLowerCase();
    return channelId ? [channelId] : [];
  })));
  if (channelIds.length === 0) {
    return [{ targetKey: "finalizer", phase: "finalize", lane: "auto-update" }];
  }
  return chunk(channelIds, 2).map((channels, index) => ({
    targetKey: `channels:${index}:${channels.join(",")}`,
    phase: "scan",
    lane: "auto-update",
    continuation: { channelIds: channels },
  }));
};

const makeIndexedItems = (
  count: number,
  targetPrefix: string,
  phase: string,
  lane: ReturnType<typeof getLaneForJob>,
) => Array.from({ length: count }, (_, index) => ({
  targetKey: `${targetPrefix}:${index}`,
  phase,
  lane,
}));

const planSimpleJob = async (
  env: Env,
  jobType: ScheduledJobType,
  timestamp: number,
): Promise<NewScheduledItem[]> => {
  const lane = getLaneForJob(jobType);
  switch (jobType) {
    case "youtube_feed_collection": {
      const enabled = await env.otw_db.prepare(
        `SELECT value FROM settings WHERE key = 'youtube_feed_enabled'`,
      ).first<{ value: string | null }>();
      return enabled?.value === "true"
        ? [{ targetKey: "feed:0", phase: "collect", lane }]
        : [];
    }
    case "x_compliance": {
      const enabled = await env.otw_db.prepare(
        `SELECT value FROM settings WHERE key = 'x_compliance_enabled'`,
      ).first<{ value: string | null }>();
      return enabled?.value === "true"
        ? [{ targetKey: "due:compliance", phase: "advance", lane }]
        : [];
    }
    case "websub_maintenance":
      return ["recover-delivery", "cleanup", "recover-intent", "renew"].map(
        (phase) => ({ targetKey: phase, phase, lane }),
      );
    case "ingestion_recovery":
      return ["recover-scheduled", "cleanup", "requeue"].map((phase) => ({
        targetKey: phase,
        phase,
        lane,
      }));
    case "retention_prune":
      return DATA_RETENTION_POLICIES.map((policy) => ({
        targetKey: policy.id,
        phase: "prune",
        lane,
        continuation: { policyId: policy.id },
      }));
    case "source_health": {
      const row = await env.otw_db.prepare(
        `SELECT COUNT(*) AS count FROM music_media_sources
         WHERE next_check_at <= ?`,
      ).bind(timestamp).first<{ count: number | string }>();
      return makeIndexedItems(
        Math.ceil(Number(row?.count ?? 0) / 2),
        "due",
        "check",
        lane,
      );
    }
    case "channel_reconcile": {
      const row = await env.otw_db.prepare(
        `SELECT COUNT(*) AS count FROM music_channel_upload_monitors
         WHERE status = 'active' AND deleted_at IS NULL
           AND next_check_at <= ? AND (lease_until IS NULL OR lease_until < ?)`,
      ).bind(timestamp, timestamp).first<{ count: number | string }>();
      return makeIndexedItems(
        Number(row?.count ?? 0),
        "monitor",
        "reconcile",
        lane,
      );
    }
    case "recent_reconcile": {
      const threshold = timestamp - 24 * 60 * 60_000;
      const row = await env.otw_db.prepare(
        `SELECT COUNT(*) AS count FROM music_channel_upload_monitors
         WHERE status = 'active' AND deleted_at IS NULL
           AND (last_recent_reconciled_at IS NULL
             OR last_recent_reconciled_at <= ?)
           AND (lease_until IS NULL OR lease_until < ?)`,
      ).bind(threshold, timestamp).first<{ count: number | string }>();
      return makeIndexedItems(
        Number(row?.count ?? 0),
        "recent-monitor",
        "reconcile-recent",
        lane,
      );
    }
    default:
      return [];
  }
};

export class ScheduledJobPlanner {
  private readonly env: Env;
  private readonly repository: D1ScheduledJobRepository;

  constructor(
    env: Env,
    repository: D1ScheduledJobRepository,
  ) {
    this.env = env;
    this.repository = repository;
  }

  async plan(run: ScheduledJobRunRecord) {
    const timestamp = run.scheduled_for ?? Date.now();
    let items: NewScheduledItem[];
    switch (run.job_type) {
      case "x_collection":
        items = await planXCollection(this.env, run, timestamp);
        break;
      case "naver_cafe_collection":
        items = await planNaverCafeCollection(this.env, timestamp);
        break;
      case "schedule_auto_update":
        items = await planAutoUpdate(this.env, run, timestamp);
        break;
      default:
        items = await planSimpleJob(this.env, run.job_type, timestamp);
        break;
    }
    return this.repository.addItems(run.id, items);
  }
}
