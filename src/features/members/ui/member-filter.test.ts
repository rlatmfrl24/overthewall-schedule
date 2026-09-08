// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import { MemberFilter } from "./member-filter";

const members: MemberDto[] = [
  {
    uid: 1,
    code: "m1",
    name: "멤버1",
    main_color: "#336699",
    sub_color: "#99bbdd",
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: "UC1",
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  },
  {
    uid: 2,
    code: "m2",
    name: "멤버2",
    main_color: "#993366",
    sub_color: "#dd99bb",
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: "UC2",
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  },
];

const StatefulMemberFilter = () => {
  const [selectedUids, setSelectedUids] = useState<number[] | null>(null);

  return React.createElement(
    "div",
    null,
    React.createElement(
      "output",
      { "data-testid": "selected" },
      selectedUids?.join(",") || "all",
    ),
    React.createElement(MemberFilter, {
      members,
      selectedUids,
      onChange: setSelectedUids,
    }),
  );
};

describe("MemberFilter", () => {
  afterEach(() => {
    cleanup();
  });

  it("멤버 필터를 단일 선택으로 전환하고 같은 멤버 재클릭 시 전체로 돌아간다", () => {
    render(React.createElement(StatefulMemberFilter));

    fireEvent.click(screen.getByRole("button", { name: "멤버1" }));
    expect(screen.getByTestId("selected").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "멤버2" }));
    expect(screen.getByTestId("selected").textContent).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "멤버2" }));
    expect(screen.getByTestId("selected").textContent).toBe("all");
  });
  it("게시글 필터는 재선택을 유지하고 선택 상태를 보조기기에 전달한다", () => {
    const onChange = vi.fn();
    render(React.createElement(MemberFilter, { members, selectedUids: [1], onChange, deselectOnRepeat: false, layout: "vertical" }));
    const selected = screen.getByRole("button", { name: "멤버1" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(selected);
    expect(onChange).toHaveBeenLastCalledWith([1]);
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

});
