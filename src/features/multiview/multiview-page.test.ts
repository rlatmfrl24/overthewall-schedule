// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";
import type { MultiviewSource } from "./types";

const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useMultiviewSourcesMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("./use-multiview-sources", () => ({
  useMultiviewSources: useMultiviewSourcesMock,
}));

import { MultiviewPage } from "./multiview-page";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";
const CHANNEL_B = "19a1ed5c0829fa620fab900dba7e011c";

const makeMember = (uid: number, name: string, channelId: string): Member =>
  ({
    uid,
    code: `m${uid}`,
    name,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: `https://chzzk.naver.com/${channelId}`,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const memberA = makeMember(1, "라이브 멤버", CHANNEL_A);
const memberB = makeMember(2, "오프라인 멤버", CHANNEL_B);

const liveSource: MultiviewSource = {
  channelId: CHANNEL_A,
  member: memberA,
  isLive: true,
  liveStatus: {
    status: "OPEN",
    liveTitle: "테스트 라이브",
    channelName: "라이브 멤버",
    channelId: CHANNEL_A,
    concurrentUserCount: 1234,
  } as MultiviewSource["liveStatus"],
};

const offlineSource: MultiviewSource = {
  channelId: CHANNEL_B,
  member: memberB,
  isLive: false,
  liveStatus: null,
};

const getMulLiveFrame = () =>
  screen.getByTestId("multiview-mullive-frame") as HTMLIFrameElement;

describe("MultiviewPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/multiview");
    useScheduleDataMock.mockReturnValue({
      members: [memberA, memberB],
    });
    useMultiviewSourcesMock.mockReturnValue({
      sources: [liveSource, offlineSource],
      loading: false,
      hasLoaded: true,
      reload: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders member chips above a full-height Mul.Live iframe", () => {
    render(React.createElement(MultiviewPage));

    expect(screen.getByTestId("multiview-root").className).toContain(
      "overflow-hidden",
    );
    expect(screen.getByRole("button", { name: "라이브 멤버 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "오프라인 멤버 선택" })).toBeTruthy();
    expect(getMulLiveFrame().getAttribute("src")).toBe("https://mul.live/");
  });

  it("updates the Mul.Live iframe and URL when member chips are toggled", () => {
    render(React.createElement(MultiviewPage));

    fireEvent.click(screen.getByRole("button", { name: "라이브 멤버 선택" }));
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}`,
    );
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([
      CHANNEL_A,
    ]);

    fireEvent.click(screen.getByRole("button", { name: "오프라인 멤버 선택" }));
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "라이브 멤버 선택 해제" }));
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_B}`,
    );
  });

  it("restores selected channels from URL state", () => {
    window.history.replaceState(
      null,
      "",
      `/multiview?c=${CHANNEL_A}&c=${CHANNEL_B}`,
    );

    render(React.createElement(MultiviewPage));

    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
    expect(
      screen.getByRole("button", { name: "라이브 멤버 선택 해제" }),
    ).toBeTruthy();
  });
});
