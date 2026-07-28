export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
export const X_MAX_HANDLES = 20;

export type XHandleTargetParseResult =
  | { ok: true; handles: string[] }
  | { ok: false; message: string };

export const parseXHandleTargets = (
  value: string | null,
): XHandleTargetParseResult => {
  if (!value) return { ok: false, message: "handles query required" };

  const handles: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const handle = part.trim().replace(/^@/, "");
    if (!handle || !X_HANDLE_PATTERN.test(handle)) {
      return {
        ok: false,
        message: handle
          ? `Invalid X handle: ${handle}`
          : "Invalid X handle",
      };
    }
    const key = handle.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      handles.push(handle);
    }
  }

  if (handles.length === 0) {
    return { ok: false, message: "handles query required" };
  }
  if (handles.length > X_MAX_HANDLES) {
    return {
      ok: false,
      message: `handles must contain at most ${X_MAX_HANDLES} items`,
    };
  }
  return { ok: true, handles };
};

export const parseXMaxResults = (value: string | null) => {
  const normalized = value?.trim() || "5";
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 5 && parsed <= 20
    ? parsed
    : null;
};

export const extractXHandle = (value: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const direct = trimmed.replace(/^@/, "");
  if (X_HANDLE_PATTERN.test(direct)) return direct;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
      url.hostname.toLowerCase(),
    )) {
      return null;
    }
    const handle = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return X_HANDLE_PATTERN.test(handle) ? handle : null;
  } catch {
    return null;
  }
};
