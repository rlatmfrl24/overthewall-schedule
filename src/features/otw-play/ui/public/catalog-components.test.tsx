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

import { OtwPlayParticipantChip } from "./catalog-components";

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
});
