// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";

const useScheduleDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: useScheduleDataMock,
}));

import { MultiviewPage } from "./multiview-page";

const CHANNEL_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeMember(
  uid: number,
  name: string,
  channelId: string | null,
): Member {
  return {
    uid,
    code: `member_${uid}`,
    name,
    main_color: uid === 1 ? "#31a4a9" : "#f97316",
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: channelId ? `https://chzzk.naver.com/${channelId}` : null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  };
}

describe("MultiviewPage", () => {
  beforeEach(() => {
    useScheduleDataMock.mockReturnValue({
      members: [
        makeMember(1, "멤버1", CHANNEL_A),
        makeMember(2, "멤버2", CHANNEL_B),
        makeMember(3, "채널 없음", null),
      ],
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders member chips and updates the Mul.Live iframe URL", () => {
    render(React.createElement(MultiviewPage));

    const frame = screen.getByTitle("Mul.Live multiview");
    expect(frame.getAttribute("src")).toBe("https://mul.live/");
    expect(screen.queryByRole("button", { name: "채널 없음" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "멤버1" }));
    expect(screen.getByTitle("Mul.Live multiview").getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "멤버2" }));
    expect(screen.getByTitle("Mul.Live multiview").getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByTitle("Mul.Live multiview").getAttribute("src")).toBe(
      "https://mul.live/",
    );
  });
});
