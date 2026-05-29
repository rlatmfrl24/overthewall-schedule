// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChzzkVideo, Member } from "@/lib/types";

const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useAllMembersVodsMock = vi.hoisted(() => vi.fn());
const useAllMembersClipsMock = vi.hoisted(() => vi.fn());

type MockYouTubeSectionProps = {
  selectedMemberUids: number[] | null;
};

type MockMemberFilterProps = {
  members: Member[];
  selectedUids: number[] | null;
  onChange: (selectedUids: number[] | null) => void;
};

type MockChzzkClipsPlaylistProps = {
  loading?: boolean;
};

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("@/hooks/use-chzzk-vods", () => ({
  useAllMembersVods: useAllMembersVodsMock,
}));

vi.mock("@/hooks/use-chzzk-clips", () => ({
  useAllMembersClips: useAllMembersClipsMock,
}));

vi.mock("@/assets/icon_youtube.svg", () => ({ default: "youtube.svg" }));
vi.mock("@/assets/icon_chzzk.png", () => ({ default: "chzzk.png" }));

vi.mock("@/features/youtube/youtube-section", async () => {
  const ReactModule = await import("react");
  return {
    YouTubeSection: ({ selectedMemberUids }: MockYouTubeSectionProps) =>
      ReactModule.createElement(
        "section",
        { "data-testid": "official-youtube-section" },
        `official:${selectedMemberUids?.join(",") || "all"}`,
      ),
  };
});

vi.mock("@/features/youtube/kirinuki-section", async () => {
  const ReactModule = await import("react");
  return {
    KirinukiSection: () =>
      ReactModule.createElement(
        "section",
        { "data-testid": "kirinuki-section" },
        "kirinuki",
      ),
  };
});

vi.mock("@/features/clips/chzzk-clips-playlist", async () => {
  const ReactModule = await import("react");
  return {
    ChzzkClipsPlaylist: ({ loading }: MockChzzkClipsPlaylistProps) =>
      ReactModule.createElement(
        "section",
        { "data-testid": "chzzk-clips-section" },
        loading ? "clips:loading" : "clips:ready",
      ),
  };
});

vi.mock("@/features/youtube/member-filter-chips", async () => {
  const ReactModule = await import("react");
  return {
    MemberFilterChips: ({
      members,
      selectedUids,
      onChange,
    }: MockMemberFilterProps) =>
      ReactModule.createElement(
        "div",
        { "data-testid": "member-filter" },
        ReactModule.createElement(
          "span",
          { "data-testid": "member-filter-selected" },
          `selected:${selectedUids?.join(",") || "all"}`,
        ),
        members.map((member) =>
          ReactModule.createElement(
            "button",
            {
              key: member.uid,
              type: "button",
              onClick: () => onChange([member.uid]),
            },
            member.name,
          ),
        ),
      ),
  };
});

import { VodsOverview } from "./vods-overview";

const makeMember = (
  uid: number,
  options: {
    youtubeChannelId?: string | null;
    chzzkChannelId?: string | null;
  } = {},
): Member =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: "#336699",
    sub_color: "#99bbdd",
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: options.chzzkChannelId
      ? `https://chzzk.naver.com/${options.chzzkChannelId}`
      : null,
    youtube_channel_id: options.youtubeChannelId ?? null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const makeVideo = (member: Member): ChzzkVideo => ({
  videoNo: 12345,
  videoId: "vod-12345",
  videoTitle: "멤버1 최신 다시보기",
  videoType: "REPLAY",
  publishDate: "2026-05-29T09:00:00+09:00",
  thumbnailImageUrl: "https://example.com/thumbnail_{type}.jpg",
  duration: 3661,
  readCount: 12340,
  publishDateAt: 1780000000,
  categoryType: "GAME",
  videoCategory: "game",
  videoCategoryValue: "게임",
  channel: {
    channelId: "chzzk-channel",
    channelName: member.name,
    channelImageUrl: `/profile/${member.code}.webp`,
  },
  memberUid: member.uid,
});

const members = [
  makeMember(1, { youtubeChannelId: "UC1", chzzkChannelId: "aaa" }),
  makeMember(2, { youtubeChannelId: "UC2" }),
  makeMember(3, { chzzkChannelId: "bbb" }),
];

const chzzkMembers = [members[0], members[2]];

