// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ChzzkLiveContentDto } from "@contracts/chzzk";
import type { ScheduleItem } from "@/features/schedules";
import { createMemberFixture } from "@/test/member-fixtures";
import { createQueryWrapper } from "@/test/query-client";
import { LuvDiaMemberCard } from "./luvdia-member-card";

vi.mock("@clerk/clerk-react", async original => ({ ...await original<typeof import("@clerk/clerk-react")>(), useAuth: () => ({ isSignedIn: false, userId: null }) }));
vi.mock("@tanstack/react-router", async original => ({
  ...await original<typeof import("@tanstack/react-router")>(),
  Link: ({ children, to, params, ...props }: { children: ReactNode; to: string; params: { code: string } }) =>
    createElement("a", { ...props, href: to.replace("$code", params.code) }, children),
}));

const member = createMemberFixture({ uid: 47, code: "member-code", name: "양메이", main_color: "#bee155", sub_color: "#74d57f", url_chzzk: "https://chzzk.naver.com/own-channel", url_youtube: "https://www.youtube.com/@member", url_twitter: "https://x.com/member" });
const schedule: ScheduleItem = { id: 1, member_uid: member.uid, date: "2026-11-17", start_time: "20:00", title: "정규 방송", status: "방송", created_at: null };
const live: ChzzkLiveContentDto = { status: "OPEN", channelId: "mapped-live", channelName: member.name, channelImageUrl: "", liveTitle: "실제 방송 제목", concurrentUserCount: 321, liveImageUrl: "", defaultThumbnailImageUrl: "" };
const baseProps = { member, schedules: [schedule], isToday: true };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("LuvDiaMemberCard", () => {
  it("groups the member name and all configured links in the header", () => {
    render(createElement(LuvDiaMemberCard, baseProps), { wrapper: createQueryWrapper() });
    const card = screen.getByRole("article", { name: `${member.name} 스케쥴` });
    const header = card.querySelector("header")!;
    expect(within(header).getByRole("heading", { name: member.name })).toBeTruthy();
    expect(within(header).getByRole("link", { name: `${member.name} 프로필` }).getAttribute("href")).toBe(`/profile/${member.code}`);
    expect(within(header).getByRole("link", { name: `${member.name} YouTube` }).getAttribute("href")).toBe(member.url_youtube);
    expect(within(header).getByRole("link", { name: `${member.name} X` }).getAttribute("href")).toBe(member.url_twitter);
  });

  it("never presents missing or initially pending live data as offline", () => {
    const { rerender } = render(createElement(LuvDiaMemberCard, baseProps), { wrapper: createQueryWrapper() });
    expect(screen.getByText("상태 확인 불가")).toBeTruthy();
    expect(screen.queryByText("오프라인")).toBeNull();
    rerender(createElement(LuvDiaMemberCard, { ...baseProps, isLiveStatusPending: true }));
    expect(screen.getByText("상태 확인 중")).toBeTruthy();
    rerender(createElement(LuvDiaMemberCard, { ...baseProps, liveStatus: { ...live, status: "CLOSE" } }));
    expect(screen.queryByText("오프라인")).toBeNull();
    expect(screen.queryByText("상태 확인 불가")).toBeNull();
    expect(screen.getByRole("link", { name: `${member.name} 치지직 채널` }).getAttribute("href")).toBe(member.url_chzzk);
  });

  it("does not show today's live status on another date", () => {
    render(createElement(LuvDiaMemberCard, { ...baseProps, isToday: false, liveStatus: live }), { wrapper: createQueryWrapper() });
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.queryByText("오프라인")).toBeNull();
    expect(screen.queryByText("상태 확인 불가")).toBeNull();
    expect(screen.getByRole("link", { name: `${member.name} 치지직 채널` }).getAttribute("href")).toBe(member.url_chzzk);
  });

  it("uses the mapped live channel and keeps editing and adding separate from background playback", () => {
    const onScheduleClick = vi.fn(), onAddSchedule = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(createElement(LuvDiaMemberCard, { ...baseProps, liveStatus: live, onScheduleClick, onAddSchedule }), { wrapper: createQueryWrapper() });
    expect(screen.getByLabelText("LIVE, 321명 시청중")).toBeTruthy();
    expect(screen.getByRole("link", { name: `${member.name} 치지직 방송 보기` }).getAttribute("href")).toBe("https://chzzk.naver.com/live/mapped-live");
    fireEvent.click(screen.getByRole("button", { name: /정규 방송/ }));
    expect(onScheduleClick).toHaveBeenCalledWith(schedule);
    fireEvent.click(screen.getByRole("button", { name: `${member.name} 스케쥴 추가` }));
    expect(onAddSchedule).toHaveBeenCalledWith(member.uid);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("article", { name: `${member.name} 스케쥴` }));
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("https://chzzk.naver.com/live/mapped-live", "_blank", "noreferrer");
  });

  it("renders every schedule and keeps an empty day distinct from a day off", () => {
    const schedules = Array.from({ length: 3 }, (_, index) => ({ ...schedule, id: index + 1, title: `방송 ${index + 1}` }));
    const { rerender } = render(createElement(LuvDiaMemberCard, { ...baseProps, schedules }), { wrapper: createQueryWrapper() });
    for (const entry of schedules) expect(screen.getByText(entry.title!)).toBeTruthy();
    rerender(createElement(LuvDiaMemberCard, { ...baseProps, schedules: [] }));
    expect(screen.getByText("일정 없음")).toBeTruthy();
    expect(screen.queryByText("오늘은 휴방입니다")).toBeNull();
    rerender(createElement(LuvDiaMemberCard, { ...baseProps, schedules: [{ ...schedule, status: "휴방", title: null }] }));
    expect(screen.getByText("오늘은 휴방입니다")).toBeTruthy();
  });

  it("does not invent channel links when a member has no configured channels", () => {
    render(createElement(LuvDiaMemberCard, { ...baseProps, member: { ...member, url_chzzk: null, url_youtube: null, url_twitter: null } }), { wrapper: createQueryWrapper() });
    expect(screen.queryByRole("link", { name: /치지직/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /YouTube/ })).toBeNull();
    expect(screen.queryByRole("link", { name: `${member.name} X` })).toBeNull();
    expect(screen.getByRole("link", { name: `${member.name} 프로필` })).toBeTruthy();
  });
});
