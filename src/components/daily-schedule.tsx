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
    <div className="flex flex-col flex-1 justify-center items-center container relative">
      <h1 className="text-3xl font-bold mb-4">
        {today.toLocaleDateString()} 스케쥴
      </h1>
      <div
        className="grid gap-4 w-full"
        style={{
          gridTemplateColumns: `repeat(${
            members.length > 0 ? members.length : 1
          }, 1fr)`,
        }}
      >
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

      <ScheduleDialog
        onSubmit={handleAddSchedule}
        members={members}
        initialDate={today}
      />
    </div>
  );
};
