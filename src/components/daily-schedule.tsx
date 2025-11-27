import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { useEffect, useState } from "react";
import { CardMember } from "./card-member";
import { CardSchedule } from "./card-schedule";
import { ScheduleDialog } from "./schedule-dialog";
import { format } from "date-fns";

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const today = new Date();

  const fetchSchedules = () => {
    fetch(`/api/schedules?date=${format(today, "yyyy-MM-dd")}`)
      .then((res) => res.json())
      .then((data) => setSchedules(data as ScheduleItem[]))
      .catch((err) => console.error("Failed to fetch schedules:", err));
  };

  useEffect(() => {
    fetch("/api/members")
      .then((res) => res.json())
      .then((data) =>
        setMembers(
          (data as Member[]).filter(
            (member) => member.is_deprecated === "false"
          )
        )
      )
      .catch((err) => console.error("Failed to fetch members:", err));

    fetchSchedules();
  }, []);

  const handleAddSchedule = async (data: {
    member_uid: number;
    date: Date;
    start_time: string | null;
    title: string;
    status: ScheduleStatus;
  }) => {
    try {
      if (data.status === "휴방" || data.status === "미정") {
        const dateStr = format(data.date, "yyyy-MM-dd");
        const res = await fetch(`/api/schedules?date=${dateStr}`);
        if (res.ok) {
          const existingSchedules = (await res.json()) as ScheduleItem[];
          const memberSchedules = existingSchedules.filter(
            (s) => s.member_uid === data.member_uid
          );

          await Promise.all(
            memberSchedules.map((s) =>
              fetch(`/api/schedules?id=${s.id}`, { method: "DELETE" })
            )
          );
        }

        if (data.status === "미정") {
          fetchSchedules();
          return;
        }
      } else if (data.status === "방송") {
        const dateStr = format(data.date, "yyyy-MM-dd");
        const res = await fetch(`/api/schedules?date=${dateStr}`);
        if (res.ok) {
          const existingSchedules = (await res.json()) as ScheduleItem[];
          const memberOffSchedules = existingSchedules.filter(
            (s) => s.member_uid === data.member_uid && s.status === "휴방"
          );

          await Promise.all(
            memberOffSchedules.map((s) =>
              fetch(`/api/schedules?id=${s.id}`, { method: "DELETE" })
            )
          );
        }
      }

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          date: format(data.date, "yyyy-MM-dd"),
        }),
      });
      if (res.ok) {
        fetchSchedules();
      } else {
        alert("스케쥴 추가 실패");
      }
    } catch (e) {
      console.error(e);
      alert("오류 발생");
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto px-4">
      <div className="container mx-auto flex flex-col items-center py-8 relative">
        <div className="flex w-full mb-4">
          <h1 className="text-3xl flex-1 text-center font-bold ml-12">
            {today.toLocaleDateString()} 스케쥴
          </h1>
          <ScheduleDialog
            onSubmit={handleAddSchedule}
            members={members}
            initialDate={today}
          />
        </div>
        <div className="grid gap-4 w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
          {members.length > 0 ? (
            members.map((member) => {
              const memberSchedules = schedules.filter(
                (s) => s.member_uid === member.uid
              );

              return (
                <div key={member.uid} className="flex flex-col gap-2">
                  <CardMember member={member} />

                  {memberSchedules.length > 0 ? (
                    memberSchedules.map((schedule) => (
                      <CardSchedule
                        key={schedule.id}
                        schedule={schedule}
                        member={member}
                      />
                    ))
                  ) : (
                    <div className="p-2 text-center text-gray-500 border rounded-lg">
                      미정
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div>Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
};
