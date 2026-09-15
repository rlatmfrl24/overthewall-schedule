import type { MemberDto } from "@contracts/members";

/** Fresh member data; tests keep the fields relevant to their scenario explicit. */
export const createMemberFixture = (
  overrides: Partial<MemberDto> = {},
): MemberDto => ({
  uid: 1,
  code: "member",
  name: "멤버",
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
  ...overrides,
});
