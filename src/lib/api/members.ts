import { apiFetch } from "./client";
import type { Member } from "../types";

const isActiveMember = (member: Member) => {
  const deprecated = member.is_deprecated;
  return deprecated !== true && deprecated !== 1 && deprecated !== "1";
};

async function fetchMembers() {
  return apiFetch<Member[]>("/api/members");
}

export async function fetchActiveMembers() {
  const list = await fetchMembers();
  return list.filter(isActiveMember);
}
