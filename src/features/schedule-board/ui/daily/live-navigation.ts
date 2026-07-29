import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import {
  buildChzzkLiveUrl,
  type ChzzkLiveStatusMap,
  convertChzzkToLiveUrl,
} from "@/features/chzzk";

export const getLiveUrlForSchedule = (
  schedule: ScheduleItem,
  members: Member[],
  liveStatuses: ChzzkLiveStatusMap,
) => {
  const liveStatus = liveStatuses[schedule.member_uid];
  if (liveStatus?.status !== "OPEN") return null;

  const member = members.find((item) => item.uid === schedule.member_uid);
  return (
    buildChzzkLiveUrl(liveStatus.channelId) ||
    convertChzzkToLiveUrl(member?.url_chzzk) ||
    null
  );
};
