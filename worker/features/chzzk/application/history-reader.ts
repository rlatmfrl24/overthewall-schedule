import type { ChzzkHistoryDto } from "@contracts/chzzk";

/** Only the verified administrator HTTP entry composes this storage-only reader. */
export interface AdminChzzkHistoryReader {
  read(channelId: string | null, cursor: string | null): Promise<ChzzkHistoryDto>;
}
