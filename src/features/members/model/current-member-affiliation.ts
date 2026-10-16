import type { SiteDefinition } from "@contracts/site-definition";
import type { MemberDto } from "@contracts/members";

// Current display only: preserve the stored affiliation and historical credits.
export const getCurrentMemberAffiliation = (member: Pick<MemberDto, "unit_name">, site: SiteDefinition) =>
  site.id === "luvdia" ? "개인 방송인" : member.unit_name;
