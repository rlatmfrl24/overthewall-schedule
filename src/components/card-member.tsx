import type { Member } from "@/lib/types";

export const CardMember = ({ member }: { member: Member }) => {
  return (
    <div
      className={`flex flex-col gap-2 font-bold p-4 w-40 justify-center items-center rounded-lg`}
      style={{
        backgroundColor: member.main_color,
      }}
    >
      <img
        src={`/profile/${member.code}.webp`}
        alt={member.name}
        className="rounded-full"
      />
      <h1>{member.name}</h1>
    </div>
  );
};
