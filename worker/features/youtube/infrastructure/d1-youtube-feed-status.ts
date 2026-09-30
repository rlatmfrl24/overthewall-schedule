import type { YouTubeFeedChannelDto, YouTubeFeedRole, YouTubeFeedState, YouTubeFeedStatusDto, YouTubeUsageRequestOrigin } from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs/d1-scheduled-job-repository";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";
import { getYouTubeQuotaWindow, readYouTubeDailyQuota, readYouTubeQuotaLedgerUsage } from "./youtube-quota";

type Registration = { channel_id: string | null; name: string; role: YouTubeFeedRole; owner_id: number };
type Source = {
  id: number; source_kind: "official" | "kirinuki"; youtube_channel_id: string;
  member_uid: number | null; kirinuki_channel_id: number | null; enabled: number; deactivated_at: number | null;
  initialization_completed_at: number | null; last_attempt_at: number | null; last_success_at: number | null;
  next_check_at: number | null; last_error_code: string | null;
  video_count: number; metadata_pending: number; oldest_metadata_at: number | null;
};
const HOUR = 60 * 60_000;
export const classifyYouTubeFeedState = (
  source: Pick<Source, "enabled" | "initialization_completed_at" | "last_success_at" | "next_check_at" | "last_error_code"> | undefined,
  automaticEnabled: boolean, apiConfigured: boolean, now: number,
): YouTubeFeedState => {
  if (!apiConfigured) return "misconfigured";
  if (source?.last_error_code) return "failed";
  if (!automaticEnabled || source?.enabled === 0) return "paused";
  if (!source?.initialization_completed_at) return "initializing";
  if (source.next_check_at !== null && source.next_check_at <= now) return now - source.next_check_at >= 2 * HOUR ? "delayed" : "due";
  return source.last_success_at === null || source.next_check_at === null ? "unknown" : "healthy";
};

