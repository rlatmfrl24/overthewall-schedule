import { createMemberFixture } from "@/test/member-fixtures";
// @vitest-environment jsdom
import { format } from "date-fns";
import { createElement, type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { ScheduleBoardResponse } from "@contracts/schedule-board";
import type { ScheduleDto } from "@contracts/schedules";
import { createQueryWrapper } from "@/test/query-client";
import { DailySchedule } from "./daily-schedule";

vi.mock("@clerk/clerk-react", async original => ({...await original<typeof import("@clerk/clerk-react")>(), useAuth:()=>({isSignedIn:false,userId:null})}));

const useScheduleBoardMock = vi.hoisted(() => vi.fn());
const fetchLiveStatusesMock = vi.hoisted(() => vi.fn());
const fetchLiveStatusDiagnosticsMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const testSite = vi.hoisted(() => ({ id: "otw" }));
vi.mock("@/shared/config/site", async (original) => {
  const actual = await original<typeof import("@/shared/config/site")>();
  return { ...actual, site: { ...actual.site, get id() { return testSite.id; } } };
});
vi.mock('@/shared/ui/toast',()=>({useToast:()=>({toast:vi.fn()})}));

vi.mock("../../queries/use-schedule-board", () => ({
  useScheduleBoard: useScheduleBoardMock,
}));

vi.mock("@/features/chzzk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/chzzk")>();
  return {
    ...actual,
    fetchLiveStatusesForMembersWithMeta: fetchLiveStatusesMock,
    fetchLiveStatusDiagnostics: fetchLiveStatusDiagnosticsMock,
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode; title?: string; className?: string; "aria-label"?: string }) =>
      createElement("a", { href: "/notice", title: props.title, className: props.className, "aria-label": props["aria-label"] }, children),
    useNavigate: () => navigateMock,
  };
});

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const member: MemberDto = createMemberFixture({
    uid: 1,
    code: "member-1",
    name: "온 하루",
    main_color: "#14b8a6",
    sub_color: "#99f6e4",
    url_chzzk: "https://chzzk.naver.com/member-channel",
    unit_name: "LUV DIA"
  });

const makeSchedule = (): ScheduleDto => ({
  id: 1,
  member_uid: member.uid,
  date: format(new Date(), "yyyy-MM-dd"),
  start_time: "20:00",
  title: "정규 방송",
  status: "방송",
  created_at: null,
});

const makeBoard = (): ScheduleBoardResponse => {
  const date = format(new Date(), "yyyy-MM-dd");
  return {
    startDate: date,
    endDate: date,
    updatedAt: null,
    members: [member],
    ddays: [],
    notices: [],
    schedules: [makeSchedule()],
  };
};

const setBoardState = (board = makeBoard()) => {
  useScheduleBoardMock.mockReturnValue({
    board,
    members: board.members,
    ddays: board.ddays,
    notices: board.notices,
    schedules: board.schedules,
    loading: false,
    fetching: false,
    hasLoaded: true,
    error: null,
    refetch: vi.fn(),
  });
};

const setLiveStatus = (status: "OPEN" | "CLOSE") => {
  fetchLiveStatusesMock.mockResolvedValue({
    statuses: {
      [member.uid]: {
        status,
        liveTitle: "라이브 중",
        concurrentUserCount: 321,
        liveImageUrl: "",
        defaultThumbnailImageUrl: "",
        channelId: "live-channel",
        channelName: "테스트 채널",
        channelImageUrl: "",
      },
    },
    scheduleAutoFill: { updated: 0 },
  });
};

