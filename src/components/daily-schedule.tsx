import { useEffect, useState } from "react";

interface Member {
  uid: number;
  code: string;
  name: string;
  main_color?: string;
  oshi_mark?: string;
  url_twitter?: string;
  url_youtube?: string;
  url_chzzk?: string;
  birth_date?: string;
  debut_date?: string;
}

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    fetch("/api/members")
      .then((res) => res.json())
      .then((data) => setMembers(data as Member[]))
      .catch((err) => console.error("Failed to fetch members:", err));
  }, []);

  return (
    <div className="flex flex-col flex-1 justify-center items-center">
      <div className="flex flex-col gap-2">
        {members.length > 0 ? (
          members.map((member) => (
            <div key={member.uid} style={{ color: member.main_color }}>
              {member.name} {member.oshi_mark}
            </div>
          ))
        ) : (
          <div>Loading...</div>
        )}
      </div>
    </div>
  );
};
