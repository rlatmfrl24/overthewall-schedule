import type { MemberDto, MemberProfileDto } from "../../../../../contracts/members";

export interface MemberReader {
  listActive(): Promise<MemberDto[]>;
  findProfileByCode(code: string): Promise<MemberProfileDto | null>;
}
