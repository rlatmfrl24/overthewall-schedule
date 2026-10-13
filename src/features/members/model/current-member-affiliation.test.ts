import { describe, expect, it } from "vitest";
import { getSiteDefinition } from "@contracts/site-definition";
import { getCurrentMemberAffiliation } from "./current-member-affiliation";

describe("current member affiliation", () => {
  it("labels current LuvDia members without changing the source or OTW history", () => {
    const member = Object.freeze({ unit_name: "러브다이아" });
    expect(getCurrentMemberAffiliation(member, getSiteDefinition("luvdia"))).toBe("개인 방송인");
    expect(getCurrentMemberAffiliation(member, getSiteDefinition("otw"))).toBe("러브다이아");
    expect(member.unit_name).toBe("러브다이아");
  });
});
