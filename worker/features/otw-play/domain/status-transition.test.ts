import { describe, expect, it } from "vitest";
import {
  OTW_PLAY_PROPOSAL_STATUSES,
  OTW_PLAY_PUBLICATION_STATUSES,
  OTW_PLAY_QUALITY_STATUSES,
  OTW_PLAY_SOURCE_AVAILABILITY_STATUSES,
  type OtwPlayProposalStatus,
  type OtwPlayPublicationStatus,
  type OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";
import {
  canTransitionProposalStatus,
  canTransitionPublicationStatus,
  isOtwPlayProposalStatus,
  isOtwPlayPublicationStatus,
  isOtwPlayQualityStatus,
  isOtwPlaySourceAvailabilityStatus,
} from "./status-transition";

describe("OTW Play status policy", () => {
  it("recognizes every value on each independent status axis", () => {
    expect(OTW_PLAY_PROPOSAL_STATUSES.every(isOtwPlayProposalStatus)).toBe(true);
    expect(
      OTW_PLAY_PUBLICATION_STATUSES.every(isOtwPlayPublicationStatus),
    ).toBe(true);
    expect(OTW_PLAY_QUALITY_STATUSES.every(isOtwPlayQualityStatus)).toBe(true);
    expect(
      OTW_PLAY_SOURCE_AVAILABILITY_STATUSES.every(
        isOtwPlaySourceAvailabilityStatus,
      ),
    ).toBe(true);
  });

  it("does not accept values from another status axis", () => {
    expect(isOtwPlayProposalStatus("published")).toBe(false);
    expect(isOtwPlayProposalStatus("needs_update")).toBe(false);
    expect(isOtwPlayProposalStatus("playable")).toBe(false);
    expect(isOtwPlayPublicationStatus("pending_review")).toBe(false);
    expect(isOtwPlayPublicationStatus("approved")).toBe(false);
    expect(isOtwPlayQualityStatus("unavailable")).toBe(false);
    expect(isOtwPlaySourceAvailabilityStatus("draft")).toBe(false);
  });

  it("allows pending proposals to be approved or rejected", () => {
    expect(canTransitionProposalStatus("pending_review", "approved")).toBe(
      true,
    );
    expect(canTransitionProposalStatus("pending_review", "rejected")).toBe(
      true,
    );
  });

  it("does not implement the unresolved proposal withdrawal transition", () => {
    expect(canTransitionProposalStatus("pending_review", "withdrawn")).toBe(
      false,
    );
  });

  it.each<OtwPlayProposalStatus>(["approved", "rejected", "withdrawn"])(
    "rejects every transition from terminal proposal state %s",
    (from) => {
      expect(
        OTW_PLAY_PROPOSAL_STATUSES.every(
          (to) => !canTransitionProposalStatus(from, to),
        ),
      ).toBe(true);
    },
  );

  it("allows only draft to published to withdrawn publication flow", () => {
    expect(canTransitionPublicationStatus("draft", "published")).toBe(true);
    expect(canTransitionPublicationStatus("published", "withdrawn")).toBe(
      true,
    );

    const rejectedTransitions: Array<[
      OtwPlayPublicationStatus,
      OtwPlayPublicationStatus,
    ]> = [
      ["draft", "draft"],
      ["draft", "withdrawn"],
      ["published", "draft"],
      ["published", "published"],
      ["withdrawn", "draft"],
      ["withdrawn", "published"],
      ["withdrawn", "withdrawn"],
    ];
    expect(
      rejectedTransitions.every(
        ([from, to]) => !canTransitionPublicationStatus(from, to),
      ),
    ).toBe(true);
  });

  it("allows a published performance and unavailable source to coexist", () => {
    const performancePublication: OtwPlayPublicationStatus = "published";
    const sourceAvailability: OtwPlaySourceAvailabilityStatus = "unavailable";

    expect(isOtwPlayPublicationStatus(performancePublication)).toBe(true);
    expect(isOtwPlaySourceAvailabilityStatus(sourceAvailability)).toBe(true);
    expect(isOtwPlayPublicationStatus(sourceAvailability)).toBe(false);
  });
});
