import type { DDayDto, DDayPayload, DDayType } from "@contracts/ddays";

export type DDayItem = DDayDto & {
  colors?: string[] | null;
};

export type { DDayPayload, DDayType };
