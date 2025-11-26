import type { Member, ScheduleItem } from "@/lib/types";
import { useEffect, useState } from "react";
import { CardMember } from "./card-member";
import { CardSchedule } from "./card-schedule";

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const today = new Date().toISOString().split("T")[0];

  const fetchSchedules = () => {
    fetch(`/api/schedules?date=${today}`)
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

  const handleAddSchedule = async (memberUid: number) => {
    const title = prompt("스케쥴 내용을 입력하세요");
    if (!title) return;
    const startTime = prompt("시작 시간을 입력하세요 (예: 20:00)");

    // Simple status selection for testing
    const status = confirm("휴방인가요?") ? "휴방" : "방송";

    const newSchedule = {
      member_uid: memberUid,
      date: today,
      start_time: status === "휴방" ? null : startTime,
      title: title,
      status: status,
    };

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSchedule),
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
    <div className="flex flex-col flex-1 justify-center items-center container">
      <h1 className="text-3xl font-bold mb-4">{today} 스케쥴</h1>
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
            const isDayOff = memberSchedules.some((s) => s.status === "휴방");

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

                {!isDayOff && (
                  <button
                    onClick={() => handleAddSchedule(member.uid)}
                    className="p-2 mt-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    추가
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div>Loading...</div>
        )}
      </div>
    </div>
  );
};
