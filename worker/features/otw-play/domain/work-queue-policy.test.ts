import { expect, it } from "vitest";
import { canCompleteWorkBatch } from "./work-queue-policy";

const item = (candidateStatus: string, disposition: "pending" | "deferred" | "excluded" | "duplicate" = "pending", pendingProposalId: string | null = null) => ({ candidateStatus, disposition, pendingProposalId });
it("requires human review or an explicit disposition before advancing", () => {
  expect(canCompleteWorkBatch([item("ready"), item("converted"), item("ignored"), item("blocked", "deferred"), item("needs_input", "excluded"), item("discovered", "duplicate")], false)).toBe(true);
  expect(canCompleteWorkBatch([item("needs_input")], false)).toBe(false);
  expect(canCompleteWorkBatch([item("ready", "pending", "proposal")], false)).toBe(false);
  expect(canCompleteWorkBatch([item("ready")], true)).toBe(false);
  expect(canCompleteWorkBatch([], false)).toBe(true);
});
