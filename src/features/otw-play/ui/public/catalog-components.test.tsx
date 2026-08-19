// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it("shows main vocals first and exposes supporting credits by role", async () => {
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
    expect(screen.queryByText("+2")).toBeNull();
    const featured = screen.getByRole("button", {
      name: "서브 보컬: 서브 멤버",
    });
    const chorus = screen.getByRole("button", {
      name: "코러스: 코러스 멤버",
    });
    expect(featured.textContent).toBe("서브 보컬");
    expect(chorus.textContent).toBe("코러스");

    fireEvent.focus(chorus);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "코러스 · 코러스 멤버",
    );
  });
});
