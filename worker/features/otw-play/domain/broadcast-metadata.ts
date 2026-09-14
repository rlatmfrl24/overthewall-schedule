import type { OtwPlayBroadcastMetadata } from "@contracts/otw-play";

export const emptyBroadcastMetadata = (): OtwPlayBroadcastMetadata => ({
  performedOn: null, dateEvidence: null, originalUrl: null, extent: null,
});

export function parseBroadcastMetadata(value: unknown): OtwPlayBroadcastMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const { performedOn, dateEvidence, originalUrl, extent } = input;
  if (performedOn !== null && (typeof performedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(performedOn) ||
    !Number.isFinite(Date.parse(`${performedOn}T00:00:00Z`)) ||
    new Date(`${performedOn}T00:00:00Z`).toISOString().slice(0, 10) !== performedOn)) return null;
  if (dateEvidence !== null && (typeof dateEvidence !== "string" || dateEvidence.length > 1000)) return null;
  if (originalUrl !== null) {
    if (typeof originalUrl !== "string" || originalUrl.length > 2000) return null;
    try {
      const url = new URL(originalUrl);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch { return null; }
  }
  if (extent !== null && extent !== "full" && extent !== "partial") return null;
  return { performedOn, dateEvidence: dateEvidence?.trim() || null, originalUrl, extent };
}

export function readBroadcastMetadata(json: string | null | undefined): OtwPlayBroadcastMetadata {
  if (!json) return emptyBroadcastMetadata();
  try { return parseBroadcastMetadata(JSON.parse(json)) ?? emptyBroadcastMetadata(); }
  catch { return emptyBroadcastMetadata(); }
}
