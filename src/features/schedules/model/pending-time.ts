export const roundTimeToNearestScheduleHalfHour = (
  time: string | null,
) => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return time;
  }

  const roundedMinutes = Math.min(
    Math.round((hour * 60 + minute) / 30) * 30,
    23 * 60 + 30,
  );
  return `${Math.floor(roundedMinutes / 60)
    .toString()
    .padStart(2, "0")}:${(roundedMinutes % 60)
    .toString()
    .padStart(2, "0")}`;
};

export const roundTimeToNearestScheduleHour = (time: string | null) => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return time;
  }

  const roundedHour = hour + (minute >= 30 ? 1 : 0);
  const scheduleHour = Math.min(roundedHour, 23);
  return `${scheduleHour.toString().padStart(2, "0")}:00`;
};
