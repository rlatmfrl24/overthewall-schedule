import type { Member } from "@/lib/types";
import { useEffect, useState } from "react";
import { CardMember } from "./card-member";

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);

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
    <div className="flex flex-col flex-1 justify-center items-center">
      <h1 className="text-3xl font-bold">
        {new Date().toLocaleDateString()} 스케쥴
      </h1>
      <div className="flex gap-2">
        {members.length > 0 ? (
          members.map((member) => (
            <CardMember key={member.uid} member={member} />
          ))
        ) : (
          <div>Loading...</div>
        )}
      </div>
    </div>
  );
};
