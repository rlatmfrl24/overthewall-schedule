import { apiRoutes } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import { isActiveMember, type Member, type MemberProfile } from "../model/member";

async function fetchMembers() {
  return apiFetch<Member[]>(apiRoutes.members.collection.build());
}

export async function fetchActiveMembers() {
  const list = await fetchMembers();
  return list.filter(isActiveMember);
}

export async function fetchMemberProfile(code: string, includeArchived = false) {
  return apiFetch<MemberProfile>(`${apiRoutes.members.profile.build(code)}${includeArchived ? "?archive=1" : ""}`, { cache: "no-store" });
}

export async function fetchAdminMembers() {
  return apiFetch<Member[]>(`${apiRoutes.members.collection.build()}?archive=1`, { cache: "no-store" });
}
