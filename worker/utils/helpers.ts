import { eq } from "drizzle-orm";
import { type DbInstance } from "../db";
import { members, settings, updateLogs } from "../../src/db/schema";
import type { UpdateLogPayload } from "../types";

export const json = (
  data: unknown,
  status = 200,
  options: { headers?: HeadersInit } = {},
) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
};

export const badRequest = (message: string) => {
  return new Response(message, { status: 400 });
};

export const methodNotAllowed = () => {
  return new Response("Method Not Allowed", { status: 405 });
};

export const parseNumericId = (value?: string | number | null) => {
  if (!value) return null;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? null : parsed;
};

export const getClientIp = (request: Request): string | null => {
  const headers = request.headers;
  return (
    headers.get("CF-Connecting-IP") ||
    headers.get("X-Forwarded-For") ||
    headers.get("X-Real-IP")
  );
};

export const getActorInfo = (request: Request) => {
  const headers = request.headers;
  const actorId = headers.get("X-Actor-ID");
  const actorName = headers.get("X-Actor-Name");
  const actorIp = getClientIp(request);
  return { actorId, actorName, actorIp };
};

export const resolveMemberName = async (
  db: DbInstance,
  memberUid?: number | null,
) => {
  if (!memberUid) return null;
  const data = await db
    .select({ name: members.name })
    .from(members)
    .where(eq(members.uid, memberUid))
    .limit(1);
  return data[0]?.name ?? null;
};

export const insertUpdateLog = async (
  db: DbInstance,
  payload: UpdateLogPayload,
) => {
  const resolvedName =
    payload.memberName ?? (await resolveMemberName(db, payload.memberUid));
  const resolvedActorName =
    payload.actorName ?? (payload.action.startsWith("auto_") ? "system" : null);
  await db.insert(updateLogs).values({
    schedule_id: payload.scheduleId ?? null,
    member_uid: payload.memberUid ?? null,
    member_name: resolvedName ?? null,
    actor_id: payload.actorId ?? null,
    actor_name: resolvedActorName,
    actor_ip: payload.actorIp ?? null,
    schedule_date: payload.scheduleDate,
    action: payload.action,
    title: payload.title ?? null,
    previous_status: payload.previousStatus ?? null,
  });
};

// ISO 8601 duration (PT1H2M3S) 을 초 단위로 변환
export const parseISO8601Duration = (duration: string): number => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1].slice(0, -1)) : 0;
  const minutes = match[2] ? parseInt(match[2].slice(0, -1)) : 0;
  const seconds = match[3] ? parseInt(match[3].slice(0, -1)) : 0;
  return hours * 3600 + minutes * 60 + seconds;
};

const NOTICE_TYPES = ["notice", "event"] as const;
type NoticeType = (typeof NOTICE_TYPES)[number];

export const normalizeNoticeType = (value?: string): NoticeType => {
  if (value && NOTICE_TYPES.includes(value as NoticeType)) {
    return value as NoticeType;
  }
  return "notice";
};

export const normalizeIsActive = (
  value?: string | number | boolean,
): boolean => {
  if (value === "0" || value === 0 || value === false || value === "false") {
    return false;
  }
  return true;
};

const DDAY_TYPES = ["debut", "birthday", "event"] as const;
type DDayType = (typeof DDAY_TYPES)[number];

export const normalizeDDayType = (value?: string): DDayType => {
  if (value && DDAY_TYPES.includes(value as DDayType)) {
    return value as DDayType;
  }
  return "event";
};

// 치지직 URL에서 채널 ID 추출
export const extractChzzkChannelId = (
  urlChzzk?: string | null,
): string | null => {
  if (!urlChzzk) return null;
  // https://chzzk.naver.com/CHANNEL_ID 형식
  const match = urlChzzk.match(/chzzk\.naver\.com\/([a-f0-9]+)/i);
  return match ? match[1] : null;
};

// KST 기준 오늘 날짜 반환 (YYYY-MM-DD)
export const getKSTDateString = (date: Date = new Date()): string => {
  const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
  const kstDate = new Date(date.getTime() + kstOffset);
  return kstDate.toISOString().split("T")[0];
};

// ISO 날짜 문자열에서 HH:mm 추출 (KST 기준)
export const extractKSTTime = (isoString: string): string => {
  const date = new Date(isoString);
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(date.getTime() + kstOffset);
  const hours = kstDate.getUTCHours().toString().padStart(2, "0");
  const minutes = kstDate.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

// 설정 값 조회 헬퍼
export const getSetting = async (
  db: DbInstance,
  key: string,
): Promise<string | null> => {
  const result = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return result[0]?.value ?? null;
};

// 설정 값 업데이트 헬퍼
export const updateSetting = async (
  db: DbInstance,
  key: string,
  value: string,
): Promise<void> => {
  await db
    .insert(settings)
    .values({ key, value, updated_at: Date.now().toString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updated_at: Date.now().toString() },
    });
};

// Helper for promise concurrency
export async function pMap<T, R>(
  array: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(array.length);
  const iterator = array.entries();
  const worker = async () => {
    for (const [i, item] of iterator) {
      results[i] = await mapper(item);
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, array.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}
