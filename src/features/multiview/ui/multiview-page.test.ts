// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  liveStatus: { status: "CLOSE" } as MultiviewSource["liveStatus"],
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

  const renderPage = () => render(React.createElement(MultiviewPage));
  const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
  const enter = () => { click("라이브 멤버 선택"); click("이 화면에서 보기"); };

  it("starts with unique live/offline choices and no iframe or enabled watch actions", () => {
    renderPage();
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(within(screen.getByRole("region", { name: "방송 중" })).getByRole("button", { name: "라이브 멤버 선택" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "방송 중이 아닌 멤버" })).getByRole("button", { name: "오프라인 멤버 선택" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "라이브 멤버 선택" })).toHaveLength(1);
    expect(screen.getByText("테스트 라이브")).toBeTruthy();
    expect(screen.getByText("1,234명 시청 중")).toBeTruthy();
    expect((screen.getByRole("button", { name: "이 화면에서 보기" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Mul.Live에서 보기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("updates selection URL and external link without loading an iframe", async () => {
    renderPage();
    click("라이브 멤버 선택");
    click("오프라인 멤버 선택");
    const link = screen.getByRole("link", { name: /Mul.Live에서 보기/ });
    expect(link.getAttribute("href")).toBe(`https://mul.live/${CHANNEL_A}/${CHANNEL_B}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    // Prevent jsdom navigation while checking that the external action leaves selection intact.
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    await waitFor(() => expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([CHANNEL_A, CHANNEL_B]));
    click("초기화");
    expect(screen.queryByRole("link", { name: /Mul.Live에서 보기/ })).toBeNull();
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([]);
  });

  it("restores shared URLs and re-entry as selection, with unknown channels removable", () => {
    const unknown = "f".repeat(32);
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_A}&c=${unknown}`);
    const page = renderPage();
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "목록에 없는 선택 채널" })).toBeTruthy();
    click(`${unknown} 선택 해제`);
    click("이 화면에서 보기");
    expect(getMulLiveFrame().getAttribute("src")).toBe(`https://mul.live/${CHANNEL_A}`);
    page.unmount();
    renderPage();
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
  });

  it("keeps the iframe and URL unchanged until applying an edit", async () => {
    renderPage();
    enter();
    const frame = getMulLiveFrame();
    click("멤버 변경");
    click("오프라인 멤버 선택");
    expect(frame.getAttribute("src")).toBe(`https://mul.live/${CHANNEL_A}`);
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([CHANNEL_A]);
    click("취소");
    expect(getMulLiveFrame()).toBe(frame);
    click("멤버 변경");
    expect(screen.getByRole("button", { name: "오프라인 멤버 선택" }).getAttribute("aria-pressed")).toBe("false");
    click("오프라인 멤버 선택");
    click("적용");
    expect(getMulLiveFrame()).toBe(frame);
    expect(frame.getAttribute("src")).toBe(`https://mul.live/${CHANNEL_A}/${CHANNEL_B}`);
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([CHANNEL_A, CHANNEL_B]);
    await waitFor(() => expect(screen.getByRole("button", { name: "멤버 변경" })).toBe(document.activeElement));
    click("선택 화면으로");
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(screen.getByRole("button", { name: "오프라인 멤버 선택 해제" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오버더월 멀티뷰" })).toBe(document.activeElement);
  });

  it("discards edits on Escape and close, and prevents applying zero channels", () => {
    renderPage();
    enter();
    const frame = getMulLiveFrame();
    click("멤버 변경");
    click("초기화");
    expect((screen.getByRole("button", { name: "적용" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    click("멤버 변경");
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    click("오프라인 멤버 선택");
    click("멤버 변경 닫기");
    expect(getMulLiveFrame()).toBe(frame);
    expect(frame.getAttribute("src")).toBe(`https://mul.live/${CHANNEL_A}`);
  });

  it("does not remount or change playback when live status refreshes or a stream ends", () => {
    const page = renderPage();
    enter();
    const frame = getMulLiveFrame();
    useMultiviewSourcesMock.mockReturnValue({ sources: [{ ...liveSource, isLive: false, liveStatus: { status: "CLOSE" } }, offlineSource], loading: false, hasLoaded: true, reload: vi.fn() });
    page.rerender(React.createElement(MultiviewPage));
    click("멤버 변경");
    expect(within(screen.getByRole("region", { name: "방송 중이 아닌 멤버" })).getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    click("취소");
    expect(getMulLiveFrame()).toBe(frame);
    expect(frame.getAttribute("src")).toBe(`https://mul.live/${CHANNEL_A}`);
  });

  it("distinguishes loading and failed/missing status from offline and permits selection/retry", () => {
    const reload = vi.fn();
    useMultiviewSourcesMock.mockReturnValue({ sources: [{ ...liveSource, isLive: false, liveStatus: null }], loading: true, hasLoaded: false, isError: false, reload });
    const page = renderPage();
    expect(screen.getByRole("region", { name: "상태 확인 중" })).toBeTruthy();
    click("라이브 멤버 선택");
    useMultiviewSourcesMock.mockReturnValue({ sources: [{ ...liveSource, isLive: false, liveStatus: null }], loading: false, hasLoaded: true, isError: true, reload });
    page.rerender(React.createElement(MultiviewPage));
    expect(screen.getByRole("region", { name: "상태 확인 불가" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "방송 중이 아닌 멤버" })).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    click("상태 다시 확인");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("marks cached OPEN/CLOSE states unknown after failure and restores them without changing playback", () => {
    const reload = vi.fn();
    const refresh = (isError: boolean, loading = false) => {
      useMultiviewSourcesMock.mockReturnValue({ sources: [liveSource, offlineSource], loading, hasLoaded: true, isError, reload });
      page.rerender(React.createElement(MultiviewPage));
    };
    const assertUnknown = () => {
      const unknown = screen.getByRole("region", { name: "상태 확인 불가" });
      expect(within(unknown).getAllByRole("button")).toHaveLength(2);
      expect(within(unknown).getAllByText("상태 확인 불가")).toHaveLength(3);
      expect(screen.queryByText("LIVE")).toBeNull();
      expect(screen.queryByText("테스트 라이브")).toBeNull();
      expect(screen.queryByText("1,234명 시청 중")).toBeNull();
      expect(screen.queryByText("방송 중이 아닙니다")).toBeNull();
      expect(screen.queryByText("현재 방송 중인 멤버가 없습니다.")).toBeNull();
      expect(within(screen.getByRole("region", { name: "방송 중이 아닌 멤버" })).queryByRole("button")).toBeNull();
    };
    const page = renderPage();
    click("라이브 멤버 선택");
    refresh(true);
    assertUnknown();
    expect(screen.getByRole("button", { name: "라이브 멤버 선택 해제" })).toBeTruthy();
    click("이 화면에서 보기");
    const frame = getMulLiveFrame();
    const src = frame.getAttribute("src");
    const search = window.location.search;
    click("멤버 변경");
    assertUnknown();
    click("오프라인 멤버 선택");
    click("상태 다시 확인");
    expect(reload).toHaveBeenCalledOnce();
    refresh(true, true);
    assertUnknown();
    expect((screen.getByRole("button", { name: "상태 다시 확인" }) as HTMLButtonElement).disabled).toBe(true);
    refresh(false);
    expect(screen.queryByRole("region", { name: "상태 확인 불가" })).toBeNull();
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "방송 중이 아닌 멤버" })).getByRole("button", { name: "오프라인 멤버 선택 해제" })).toBeTruthy();
    click("취소");
    expect(getMulLiveFrame()).toBe(frame);
    expect(frame.getAttribute("src")).toBe(src);
    expect(window.location.search).toBe(search);
  });

  it("limits shared URLs and UI selection to eight channels and deduplicates member cards", () => {
    const channelIds = Array.from({ length: 10 }, (_, index) => (index + 1).toString(16).padStart(32, "0"));
    const sources = channelIds.map((id, index) => ({ channelId: id, member: makeMember(index, `${index + 1}번째 멤버`, id), isLive: false, liveStatus: { status: "CLOSE" } }));
    useMultiviewSourcesMock.mockReturnValue({ sources: [...sources, sources[0]], loading: false, hasLoaded: true, reload: vi.fn() });
    window.history.replaceState(null, "", `/multiview?${channelIds.map((id) => `c=${id}`).join("&")}`);
    renderPage();
    expect(screen.getAllByRole("button", { name: "1번째 멤버 선택 해제" })).toHaveLength(1);
    expect(new URLSearchParams(window.location.search).getAll("c")).toHaveLength(MAX_MULTIVIEW_CHANNELS);
    const blocked = screen.getByRole("button", { name: "9번째 멤버 선택 불가 (최대 8개)" }) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    click("1번째 멤버 선택 해제");
    expect(blocked.disabled).toBe(false);
    fireEvent.click(blocked);
    click("이 화면에서 보기");
    expect(getMulLiveFrame().getAttribute("src")).toBe(`https://mul.live/${[...channelIds.slice(1, 8), channelIds[8]].join("/")}`);
  });

  it("returns to selection when browser history restores another channel combination", () => {
    renderPage();
    enter();
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_B}`);
    fireEvent.popState(window);
    expect(screen.queryByTestId("multiview-mullive-frame")).toBeNull();
    expect(screen.getByRole("button", { name: "오프라인 멤버 선택 해제" })).toBeTruthy();
  });
});
