// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChzzkClip, Member } from "@/lib/types";
import { ChzzkClipsPlaylist } from "./chzzk-clips-playlist";

const member: Member = {
  uid: 1,
  code: "m1",
  name: "멤버1",
  main_color: "#336699",
  sub_color: "#99bbdd",
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: "https://chzzk.naver.com/aaa",
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
};

const member2: Member = {
  ...member,
  uid: 2,
  code: "m2",
  name: "멤버2",
  main_color: "#993366",
  sub_color: "#dd99bb",
};

const clip: ChzzkClip = {
  clipUID: "clip-1",
  videoId: "video-1",
  clipTitle: "테스트 클립",
  ownerChannelId: "aaa",
  thumbnailImageUrl: null,
  categoryType: "GAME",
  clipCategory: "Just Chatting",
  duration: 61,
  adult: false,
  createdDate: "2026-05-29 12:00:00",
  readCount: 10,
  blindType: null,
  memberUid: 1,
};

const clip2: ChzzkClip = {
  ...clip,
  clipUID: "clip-2",
  videoId: "video-2",
  clipTitle: "두 번째 클립",
  readCount: 20,
  memberUid: 2,
};

describe("ChzzkClipsPlaylist", () => {
  afterEach(() => {
    cleanup();
  });

  it("상위 탭 제목과 날짜/멤버 전환 버튼 없이 날짜별 클립 피드를 렌더링한다", () => {
    render(
      React.createElement(ChzzkClipsPlaylist, {
        clips: [clip],
        members: [member],
      }),
    );

    expect(screen.queryByText("치지직 클립")).toBeNull();
    expect(screen.queryByRole("button", { name: "일자별 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "멤버별 보기" })).toBeNull();
    expect(screen.getByText("전체")).toBeTruthy();
    expect(screen.getByRole("button", { name: "멤버1" })).toBeTruthy();
    expect(screen.getByText("2026년 5월 29일")).toBeTruthy();
    expect(screen.getByText("테스트 클립")).toBeTruthy();
  });

  it("멤버 필터는 단일 선택으로 동작한다", () => {
    render(
      React.createElement(ChzzkClipsPlaylist, {
        clips: [clip, clip2],
        members: [member, member2],
      }),
    );

    expect(screen.getByText("테스트 클립")).toBeTruthy();
    expect(screen.getByText("두 번째 클립")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "멤버1" }));
    expect(screen.getByText("테스트 클립")).toBeTruthy();
    expect(screen.queryByText("두 번째 클립")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "멤버2" }));
    expect(screen.queryByText("테스트 클립")).toBeNull();
    expect(screen.getByText("두 번째 클립")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "멤버2" }));
    expect(screen.getByText("테스트 클립")).toBeTruthy();
    expect(screen.getByText("두 번째 클립")).toBeTruthy();
  });
});
