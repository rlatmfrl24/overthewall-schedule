// @vitest-environment jsdom
import { format } from "date-fns";
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { ScheduleBoardResponse } from "@contracts/schedule-board";
import type { ScheduleDto } from "@contracts/schedules";
import { createQueryWrapper } from "@/test/query-client";
import { DailySchedule } from "./daily-schedule";

const useScheduleBoardMock = vi.hoisted(() => vi.fn());
const fetchLiveStatusesMock = vi.hoisted(() => vi.fn());
const fetchLiveStatusDiagnosticsMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

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
    useNavigate: () => navigateMock,
  };
});

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const member: MemberDto = {
  uid: 1,
  code: "member-1",
  name: "온 하루",
  main_color: "#14b8a6",
  sub_color: "#99f6e4",
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: "https://chzzk.naver.com/member-channel",
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: "LUV DIA",
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
};

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

const setBoardState = () => {
  const board = makeBoard();
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
    setBoardState();
    setLiveStatus("OPEN");
    fetchLiveStatusDiagnosticsMock.mockResolvedValue({
      items: [],
      channelToMembers: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
