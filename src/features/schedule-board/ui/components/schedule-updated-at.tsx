import { cn } from "@/shared/lib/utils";

interface ScheduleUpdatedAtProps {
  updatedAt: string | null | undefined;
  className?: string;
  label?: string;
  stacked?: boolean;
}

const kstDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatScheduleUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    kstDateTimeFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );

  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function ScheduleUpdatedAt({
  updatedAt,
  className,
  label = "최신 업데이트",
  stacked = false,
}: ScheduleUpdatedAtProps) {
  if (!updatedAt) return null;

  const formattedUpdatedAt = formatScheduleUpdatedAt(updatedAt);
  if (!formattedUpdatedAt) return null;

  return (
    <p
      className={cn(
        "max-w-full self-start whitespace-nowrap text-[11px] font-medium leading-tight tabular-nums text-muted-foreground",
        stacked && "flex flex-col items-end gap-1.5 text-right",
        className,
      )}
      aria-label={`${label} ${formattedUpdatedAt}`}
    >
      {stacked ? (
        <>
          <span className="text-[0.9em] font-bold">{label}</span>
          <time dateTime={updatedAt}>{formattedUpdatedAt}</time>
        </>
      ) : (
        <>
          {label} · <time dateTime={updatedAt}>{formattedUpdatedAt}</time>
        </>
      )}
    </p>
  );
}
