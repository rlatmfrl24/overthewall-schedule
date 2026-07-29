export type YouTubeTargetAuthorizationResult =
  | { ok: true }
  | { ok: false; unauthorized: string[] };

export const authorizeYouTubeChannelTargets = (
  channelIds: readonly string[],
  allowedChannelIds: ReadonlySet<string>,
): YouTubeTargetAuthorizationResult => {
  const unauthorized = channelIds.filter(
    (channelId) => !allowedChannelIds.has(channelId),
  );
  return unauthorized.length === 0
    ? { ok: true }
    : { ok: false, unauthorized };
};
