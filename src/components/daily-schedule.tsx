import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { useEffect, useState } from "react";
import { CardMember } from "./card-member";
import { ScheduleDialog } from "./schedule-dialog";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";

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
    <div className="flex flex-col flex-1 w-full overflow-y-auto bg-gray-50/50">
      <div className="container mx-auto flex flex-col py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white rounded-2xl shadow-sm border">
              <CalendarDays className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900">
                오늘의 스케쥴
              </h1>
              <p className="text-sm text-gray-500">
                {today.toLocaleDateString()}
              </p>
            </div>
          </div>
          <ScheduleDialog
            onSubmit={handleAddSchedule}
            members={members}
            initialDate={today}
          />
        </div>

        {/* Grid Section */}
        <div className="grid gap-6 w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {members.length > 0 ? (
            members.map((member) => {
              const memberSchedules = schedules.filter(
                (s) => s.member_uid === member.uid
              );

              return (
                <CardMember
                  key={member.uid}
                  member={member}
                  schedules={memberSchedules}
                />
              );
            })
          ) : (
            <div className="col-span-full flex justify-center py-12">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-48 bg-gray-200 rounded"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