describe("DailySchedule", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
      writable: true,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  });

  beforeEach(() => {
    testSite.id = "otw";
    setBoardState();
    setLiveStatus("OPEN");
    fetchLiveStatusDiagnosticsMock.mockResolvedValue({
      items: [],
      channelToMembers: {},
    });
  });

  it("러브다이아는 멤버를 한 번씩 표시하고 헤더 링크와 하루의 모든 일정을 제공한다", async () => {
    testSite.id = "luvdia";
    const board = makeBoard();
    board.members = [
      { ...member, url_youtube: "https://www.youtube.com/@member", url_twitter: "https://x.com/member" },
      createMemberFixture({ uid: 27, code: "another-member", name: "두 번째 멤버" }),
    ];
    board.schedules = Array.from({ length: 3 }, (_, index) => ({
      ...makeSchedule(), id: index + 1, title: `오늘의 방송 ${index + 1}`,
    }));
    setBoardState(board);
    render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
    const card = await screen.findByRole("article", { name: `${member.name} 스케쥴` });
    expect(screen.getAllByRole("heading", { name: member.name })).toHaveLength(1);
    expect(card.querySelector("header")?.contains(within(card).getByRole("heading", { name: member.name }))).toBe(true);
    expect(within(card).getByRole("link", { name: `${member.name} YouTube` }).getAttribute("href")).toBe(board.members[0].url_youtube);
    expect(within(card).getByRole("link", { name: `${member.name} X` }).getAttribute("href")).toBe(board.members[0].url_twitter);
    for (const schedule of board.schedules) expect(within(card).getByText(schedule.title!)).toBeTruthy();
    expect(screen.getByRole("article", { name: "두 번째 멤버 스케쥴" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "시간순 보기 전환" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "스케쥴 복사 옵션" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 날짜로 이동" })).toBeTruthy();
  });

  it("러브다이아에서도 방송 카드의 일정 클릭은 기존 편집 흐름으로 진입한다", async () => {
    testSite.id = "luvdia";
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
    const card = await screen.findByRole("article", { name: `${member.name} 스케쥴` });
    await within(card).findByLabelText("LIVE, 321명 시청중");
    fireEvent.click(within(card).getByRole("button", { name: /정규 방송/ }));
    expect(await screen.findByRole("heading", { name: "스케쥴 수정" })).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("러브다이아는 로딩 중에도 두 멤버 분량의 자리를 제공한다", () => {
    testSite.id = "luvdia";
    setBoardState();
    useScheduleBoardMock.mockReturnValue({ ...useScheduleBoardMock(), members: [], schedules: [], loading: true, hasLoaded: false });
    render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
    expect(screen.getAllByRole("article", { name: "멤버 일정 불러오는 중" })).toHaveLength(2);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]])(
    "renders %i D-days and %i notices without losing long titles or leaving empty slots",
    (ddayCount, noticeCount) => {
      const board = makeBoard();
      const longTitle = "공백없는아주긴기념일제목".repeat(20);
      board.ddays = Array.from({ length: ddayCount }, (_, id) => ({
        id, title: `${longTitle}${id}`, date: board.startDate,
        type: "event", description: null, color: null, created_at: null,
      }));
      board.notices = Array.from({ length: noticeCount }, (_, id) => ({
        id, content: `긴 공지 제목 ${longTitle}`, links: [], image_urls: [],
        related_member_uids: [], url: null, thumbnail_url: null, type: "notice",
        publisher_type: "otw", publisher_member_uid: null, is_active: true,
        is_featured: true, started_at: null, ended_at: null, created_at: null,
      }));
      setBoardState(board);
      const { container } = render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
      const row = container.querySelector("[data-daily-context-row]");
      if (!ddayCount && !noticeCount) {
        expect(row).toBeNull();
        return;
      }
      // jsdom checks content/visibility; height and clipping are checked in the browser.
      expect(row?.children).toHaveLength(Number(ddayCount > 0) + Number(noticeCount > 0));
      expect(screen.queryAllByText("D-DAY")).toHaveLength(ddayCount);
      for (const dday of board.ddays) {
        const title = screen.getByText(dday.title);
        expect(title.getAttribute("title")).toBe(dday.title);
        const group = screen.getByRole("group", { name: "기념일" });
        expect(group.contains(title)).toBe(true);
        expect(group.tabIndex).toBe(0);
      }
      const noticeSlot = row?.querySelector("[data-daily-notice-slot]");
      expect(Boolean(noticeSlot)).toBe(Boolean(noticeCount));
      if (noticeCount) {
        expect(screen.getByText(board.notices[0].content).getAttribute("title")).toBe(board.notices[0].content);
      }
    },
  );

  it("offers legacy exports only in the timeline menu without replacing the default actions", async () => {
    render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
    fireEvent.keyDown(screen.getByRole("button", { name: "스케쥴 복사 옵션" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /이미지 다운로드/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "기존 편성표 다운로드" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "시간순 보기 전환" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "스케쥴 복사 옵션" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "기존 편성표 다운로드" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "기존 편성표 복사" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "클립보드 복사" })).toBeTruthy();
  });

  it("방송 중인 모바일·데스크톱 일정 카드는 새 탭 대신 편집 다이얼로그를 연다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(createElement(DailySchedule), {
      wrapper: createQueryWrapper(),
    });

    expect(
      await screen.findAllByLabelText("LIVE, 321명 시청중"),
    ).toHaveLength(2);

    const scheduleCards = container.querySelectorAll(
      "[data-schedule-card='true']",
    );
    expect(scheduleCards).toHaveLength(2);

    for (const scheduleCard of scheduleCards) {
      fireEvent.click(scheduleCard);
      expect(
        await screen.findByRole("heading", { name: "스케쥴 수정" }),
      ).toBeTruthy();
      expect(screen.getByDisplayValue("정규 방송")).toBeTruthy();
      expect(openSpy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "취소" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", { name: "스케쥴 수정" }),
        ).toBeNull(),
      );
    }
  });

  it("방송 중인 모바일·데스크톱 멤버 카드 배경은 기존처럼 방송을 연다", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(createElement(DailySchedule), {
      wrapper: createQueryWrapper(),
    });

    expect(
      await screen.findAllByLabelText("LIVE, 321명 시청중"),
    ).toHaveLength(2);

    const memberCards = container.querySelectorAll(
      "[data-daily-member-card='true']",
    );
    expect(memberCards).toHaveLength(2);

    for (const memberCard of memberCards) {
      fireEvent.click(memberCard);
    }

    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(openSpy).toHaveBeenNthCalledWith(
      1,
      "https://chzzk.naver.com/live/live-channel",
      "_blank",
      "noreferrer",
    );
    expect(
      screen.queryByRole("heading", { name: "스케쥴 수정" }),
    ).toBeNull();
  });

  it("보기 전환을 이름 있는 기본 버튼으로 제공하고 날짜 이동을 유지한다", () => {
    render(createElement(DailySchedule), { wrapper: createQueryWrapper() });
    const toggle = screen.getByRole("button", { name: "시간순 보기 전환" });
    expect(toggle.tagName).toBe("BUTTON");
    fireEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "오늘의 편성표" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "그리드 뷰 전환" }));
    expect(screen.getByRole("heading", { name: "오늘의 스케쥴" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "오늘로 이동" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이전 날짜로 이동" }));
    expect(screen.getByRole("button", { name: "오늘로 이동" }).hasAttribute("disabled")).toBe(false);
  });

  it("비방송 일정도 기존처럼 편집 다이얼로그를 연다", async () => {
    setLiveStatus("CLOSE");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(createElement(DailySchedule), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() =>
      expect(fetchLiveStatusesMock).toHaveBeenCalledTimes(1),
    );
    const scheduleCard = container.querySelector(
      "[data-schedule-card='true']",
    );
    expect(scheduleCard).toBeTruthy();

    fireEvent.click(scheduleCard as Element);

    expect(
      await screen.findByRole("heading", { name: "스케쥴 수정" }),
    ).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
