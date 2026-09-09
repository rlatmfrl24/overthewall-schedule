import type { OtwPlayPublicSongSummaryDto } from "./otw-play";

export interface OtwPlayMemberSummary {
  uid: number;
  code: string;
  name: string;
  oshiMark: string | null;
  unitName: string | null;
  imageUrl: string;
  songCount: number;
  performanceCount: number;
}

export interface OtwPlayPublicMemberDto extends OtwPlayMemberSummary {
  pageEligible: boolean;
}

export interface OtwPlayMemberSongbookDto {
  member: OtwPlayPublicMemberDto;
  items: OtwPlayPublicSongSummaryDto[];
}

export interface OtwPlayMemberSongbookQuery {
  q?: string;
  category?: "all" | "original" | "cover" | "collaboration";
  participantRole?: "vocal" | "featured_vocal" | "chorus";
  sort?: "recent" | "title";
  limit?: number;
  cursor?: string;
}

export const isOtwPlayMemberPageEligible = (
  member: Pick<OtwPlayMemberSummary, "songCount">,
  state: { publicReadEnabled: boolean; navigationVisible: boolean; revision: number; readModelRevision: number | null },
): boolean => state.publicReadEnabled && state.navigationVisible &&
  state.revision === state.readModelRevision && member.songCount >= 3;
