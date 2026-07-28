export type XTargetAuthorizationResult =
  | { ok: true }
  | { ok: false; unauthorized: string[] };

export const authorizeXHandleTargets = (
  handles: readonly string[],
  allowedHandles: ReadonlySet<string>,
): XTargetAuthorizationResult => {
  const unauthorized = handles.filter(
    (handle) => !allowedHandles.has(handle.toLowerCase()),
  );
  return unauthorized.length === 0
    ? { ok: true }
    : { ok: false, unauthorized };
};
