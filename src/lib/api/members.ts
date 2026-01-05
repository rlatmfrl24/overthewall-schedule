import { apiFetch } from "./client";
import { isActiveMember } from "../constants";
import type { Member } from "../types";

export async function fetchMembers() {
  return apiFetch<Member[]>("/api/members");
}

export async function fetchActiveMembers() {
  const list = await fetchMembers();
  return list.filter(isActiveMember);
}
