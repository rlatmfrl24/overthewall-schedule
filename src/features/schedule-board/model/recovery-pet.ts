import type { SiteId } from "@contracts/site-definition";
import { SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LAST_ACTIVITY_DAY = Date.parse(SCHEDULE_MEMBER_END.lastDate) / DAY_MS;

export function getRecoveryPetDays(siteId: SiteId, nowMs: number): number | null {
  if (siteId !== SCHEDULE_MEMBER_END.siteId) return null;
  const days = Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) - LAST_ACTIVITY_DAY;
  return days > 0 ? days : null;
}

export const msUntilNextRecoveryPetDay = (nowMs: number) =>
  DAY_MS - ((nowMs + KST_OFFSET_MS) % DAY_MS);

// Five complete 3-second loops before changing scenes.
export const RECOVERY_PET_SCENE_MS = 15_000;
export const RECOVERY_PET_SCENES = [
  { id: "solo-tea", title: "티타임", bounds: [208, 101, 1064, 1154] },
  { id: "solo-snack", title: "간식", bounds: [200, 76, 1078, 1175] },
  { id: "solo-nap", title: "낮잠", bounds: [196, 68, 1072, 1187] },
  { id: "duo-plant", title: "빙식쿤과 작은 화분 돌보기", bounds: [45, 40, 1208, 1187] },
  { id: "duo-read", title: "빙식쿤과 함께 독서", bounds: [67, 41, 1168, 1188] },
  { id: "duo-nap", title: "빙식쿤과 나란히 낮잠", bounds: [40, 29, 1202, 1205] },
] as const;
