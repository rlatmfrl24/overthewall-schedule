// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
  afterEach(cleanup);

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

  it("shows main vocals first and collapses supporting credits", () => {
    render(
      <OtwPlayParticipantSummary
        participants={[
          { ...base, entityId: "chorus", slug: "chorus", displayName: "코러스 멤버", role: "chorus", kind: "external" },
          { ...base, entityId: "main", slug: "main", displayName: "메인 멤버", role: "vocal", kind: "external", creditOrder: 1 },
          { ...base, entityId: "sub", slug: "sub", displayName: "서브 멤버", role: "featured_vocal", kind: "external", creditOrder: 2 },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /메인 멤버/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /코러스 멤버/ })).toBeNull();
    expect(screen.getByLabelText(/서브 참여자 2명/).textContent).toContain("+2");
  });
});
