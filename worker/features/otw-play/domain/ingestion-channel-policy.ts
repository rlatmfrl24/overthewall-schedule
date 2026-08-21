import type { OtwPlayChannelRole } from "@contracts/otw-play";

export const OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES = [
  "otw_official",
  "unit_official",
  "member_music",
  "member_main",
  "project_official",
] as const satisfies readonly OtwPlayChannelRole[];

export const isOtwPlayIngestionOfficialChannelRole = (
  role: OtwPlayChannelRole | null,
) => role !== null && (
  OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES as readonly OtwPlayChannelRole[]
).includes(role);
