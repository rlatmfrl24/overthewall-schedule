import type {
  MemberDto,
  MemberProfileBackgroundImageDto,
  MemberProfileDto,
  MemberProfileImageDto,
  MemberProfileLinkDto,
  MemberProfileLinkType,
} from "@contracts/members";

export type Member = MemberDto;
export type MemberProfile = MemberProfileDto;
export type MemberProfileImage = MemberProfileImageDto;
export type MemberProfileBackgroundImage = MemberProfileBackgroundImageDto;
export type MemberProfileLink = MemberProfileLinkDto;
export type { MemberProfileLinkType };

export const isActiveMember = (member: Member) => {
  const deprecated = member.is_deprecated;
  return deprecated !== true && deprecated !== 1 && deprecated !== "1";
};