/** Read-only operator snapshot. Never synchronize the registry or reserve quota here. */
export const readYouTubeFeedStatus = async (env: Env, hours: 24 | 168, now = Date.now()): Promise<YouTubeFeedStatusDto> => {
  const db = env.otw_db;
  const since = now - hours * HOUR;
  const [registrations, sourceRows, automatic, usageRows, quota, quotaLimit, recentRuns] = await Promise.all([
    db.prepare(`
      SELECT youtube_channel_id AS channel_id, name, 'official' AS role, uid AS owner_id
      FROM members WHERE is_deprecated IS NULL OR is_deprecated != 1
      UNION ALL SELECT link.youtube_channel_id, member.name || ' · ' || link.label, 'vod', member.uid
      FROM member_links link JOIN members member ON member.uid = link.member_uid
      WHERE link.type = 'youtube_vod' AND link.enabled = 1 AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
      UNION ALL SELECT youtube_channel_id, channel_name, 'kirinuki', id FROM kirinuki_channels
    `).all<Registration>(),
    db.prepare(`
      SELECT source.*, COUNT(video.video_id) AS video_count,
        COALESCE(SUM(CASE WHEN video.fetched_at <= ? THEN 1 ELSE 0 END), 0) AS metadata_pending,
        MIN(video.fetched_at) AS oldest_metadata_at
      FROM youtube_feed_sources source LEFT JOIN youtube_feed_videos video
        ON video.source_id = source.id AND video.available = 1
      GROUP BY source.id
    `).bind(now - 24 * HOUR).all<Source>(),
    db.prepare("SELECT value FROM settings WHERE key = 'scheduled_v2_youtube_feed_collection_enabled'").first<{ value: string }>(),
    db.prepare(`
      SELECT request_origin AS origin, COALESCE(SUM(CASE WHEN quota_units > 0 THEN 1 ELSE 0 END), 0) AS api_calls, COALESCE(SUM(quota_units), 0) AS quota_units,
        SUM(CASE WHEN quota_units > 0 AND (status < 200 OR status >= 300) THEN 1 ELSE 0 END) AS failures
      FROM youtube_api_usage_events WHERE created_at >= ? AND created_at <= ? GROUP BY request_origin
    `).bind(since, now).all<{ origin: YouTubeUsageRequestOrigin; api_calls: number; quota_units: number; failures: number }>(),
    readYouTubeQuotaLedgerUsage(db, now),
    readYouTubeDailyQuota(db).catch((error: unknown) => {
      // Invalid configuration is exposed as unknown; database failures must not masquerade as missing settings.
      if (error instanceof Error && error.name === "YouTubeQuotaConfigurationError") return null;
      throw error;
    }),
    new D1ScheduledJobRepository(db).listRunDtos({ jobType: "youtube_feed_collection", limit: 8, from: since, until: now + 1 }),
  ]);
  const enabled = automatic?.value === "true";
  const configured = Boolean(env.YOUTUBE_API_KEY?.trim());
  const issues: YouTubeFeedStatusDto["configurationIssues"] = [];
  const expected = new Map<string, Registration[]>();
  for (const registration of registrations.results ?? []) {
    if (!registration.channel_id || !YOUTUBE_CHANNEL_ID_PATTERN.test(registration.channel_id)) {
      issues.push({ channelId: registration.channel_id, name: registration.name, issue: registration.channel_id ? "invalid_channel_id" : "missing_channel_id" });
      continue;
    }
    const entries = expected.get(registration.channel_id) ?? [];
    entries.push(registration);
    expected.set(registration.channel_id, entries);
  }
  const sources = sourceRows.results ?? [];
  for (const source of sources) {
    const entries = expected.get(source.youtube_channel_id) ?? [];
    if (!entries.some((entry) => (entry.role === "kirinuki" ? "kirinuki" : "official") === source.source_kind)) {
      issues.push({ channelId: source.youtube_channel_id, name: source.youtube_channel_id, issue: "unregistered_source" });
    }
  }
  const priority: YouTubeFeedState[] = ["misconfigured", "failed", "delayed", "initializing", "paused", "due", "unknown", "healthy"];
  const channels: YouTubeFeedChannelDto[] = [...expected].map(([channelId, entries]) => {
    const kinds = [...new Set(entries.map((entry) => entry.role === "kirinuki" ? "kirinuki" : "official"))];
    const matched = kinds.flatMap((kind) => {
      const source = sources.find((candidate) => candidate.youtube_channel_id === channelId && candidate.source_kind === kind);
      if (!source || !source.enabled || source.deactivated_at !== null) issues.push({ channelId, name: entries.map((entry) => entry.name).join(" / "), issue: source ? "inactive_source" : "missing_source" });
      const officialOwners = entries.filter((entry) => entry.role === "official");
      const expectedOfficialOwner = Math.min(...(officialOwners.length ? officialOwners : entries.filter((entry) => entry.role === "vod")).map((entry) => entry.owner_id));
      if (source && kind === "official" && source.member_uid !== expectedOfficialOwner) issues.push({ channelId, name: entries[0].name, issue: "owner_mismatch" });
      if (source && kind === "kirinuki" && !entries.some((entry) => entry.owner_id === source.kirinuki_channel_id)) issues.push({ channelId, name: entries[0].name, issue: "owner_mismatch" });
      return [source];
    });
    const active = matched.filter((source): source is Source => Boolean(source?.enabled && source.deactivated_at === null));
    const times = (key: "last_attempt_at" | "last_success_at" | "next_check_at" | "oldest_metadata_at", max = false) => {
      const values = active.flatMap((source) => source[key] === null ? [] : [source[key]!]);
      return values.length ? (max ? Math.max(...values) : Math.min(...values)) : null;
    };
    return {
      channelId, names: [...new Set(entries.map((entry) => entry.name))], roles: [...new Set(entries.map((entry) => entry.role))],
      state: matched.map((source) => classifyYouTubeFeedState(source, enabled, configured, now)).sort((a, b) => priority.indexOf(a) - priority.indexOf(b))[0],
      initialized: matched.every((source) => Boolean(source?.initialization_completed_at)),
      lastAttemptAt: times("last_attempt_at", true), lastSuccessAt: times("last_success_at"), nextCheckAt: times("next_check_at"),
      videoCount: active.reduce((sum, source) => sum + source.video_count, 0),
      metadataPending: active.reduce((sum, source) => sum + source.metadata_pending, 0),
      oldestMetadataAt: times("oldest_metadata_at"), error: matched.find((source) => source?.last_error_code)?.last_error_code ?? null,
    };
  });
  const states = Object.fromEntries(priority.map((state) => [state, channels.filter((channel) => channel.state === state).length])) as Record<YouTubeFeedState, number>;
  const byOrigin = (usageRows.results ?? []).map((row) => ({ origin: row.origin, apiCalls: row.api_calls, quotaUnits: row.quota_units, failures: row.failures }));
  const oldest = channels.flatMap((channel) => channel.oldestMetadataAt === null ? [] : [channel.oldestMetadataAt]);
  return {
    updatedAt: now, window: { hours, since, until: now }, automaticEnabled: enabled, apiConfigured: configured, channels, configurationIssues: issues,
    summary: { channels: channels.length, states, videos: channels.reduce((sum, channel) => sum + channel.videoCount, 0), metadataPending: channels.reduce((sum, channel) => sum + channel.metadataPending, 0), oldestMetadataAt: oldest.length ? Math.min(...oldest) : null },
    usage: { apiCalls: byOrigin.reduce((sum, row) => sum + row.apiCalls, 0), quotaUnits: byOrigin.reduce((sum, row) => sum + row.quotaUnits, 0), failures: byOrigin.reduce((sum, row) => sum + row.failures, 0), byOrigin },
    quota: { ...quota, limit: quotaLimit, lowPriorityLimit: quotaLimit === null ? null : Math.floor(quotaLimit * 0.7), nextResetAt: getYouTubeQuotaWindow(quota.since + 36 * HOUR).since },
    recentRuns,
  };
};
