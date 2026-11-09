import type { XPostDto } from "@contracts/x-posts";

export type XPostViewModel = XPostDto & {
  replyTargetMemberName?: string;
};
