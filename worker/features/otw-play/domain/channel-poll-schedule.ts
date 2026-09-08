import {
  OTW_PLAY_CHANNEL_POLL_CRON_MINUTE,
  OTW_PLAY_CHANNEL_POLL_INTERVAL_MINUTES,
} from "@contracts/otw-play";

// Align with the hourly cron slot. Adding an hour to completion time would
// miss the next slot by a few seconds and inadvertently poll every two hours.
export const nextChannelPollAt = (now: number): number => {
  const intervalMs = OTW_PLAY_CHANNEL_POLL_INTERVAL_MINUTES * 60_000;
  const offsetMs = OTW_PLAY_CHANNEL_POLL_CRON_MINUTE * 60_000;
  return (Math.floor((now - offsetMs) / intervalMs) + 1) * intervalMs + offsetMs;
};