describe("VodsOverview", () => {
  beforeEach(() => {
    useScheduleDataMock.mockReturnValue({
      members,
      loading: false,
      hasLoaded: true,
    });
    useAllMembersVodsMock.mockReturnValue({
      vods: [],
      loading: false,
      hasLoaded: false,
    });
    useAllMembersClipsMock.mockReturnValue({
      clips: [],
      loading: false,
      hasLoaded: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("4개 상위 탭을 표시하고 공식 유튜브를 기본 탭으로 렌더링한다", () => {
    render(React.createElement(VodsOverview));

    expect(
      screen
        .getByRole("button", { name: "공식 유튜브" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "키리누키" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "치지직 클립" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "치지직 다시보기" }),
    ).toBeTruthy();

    expect(screen.getByTestId("official-youtube-section").textContent).toBe(
      "official:all",
    );
    expect(screen.queryByTestId("kirinuki-section")).toBeNull();
    expect(screen.queryByTestId("chzzk-clips-section")).toBeNull();
    expect(screen.getByTestId("member-filter").textContent).toContain("멤버1");
    expect(screen.getByTestId("member-filter").textContent).toContain("멤버2");
    expect(screen.getByTestId("member-filter").textContent).not.toContain(
      "멤버3",
    );

    expect(useAllMembersVodsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });
    expect(useAllMembersClipsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });
  });

  it("선택한 탭에 맞는 치지직 데이터만 활성화한다", () => {
    useAllMembersVodsMock.mockReturnValue({
      vods: [],
      loading: false,
      hasLoaded: true,
    });

    render(React.createElement(VodsOverview));

    fireEvent.click(screen.getByRole("button", { name: "키리누키" }));
    expect(screen.getByTestId("kirinuki-section")).toBeTruthy();
    expect(screen.queryByTestId("official-youtube-section")).toBeNull();
    expect(useAllMembersVodsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });
    expect(useAllMembersClipsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "치지직 클립" }));
    expect(screen.getByTestId("chzzk-clips-section").textContent).toBe(
      "clips:loading",
    );
    expect(useAllMembersVodsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });
    expect(useAllMembersClipsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "치지직 다시보기" }));
    expect(screen.queryByText("최신 다시보기")).toBeNull();
    expect(screen.queryByText("치지직 채널 2명")).toBeNull();
    expect(screen.queryByText("최신 영상 0개")).toBeNull();
    expect(screen.queryByText("다시보기 없음 2명")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "영상 있는 멤버 먼저" }),
    ).toBeNull();
    expect(screen.queryByTestId("chzzk-clips-section")).toBeNull();
    expect(useAllMembersVodsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: true,
    });
    expect(useAllMembersClipsMock).toHaveBeenLastCalledWith(chzzkMembers, 10, {
      enabled: false,
    });
  });

  it("치지직 다시보기에는 멤버 필터를 표시하지 않고 공식 유튜브 필터 상태는 유지한다", () => {
    render(React.createElement(VodsOverview));

    fireEvent.click(screen.getByRole("button", { name: "멤버1" }));
    expect(screen.getByTestId("official-youtube-section").textContent).toBe(
      "official:1",
    );

    fireEvent.click(screen.getByRole("button", { name: "치지직 다시보기" }));
    expect(screen.queryByTestId("member-filter")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "공식 유튜브" }));
    expect(screen.getByTestId("official-youtube-section").textContent).toBe(
      "official:1",
    );
  });

  it("치지직 다시보기 영상은 멤버 외곽 카드 없이 단독 영상 카드로 표시한다", () => {
    useAllMembersVodsMock.mockReturnValue({
      vods: [makeVideo(members[0])],
      loading: false,
      hasLoaded: true,
    });

    render(React.createElement(VodsOverview));

    fireEvent.click(screen.getByRole("button", { name: "치지직 다시보기" }));

    const vodLink = screen.getByRole("link", {
      name: "멤버1 최신 다시보기 다시보기 보기",
    });
    expect(vodLink.getAttribute("href")).toBe(
      "https://chzzk.naver.com/video/12345",
    );
    expect(screen.getByText("게임")).toBeTruthy();
    expect(screen.getByText("2026년 5월 29일")).toBeTruthy();
    expect(screen.getAllByText("멤버1").length).toBeGreaterThan(0);
    expect(screen.queryByText("다시보기 리스트로 이동")).toBeNull();
    expect(
      screen.queryByLabelText("멤버1 치지직 다시보기로 이동"),
    ).toBeNull();
  });
});
