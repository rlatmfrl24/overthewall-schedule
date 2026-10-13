import type { PlayWorkItem } from "@contracts/otw-play-work-queue";

export function canCompleteWorkBatch(items: (Pick<PlayWorkItem, "disposition" | "candidateStatus" | "pendingProposalId"> & Partial<Pick<PlayWorkItem,"outcome">>)[], aiPending: boolean): boolean {
  return !aiPending && items.every(item => item.outcome ? item.outcome !== "pending" : item.disposition !== "pending"
    || (["ready", "converted", "ignored"].includes(item.candidateStatus) && !item.pendingProposalId));
}
