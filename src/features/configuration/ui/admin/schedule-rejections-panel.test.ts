// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { ScheduleRejectionsPanel } from "./schedule-rejections-panel";

const fetchRejectionsMock = vi.hoisted(() => vi.fn());
const reopenRejectionMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/schedules")>();
  return {
    ...actual,
    fetchScheduleCandidateRejections: fetchRejectionsMock,
    reopenScheduleCandidateRejection: reopenRejectionMock,
  };
});

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const makeItem = (id = 31) => ({
  id,
  vod_id: `chzzk:vod-${id}`,
  member_uid: 1,
  member_name: "테스트 멤버",
  date: "2026-07-29",
  start_time: "21:00",
  title: id === 31 ? "거부된 방송" : "마지막 거부 방송",
  status: "방송",
  action_type: "create",
  existing_schedule_id: null,
  previous_status: null,
  previous_start_time: null,
  previous_title: null,
  candidate_kind: "missing_schedule",
  match_reason: "missing_schedule",
  match_confidence: "high",
  source_vod_ids: [`chzzk:vod-${id}`],
  session_started_at: "2026-07-29T12:00:00.000Z",
  session_ended_at: "2026-07-29T13:00:00.000Z",
  vod_segment_count: 1,
  vod_started_at: "2026-07-29T12:00:00.000Z",
  vod_duration_seconds: 3600,
  vod_thumbnail_url: null,
  reason_code: "duplicate",
  reason_note: "중복 후보",
  actor_name: "관리자",
  rejected_at: "2026-07-29 12:30:00",
});

const makeResponseBase = () => ({
  items: [makeItem()],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
});

const makeResponse = (
  overrides: Partial<ReturnType<typeof makeResponseBase>> = {},
) => ({
  ...makeResponseBase(),
  ...overrides,
});

describe("ScheduleRejectionsPanel", () => {
  beforeEach(() => {
    fetchRejectionsMock.mockResolvedValue(makeResponse());
    reopenRejectionMock.mockResolvedValue({
      success: true,
      action: "reopen_rejection",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("검색 조건으로 목록을 다시 조회하고 후보 스냅샷을 표시한다", async () => {
    render(createElement(ScheduleRejectionsPanel), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("거부된 방송")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "멤버·제목·VOD ID 검색" }),
      { target: { value: "테스트" } },
    );

    await waitFor(() =>
      expect(fetchRejectionsMock).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        search: "테스트",
      }),
    );
    expect(await screen.findByText("chzzk:vod-31")).toBeTruthy();
    expect(screen.getByText(/중복 후보 ·/)).toBeTruthy();
  });

  it("재검토 허용 영향 확인 후 제외 해제 API를 호출한다", async () => {
    render(createElement(ScheduleRejectionsPanel), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "재검토 허용" }),
    );
    expect(
      screen.getByText(/즉시 pending을 만들지는 않으며/),
    ).toBeTruthy();
    const confirmButtons = screen.getAllByRole("button", {
      name: "재검토 허용",
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(reopenRejectionMock).toHaveBeenCalledWith(31),
    );
  });

  it("마지막 페이지의 마지막 항목을 재검토하면 유효한 이전 페이지로 이동한다", async () => {
    let reopened = false;
    fetchRejectionsMock.mockImplementation(
      async (query: { page: number }) => {
        if (query.page === 2 && !reopened) {
          return makeResponse({
            items: [makeItem(32)],
            page: 2,
            total: 21,
            totalPages: 2,
          });
        }
        if (!reopened) {
          return makeResponse({
            total: 21,
            totalPages: 2,
          });
        }
        return makeResponse({
          page: 1,
          total: 20,
          totalPages: 1,
        });
      },
    );
    reopenRejectionMock.mockImplementation(async () => {
      reopened = true;
      return {
        success: true,
        action: "reopen_rejection",
      };
    });

    render(createElement(ScheduleRejectionsPanel), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "다음" }));
    expect(await screen.findByText("마지막 거부 방송")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재검토 허용" }));
    const confirmButtons = screen.getAllByRole("button", {
      name: "재검토 허용",
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(fetchRejectionsMock).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
      }),
    );
    expect(await screen.findByText("1/1 페이지")).toBeTruthy();
  });
});
