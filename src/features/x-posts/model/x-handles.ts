import type { MemberDto } from "@contracts/members";

export type MemberXHandle<TMember extends MemberDto = MemberDto> = {
  member: TMember;
  handle: string;
};

export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    return trimmed.slice(1);
  }
  if (X_HANDLE_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const RESERVED_X_PATHS = new Set([
  "home",
  "i",
  "intent",
  "messages",
  "notifications",
  "search",
  "share",
]);

export const normalizeXHandle = (handle: string) =>
  handle.trim().toLowerCase();

export const extractXHandleFromUrl = (
  value?: string | null,
): string | null => {
  if (!value) return null;

  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  if (X_HANDLE_PATTERN.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const isXHost =
      host === "x.com" ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com");

    if (!isXHost) return null;

    const handle = decodeURIComponent(
      url.pathname.split("/").filter(Boolean)[0] ?? "",
    );
    if (
      !handle ||
      RESERVED_X_PATHS.has(handle.toLowerCase()) ||
      !X_HANDLE_PATTERN.test(handle)
    ) {
      return null;
    }
    return handle;
  } catch {
    return null;
  }
};

export const getMembersWithXHandles = <TMember extends MemberDto>(
  members: TMember[],
): MemberXHandle<TMember>[] => {
  const usedHandles = new Set<string>();
  const result: MemberXHandle<TMember>[] = [];

  for (const member of members) {
    const handle = extractXHandleFromUrl(member.url_twitter);
    if (!handle) continue;

    const normalizedHandle = normalizeXHandle(handle);
    if (usedHandles.has(normalizedHandle)) continue;

    usedHandles.add(normalizedHandle);
    result.push({ member, handle });
  }

  return result;
};
