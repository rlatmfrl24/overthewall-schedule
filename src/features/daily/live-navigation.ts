import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import { buildChzzkLiveUrl, convertChzzkToLiveUrl } from "@/lib/utils";

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
