import type { Member } from "@/lib/types";
import { useEffect, useState } from "react";
import { CardMember } from "./card-member";
import { CardSchedule } from "./card-schedule";
import { makeRandomSchedule } from "@/lib/utils";

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const schedules = makeRandomSchedule(members);

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
  }, []);

  return (
    <div className="flex flex-col flex-1 justify-center items-center container">
      <h1 className="text-3xl font-bold mb-4">
        {new Date().toLocaleDateString()} 스케쥴
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
          members.map((member) => (
            <CardMember key={member.uid} member={member} />
          ))
        ) : (
          <div>Loading...</div>
        )}
        {schedules.map((schedule) => (
          <CardSchedule key={schedule.uid} schedule={schedule} />
        ))}
      </div>
    </div>
  );
};
