import { decodeUtf8Base64Url, encodeUtf8Base64Url } from "./utf8-base64url";

export interface MemberSubmissionCursor {
  createdAt: number;
  id: string;
}

export class MemberSubmissionCursorError extends Error {
  constructor() {
    super("Invalid member submission cursor");
    this.name = "MemberSubmissionCursorError";
  }
}

export const encodeMemberSubmissionCursor = (
  cursor: MemberSubmissionCursor,
) =>
  encodeUtf8Base64Url(
    JSON.stringify({ v: 1, c: cursor.createdAt, i: cursor.id }),
  );

export const decodeMemberSubmissionCursor = (
  value: string,
): MemberSubmissionCursor => {
  if (value.length > 512) throw new MemberSubmissionCursorError();
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as Record<
      string,
      unknown
    >;
    if (
      Object.keys(parsed).sort().join(",") !== "c,i,v" ||
      parsed.v !== 1 ||
      !Number.isSafeInteger(parsed.c) ||
      Number(parsed.c) < 0 ||
      typeof parsed.i !== "string" ||
      !parsed.i.trim() ||
      parsed.i.length > 128
    ) {
      throw new MemberSubmissionCursorError();
    }
    return { createdAt: Number(parsed.c), id: parsed.i };
  } catch (error) {
    if (error instanceof MemberSubmissionCursorError) throw error;
    throw new MemberSubmissionCursorError();
  }
};
