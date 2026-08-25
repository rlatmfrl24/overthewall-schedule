import { decodeUtf8Base64Url, encodeUtf8Base64Url } from "./utf8-base64url";

export interface ChannelMonitorCandidateCursor {
  discoveredAt: number;
  candidateId: string;
}

export class ChannelMonitorCursorError extends Error {
  constructor() {
    super("Invalid channel monitor candidate cursor");
    this.name = "ChannelMonitorCursorError";
  }
}

export const encodeChannelMonitorCandidateCursor = (
  cursor: ChannelMonitorCandidateCursor,
) => encodeUtf8Base64Url(JSON.stringify({
  v: 1,
  d: cursor.discoveredAt,
  i: cursor.candidateId,
}));

export const decodeChannelMonitorCandidateCursor = (
  value: string,
): ChannelMonitorCandidateCursor => {
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as Record<string, unknown>;
    if (
      parsed.v !== 1 ||
      !Number.isSafeInteger(parsed.d) ||
      Number(parsed.d) < 0 ||
      typeof parsed.i !== "string" ||
      !parsed.i ||
      parsed.i.length > 128
    ) {
      throw new ChannelMonitorCursorError();
    }
    return {
      discoveredAt: Number(parsed.d),
      candidateId: parsed.i,
    };
  } catch (error) {
    if (error instanceof ChannelMonitorCursorError) throw error;
    throw new ChannelMonitorCursorError();
  }
};
