// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/features/members";
import { MAX_MULTIVIEW_CHANNELS } from "../model/multiview-utils";
import type { MultiviewSource } from "../model/types";

const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useMultiviewSourcesMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/schedule-board", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("../queries/use-multiview-sources", () => ({
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
      loading: false,
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

  it("renders a compact header toggle above a full-height Mul.Live iframe", () => {
    render(React.createElement(MultiviewPage));

    expect(screen.getByTestId("multiview-root").className).toContain(
      "overflow-hidden",
    );
    const header = screen
      .getByRole("heading", { name: "오버더월 멀티뷰" })
      .closest("section");
    expect(header?.className).toContain("h-16");
    expect(header?.firstElementChild?.className).toContain("h-full");
    expect(
      screen.getAllByRole("button", { name: "멀티뷰 멤버 목록 닫기" })[0],
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "라이브 멤버 선택" })[0],
    ).toBeTruthy();
    expect(getMulLiveFrame().getAttribute("src")).toBe("https://mul.live/");
  });

  it("opens the member overlay on entry and updates the Mul.Live iframe and URL", async () => {
    render(React.createElement(MultiviewPage));
    const initialFrame = getMulLiveFrame();

    expect(screen.getByLabelText("멀티뷰 멤버 목록")).toBeTruthy();
    expect(screen.getByText("라이브 리스트")).toBeTruthy();
    expect(screen.getByText("멤버 목록")).toBeTruthy();
    expect(screen.getByText("테스트 라이브")).toBeTruthy();
    expect(screen.getByText("1,234명 시청 중")).toBeTruthy();
    expect(screen.queryByText("현재 방송 없음")).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: "라이브 멤버 선택" })[0],
    );
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}`,
    );
    expect(getMulLiveFrame()).toBe(initialFrame);
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([
        CHANNEL_A,
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: "오프라인 멤버 선택" }));
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
    expect(getMulLiveFrame()).toBe(initialFrame);

    fireEvent.click(
      screen.getAllByRole("button", { name: "멀티뷰 멤버 목록 닫기" })[0],
    );
    expect(screen.queryByLabelText("멀티뷰 멤버 목록")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "멀티뷰 멤버 목록 열기" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(getMulLiveFrame().getAttribute("src")).toBe("https://mul.live/");
    expect(getMulLiveFrame()).toBe(initialFrame);
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).getAll("c")).toEqual(
        [],
      );
    });
  });

  it("라이브 상태 갱신과 멤버 패널 조작으로 Mul.Live iframe을 재마운트하지 않는다", () => {
    const view = render(React.createElement(MultiviewPage));
    const initialFrame = getMulLiveFrame();

    useMultiviewSourcesMock.mockReturnValue({
      sources: [
        {
          ...liveSource,
          liveStatus: {
            ...liveSource.liveStatus,
            concurrentUserCount: 5678,
          },
        },
        offlineSource,
      ],
      loading: false,
      hasLoaded: true,
      reload: vi.fn(),
    });
    view.rerender(React.createElement(MultiviewPage));

    expect(screen.getByText("5,678명 시청 중")).toBeTruthy();
    expect(getMulLiveFrame()).toBe(initialFrame);

    fireEvent.click(
      screen.getAllByRole("button", { name: "멀티뷰 멤버 목록 닫기" })[0],
    );
    expect(getMulLiveFrame()).toBe(initialFrame);
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
      screen.getAllByRole("button", { name: "라이브 멤버 선택 해제" })[0],
    ).toBeTruthy();
  });

  it("limits URL and UI selection to the supported channel count", async () => {
    const channelIds = Array.from(
      { length: MAX_MULTIVIEW_CHANNELS + 2 },
      (_, index) => (index + 1).toString(16).padStart(32, "0"),
    );
    const members = channelIds.map((channelId, index) =>
      makeMember(100 + index, `${index + 1}번째 멤버`, channelId),
    );
    const sources = members.map(
      (member, index): MultiviewSource => ({
        channelId: channelIds[index],
        member,
        liveStatus: null,
        isLive: false,
      }),
    );
    const params = new URLSearchParams();
    channelIds.forEach((channelId) => params.append("c", channelId));
    window.history.replaceState(null, "", `/multiview?${params.toString()}`);
    useScheduleDataMock.mockReturnValue({ members, loading: false });
    useMultiviewSourcesMock.mockReturnValue({
      sources,
      loading: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(React.createElement(MultiviewPage));
    const initialFrame = getMulLiveFrame();
    const acceptedIds = channelIds.slice(0, MAX_MULTIVIEW_CHANNELS);

    expect(initialFrame.getAttribute("src")).toBe(
      `https://mul.live/${acceptedIds.join("/")}`,
    );
    expect(
      screen.getByText(`선택 ${MAX_MULTIVIEW_CHANNELS}/${MAX_MULTIVIEW_CHANNELS}`),
    ).toBeTruthy();

    const blockedButton = screen.getByRole("button", {
      name: `${MAX_MULTIVIEW_CHANNELS + 1}번째 멤버 선택 불가 (최대 ${MAX_MULTIVIEW_CHANNELS}개)`,
    }) as HTMLButtonElement;
    expect(blockedButton.disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "1번째 멤버 선택 해제" }),
    );
    expect(blockedButton.disabled).toBe(false);
    fireEvent.click(blockedButton);

    expect(getMulLiveFrame()).toBe(initialFrame);
    expect(getMulLiveFrame().getAttribute("src")).toBe(
      `https://mul.live/${[
        ...acceptedIds.slice(1),
        channelIds[MAX_MULTIVIEW_CHANNELS],
      ].join("/")}`,
    );
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).getAll("c")).toHaveLength(
        MAX_MULTIVIEW_CHANNELS,
      );
    });
  });
});
