export interface MemberDto {
  uid: number;
  code: string;
  name: string;
  main_color: string | null;
  sub_color: string | null;
  oshi_mark: string | null;
  url_twitter: string | null;
  url_youtube: string | null;
  url_chzzk: string | null;
  youtube_channel_id: string | null;
  birth_date: string | null;
  debut_date: string | null;
  unit_name: string | null;
  fan_name: string | null;
  introduction: string | null;
  is_deprecated?: boolean | string | number | null;
}

export type MemberProfileLinkType =
  | "x"
  | "naver_cafe"
  | "youtube"
  | "chzzk"
  | "youtube_vod"
  | "youtube_sub"
  | "twitcasting";

export interface MemberProfileImageDto {
  id: number | null;
  memberUid: number;
  imageUrl: string;
  alt: string | null;
  sortOrder: number;
}

export interface MemberProfileBackgroundImageDto {
  id: string;
  sortOrder: number;
  version: string;
}

export interface MemberProfileLinkDto {
  id?: number | null;
  type: MemberProfileLinkType;
  label: string;
  url: string;
  sortOrder: number;
  youtubeChannelId?: string | null;
  sourceId?: number | null;
}

export interface MemberProfileDto extends MemberDto {
  profileImages: MemberProfileImageDto[];
  backgroundImages: MemberProfileBackgroundImageDto[];
  links: MemberProfileLinkDto[];
}
