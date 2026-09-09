// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteSeoProvider } from "@/shared/seo/site-seo-provider";
import { OtwPlayMemberSongbookPage } from "./member-songbook-page";

const mocks = vi.hoisted(() => ({ songbook: vi.fn() }));
vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlayMemberSongbook: mocks.songbook,
  useOtwPlayConfig: () => ({ data: { data: { publicReadEnabled: true } } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: { code: string } }) => <a href={to.replace('$code', params?.code ?? '')}>{children}</a>,
}));
vi.mock("./catalog-components", () => ({ OtwPlaySongRow: () => <article>곡</article> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const member = { uid: 1, code: "Alpha", name: "알파", oshiMark: null, unitName: null, imageUrl: "/profile/Alpha.webp", songCount: 3, performanceCount: 4, pageEligible: true };

describe("member songbook controls", () => {
  it.each([
    { from: undefined, to: 'next', button: '다음 목록' },
    { from: 'next', to: undefined, button: '처음 목록' },
  ])('moves to the loaded list after $button, without moving during loading or refetch', ({ from, to, button }) => {
    const scroll = vi.fn();
    const data = { data: { member, items: [] }, nextCursor: 'next' };
    mocks.songbook.mockReturnValue({ data, isError: false, isPlaceholderData: false });
    const change = vi.fn();
    const view = render(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: from }} onSearchChange={change} />);
    const list = screen.getByRole('region', { name: '멤버 곡 목록' });
    Object.defineProperty(list, 'scrollIntoView', { configurable: true, value: scroll });
    const trigger = screen.getByRole('button', { name: button });
    trigger.focus();
    fireEvent.click(trigger);
    expect(change).toHaveBeenCalledWith({ cursor: to });

    mocks.songbook.mockReturnValue({ data, isError: false, isPlaceholderData: true, isFetching: true });
    view.rerender(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: to }} onSearchChange={change} />);
    expect(scroll).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(list);

    mocks.songbook.mockReturnValue({ data, isError: false, isPlaceholderData: false });
    view.rerender(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: to }} onSearchChange={change} />);
    expect(document.activeElement).toBe(list);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });

    screen.getByLabelText('참여 역할').focus();
    mocks.songbook.mockReturnValue({ data, isError: false, isPlaceholderData: false, isFetching: true });
    view.rerender(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: to }} onSearchChange={change} />);
    expect(document.activeElement).toBe(screen.getByLabelText('참여 역할'));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('keeps filter focus when changing a filter also clears the cursor', () => {
    const scroll = vi.fn();
    mocks.songbook.mockReturnValue({ data: { data: { member, items: [] } }, isError: false });
    const view = render(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: 'next' }} onSearchChange={vi.fn()} />);
    const list = screen.getByRole('region', { name: '멤버 곡 목록' });
    Object.defineProperty(list, 'scrollIntoView', { configurable: true, value: scroll });
    screen.getByLabelText('참여 역할').focus();
    view.rerender(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ participantRole: 'chorus' }} onSearchChange={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('참여 역할'));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("keeps default SEO counts while changing category, role and cursor URL state", () => {
    mocks.songbook.mockReturnValue({ data: { data: { member, items: [] }, nextCursor: "next" }, isError: false });
    const change = vi.fn();
    render(<SiteSeoProvider pathname="/play/members/Alpha"><OtwPlayMemberSongbookPage memberCode="Alpha" search={{ cursor: "old" }} onSearchChange={change} /></SiteSeoProvider>);
    expect(document.title).toBe("알파 노래 모음 | OTW Play");
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain("공식곡 3곡");
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain("알파 노래 모음");
    expect(screen.getByRole('link', { name: '멤버 프로필' }).getAttribute('href')).toBe('/profile/Alpha');
    fireEvent.click(screen.getByRole('button', { name: '협업' }));
    expect(change).toHaveBeenLastCalledWith({ category: 'collaboration', cursor: undefined });
    fireEvent.change(screen.getByLabelText('참여 역할'), { target: { value: 'chorus' } });
    expect(change).toHaveBeenLastCalledWith({ participantRole: 'chorus', cursor: undefined });
    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'title' } });
    expect(change).toHaveBeenLastCalledWith({ sort: 'title', cursor: undefined });
    fireEvent.change(screen.getByLabelText('노래 검색'), { target: { value: '노래' } });
    fireEvent.submit(screen.getByRole('button', { name: '검색' }).closest('form')!);
    expect(change).toHaveBeenLastCalledWith({ q: '노래', cursor: undefined });
    fireEvent.click(screen.getByRole('button', { name: '다음 목록' }));
    expect(change).toHaveBeenLastCalledWith({ cursor: 'next' });
    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
  });

  it("offers a first-page recovery for invalidated pagination", () => {
    mocks.songbook.mockReturnValue({ isError: true, error: new Error('cursor expired'), refetch: vi.fn() });
    const change = vi.fn();
    render(<OtwPlayMemberSongbookPage memberCode="Alpha" search={{ q: '노래', cursor: 'old' }} onSearchChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: '처음 목록부터 다시 불러오기' }));
    expect(change).toHaveBeenCalledWith({ q: '노래', cursor: undefined });
  });
});
