export type ChzzkTargetAuthorizationResult =
  | { ok: true }
  | { ok: false; unauthorized: string[] };

export const authorizeChzzkChannelTargets = (
  channelIds: readonly string[],
  allowedChannelIds: ReadonlySet<string>,
): ChzzkTargetAuthorizationResult => {
  const unauthorized = channelIds.filter(
    (channelId) => !allowedChannelIds.has(channelId),
  );
  return unauthorized.length === 0
    ? { ok: true }
    : { ok: false, unauthorized };
};
