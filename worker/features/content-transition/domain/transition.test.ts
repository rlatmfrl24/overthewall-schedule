import { describe, expect, it } from "vitest";
import { canAdmit, canCommit, canComplete, assertActivation, assertReadiness, resolveManagedMembers } from "./transition";
import { TRANSITION_RECEIVER_CONTRACT } from "./receiver-contract";

const transition = {
  id: "move-1", sourceSite: "otw", targetSite: "luvdia", sourceResource: "source-db",
  targetResource: "target-db", generation: 2, protocol: 1, manifestDigest: "approved-manifest",
} as const;
const readiness = { ...transition, receiptId: "ready-1", expiresAt: 1000,receiverContract:TRANSITION_RECEIVER_CONTRACT };
const fence = { ...transition, boundary: 8, checkpointDigest: "exact-checkpoint", checkpoints: [], operationBoundary:1,operationCount:1,fileIntentBoundary:1,fileIntentCount:1 };
const activation = { fence, boundary: 8, checkpointDigest: "exact-checkpoint", committedFilesAvailable: true, transferredOperations:1,transferredFileIntents:1 };

describe("content transition authority", () => {
  it("requires matching durable readiness before a fence; missing readiness leaves source authority intact", () => {
    for (const value of [null, { ...readiness, generation: 1 }, { ...readiness, id: "other" }, { ...readiness, expiresAt: 1 }]) {
      expect(() => assertReadiness(transition, value, 10)).toThrow();
    }
    expect(() => assertReadiness(transition, readiness, 10)).not.toThrow();
    expect(canAdmit("source", "replaying")).toBe(true);
    expect(canCommit("source", "replaying", 1, 2)).toBe(true);
  });

  it("keeps internal transfer reception open while business commits require the final owner", () => {
    for (const phase of ["target_ingress_ready", "source_fenced", "target_owned", "complete"] as const) {
      expect(canAdmit("target", phase)).toBe(true);
    }
    expect(canCommit("target", "target_ingress_ready", 2, 2)).toBe(false);
    expect(canCommit("target", "source_fenced", 2, 2)).toBe(false);
    expect(canCommit("target", "target_owned", 2, 2)).toBe(true);
    expect(canCommit("target", "complete", 2, 2)).toBe(true);
  });

  it("activates from transfer receipts without waiting for old provider or R2 outcomes", () => {
    expect(() => assertActivation(transition, activation)).not.toThrow();
    expect(canCommit("target", "target_owned", 2, 2)).toBe(true);
    expect(canComplete(fence, [], [], true)).toBe(false);
  });

  it("rejects stale source final commits after the fence", () => {
    for (const phase of ["source_fenced", "target_owned", "complete"] as const) {
      expect(canCommit("source", phase, 1, 2)).toBe(false);
      expect(canAdmit("source", phase)).toBe(false);
    }
  });

  it("cannot activate with missing transfer, committed tail, exact checkpoint, or required files", () => {
    for (const invalid of [
      { ...activation, boundary: 7 }, { ...activation, checkpointDigest: "newest-reset" },
      { ...activation, committedFilesAvailable: false }, { ...activation, transferredOperations:0 },
      { ...activation, transferredFileIntents:0 },
    ]) expect(() => assertActivation(transition, invalid)).toThrow();
  });

  it("rejects another transition or generation after an activation crash", () => {
    expect(() => assertActivation(transition, { ...activation, fence: { ...fence, generation: 3 } })).toThrow();
    expect(() => assertActivation(transition, { ...activation, fence: { ...fence, id: "other" } })).toThrow();
    expect(canCommit("target", "target_owned", 1, 2)).toBe(false);
  });

  it("drains only the frozen finite sets and requires real terminal reconciled outcomes", () => {
    const outcome = { operationId: "old-save", outcome: "conflicted", sideEffectReconciled: true,acknowledged:true } as const;
    const file = { intentId: "old-put", outcome: "failed", sideEffectReconciled: true,acknowledged:true } as const;
    expect(canComplete(fence, [outcome], [file], true)).toBe(true);
    expect(canComplete(fence, [{ ...outcome, sideEffectReconciled: false }], [file], true)).toBe(false);
    expect(canComplete(fence, [], [file], true)).toBe(false);
    expect(canComplete(fence, [outcome], [file], false)).toBe(false);
  });

  it("resolves the three managed codes to existing numeric UIDs without inventing a roster", () => {
    const members = [{ code: "bing_hayu", uid: 12 }, { code: "u_lili", uid: 17 }, { code: "yang_mei", uid: 21 }];
    expect(resolveManagedMembers(members)).toEqual(members);
    expect(() => resolveManagedMembers(members.slice(1))).toThrow();
    expect(() => resolveManagedMembers([...members, { code: "u_lili", uid: 40 }])).toThrow();
  });
});
