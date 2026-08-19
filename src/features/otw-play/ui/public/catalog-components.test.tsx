// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: unknown }) => (
    <a href="/play/songs" data-search={JSON.stringify(search)}>{children}</a>
  ),
}));

import {
  OtwPlayParticipantChip,
  OtwPlayParticipantCreditGroups,
  OtwPlayParticipantSummary,
} from "./catalog-components";

const base = {
  entityId: "entity-1",
  slug: "external-singer",
  displayName: "Singer",
  role: "vocal" as const,
  creditOrder: 0,
};

describe("OtwPlayParticipantChip", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    [
      { ...base, kind: "current_member", uid: 7, code: "singer", oshiMark: "🎵", unitName: null },
      { member: "7" },
    ],
    [
      { ...base, kind: "external" },
      { participant: "external-singer" },
    ],
    [
      { ...base, kind: "group", groupKey: "g1_opaque" },
      { group: "g1_opaque" },
    ],
  ])("uses the server-provided exact filter for %o", (participant, expectedSearch) => {
    render(<OtwPlayParticipantChip participant={participant as OtwPlayPublicParticipantDto} />);
    expect(screen.getByRole("link").getAttribute("data-search")).toBe(
      JSON.stringify(expectedSearch),
    );
  });

  it("keeps supporting credits out of compact summaries", () => {
    const participants = [
      { ...base, entityId: "chorus", slug: "chorus", displayName: "코러스 멤버", role: "chorus" as const, kind: "external" as const },
      { ...base, entityId: "main", slug: "main", displayName: "메인 멤버", role: "vocal" as const, kind: "external" as const, creditOrder: 1 },
      { ...base, entityId: "sub", slug: "sub", displayName: "피처링 멤버", role: "featured_vocal" as const, kind: "external" as const, creditOrder: 2 },
    ];
    render(
      <OtwPlayParticipantSummary
        participants={participants}
      />,
    );

    expect(screen.getByRole("link", { name: /메인 멤버/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /코러스 멤버/ })).toBeNull();
    expect(screen.queryByText("코러스")).toBeNull();
  });

  it("shows every credit under an explicit role on song detail", () => {
    render(
      <OtwPlayParticipantCreditGroups
        participants={[
          { ...base, entityId: "chorus", slug: "chorus", displayName: "코러스 멤버", role: "chorus", kind: "external" },
          { ...base, entityId: "main", slug: "main", displayName: "메인 멤버", role: "vocal", kind: "external", creditOrder: 1 },
          { ...base, entityId: "featured", slug: "featured", displayName: "피처링 멤버", role: "featured_vocal", kind: "external", creditOrder: 2 },
        ]}
      />,
    );

    expect(within(screen.getByRole("group", { name: "메인 보컬" })).getByRole("link", { name: /메인 멤버/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "피처링 보컬" })).getByRole("link", { name: /피처링 멤버/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "코러스" })).getByRole("link", { name: /코러스 멤버/ })).toBeTruthy();
  });
});
