import type { MemberReader } from "./ports/member-reader";

export const listActiveMembers = (reader: MemberReader) =>
  reader.listActive();

export const readMemberProfile = (reader: MemberReader, code: string) =>
  reader.findProfileByCode(code);
