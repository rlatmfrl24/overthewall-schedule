// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  preflight: vi.fn(),
  members: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("../../api/submissions", () => ({
  createOtwPlaySubmission: mocks.create,
  preflightOtwPlaySubmission: mocks.preflight,
}));
vi.mock("@/features/members", () => ({ fetchActiveMembers: mocks.members }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useBlocker: mocks.blocker,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

import { OtwPlaySubmissionPage } from "./submission-page";

const member = {
  uid: 1,
  code: "member-one",
  name: "멤버 한명",
  main_color: null,
  sub_color: null,
  oshi_mark: "🎵",
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: "UC123",
  birth_date: null,
  debut_date: null,
  unit_name: "Unit",
  fan_name: null,
  introduction: null,
  is_deprecated: false,
};

const preflight = {
  videoId: "dQw4w9WgXcQ",
  canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  duplicate: null,
  songCandidates: [],
};

const submission = {
  id: "proposal-one",
  clientRequestId: "request-one",
  youtubeUrl: preflight.canonicalUrl,
  youtubeVideoId: preflight.videoId,
  title: "테스트 커버",
  suggestedSongId: null,
  note: null,
  status: "pending_review",
  createdAt: 1,
  updatedAt: 1,
  originalArtists: [{ creditOrder: 0, displayName: "원곡 가수" }],
  participants: [{ creditOrder: 0, displayName: "멤버 한명", participantRole: "vocal" }],
  approvedSong: null,
} as const;

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OtwPlaySubmissionPage />
    </QueryClientProvider>,
  );
};

const verifyVideo = async () => {
  fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), {
    target: { value: "https://youtu.be/dQw4w9WgXcQ" },
  });
  fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
  await screen.findByLabelText("곡명 *");
};

const completeDetails = async () => {
  fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "테스트 커버" } });
  const artistInput = screen.getByLabelText("원곡 가수 *");
  fireEvent.change(artistInput, { target: { value: "원곡 가수" } });
  fireEvent.keyDown(artistInput, { key: "Enter" });
  const memberInput = screen.getByLabelText("OTW 참여 멤버");
  fireEvent.change(memberInput, { target: { value: "member-one" } });
  fireEvent.keyDown(memberInput, { key: "Enter" });
  await waitFor(() => expect(screen.getByLabelText("선택한 OTW 멤버")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /검토하기/ }));
  await screen.findByText("관리자에게 전할 메모 (선택)");
};

describe("OtwPlaySubmissionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.members.mockResolvedValue([member]);
    mocks.preflight.mockResolvedValue(preflight);
    mocks.create.mockRejectedValue(new Error("network failed"));
  });
  afterEach(cleanup);

  it("shows the canonical video preview and blocks a duplicate without losing the URL", async () => {
    mocks.preflight.mockResolvedValueOnce({ ...preflight, duplicate: "pending" });
    renderPage();
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));

    expect((await screen.findAllByText(/검토 중인 영상/)).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("https://youtu.be/dQw4w9WgXcQ")).toBeTruthy();
    expect(screen.queryByLabelText("곡명 *")).toBeNull();
  });

  it("searches candidates explicitly, prefills the snapshot, and clears the selection", async () => {
    renderPage();
    await verifyVideo();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "찾을 곡" } });
    mocks.preflight.mockResolvedValueOnce({
      ...preflight,
      songCandidates: [{ id: "song-one", title: "기존 곡", originalArtists: ["기존 가수"] }],
    });
    fireEvent.click(screen.getByRole("button", { name: /기존 곡 찾기/ }));
    fireEvent.click(await screen.findByRole("button", { name: /기존 곡.*기존 가수/ }));

    expect(screen.getByDisplayValue("기존 곡")).toBeTruthy();
    expect(screen.getAllByText("기존 가수").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    expect(screen.getByRole("radio", { name: /새 곡으로 제안/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("adds chips only explicitly and supports keyboard member autocomplete", async () => {
    renderPage();
    await verifyVideo();
    const artistInput = screen.getByLabelText("원곡 가수 *");
    fireEvent.change(artistInput, { target: { value: "가수 A" } });
    fireEvent.blur(artistInput);
    expect(screen.queryByText("가수 A")).toBeNull();
    fireEvent.keyDown(artistInput, { key: "Enter" });
    expect(screen.getByText("가수 A")).toBeTruthy();

    fireEvent.change(artistInput, { target: { value: "  가수 A  " } });
    fireEvent.keyDown(artistInput, { key: "Enter" });
    expect(screen.getByRole("alert", { name: "" }).textContent).toContain("이미 추가한 이름");

    const memberInput = screen.getByLabelText("OTW 참여 멤버");
    fireEvent.change(memberInput, { target: { value: "Unit" } });
    expect(await screen.findByRole("option", { name: /멤버 한명/ })).toBeTruthy();
    fireEvent.keyDown(memberInput, { key: "Enter" });
    expect(screen.getByLabelText("선택한 OTW 멤버").textContent).toContain("멤버 한명");
  });

  it("submits the selected singing role for each participant", async () => {
    renderPage();
    await verifyVideo();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "테스트 커버" } });
    const artistInput = screen.getByLabelText("원곡 가수 *");
    fireEvent.change(artistInput, { target: { value: "원곡 가수" } });
    fireEvent.keyDown(artistInput, { key: "Enter" });
    const memberInput = screen.getByLabelText("OTW 참여 멤버");
    fireEvent.change(memberInput, { target: { value: "member-one" } });
    fireEvent.keyDown(memberInput, { key: "Enter" });

    fireEvent.click(await screen.findByLabelText("🎵 멤버 한명 가창 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "코러스" }));
    fireEvent.click(screen.getByRole("button", { name: /검토하기/ }));
    expect(await screen.findByText(/멤버 한명 · 코러스/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]?.[0].participants).toEqual([
      { kind: "member", memberUid: 1, participantRole: "chorus" },
    ]);
  });

  it("keeps wizard values and the idempotency key after a submit failure", async () => {
    renderPage();
    await verifyVideo();
    await completeDetails();
    fireEvent.change(screen.getByLabelText("관리자에게 전할 메모 (선택)"), {
      target: { value: "이 입력은 유지되어야 합니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
    await screen.findByText("제안 제출에 실패했습니다.");

    expect(screen.getByDisplayValue("이 입력은 유지되어야 합니다.")).toBeTruthy();
    const firstRequestId = mocks.create.mock.calls[0]?.[0].clientRequestId;
    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0].clientRequestId).toBe(firstRequestId);
  });

  it("keeps the authoritative success result until the member starts another proposal", async () => {
    mocks.create.mockResolvedValue({ data: submission, idempotentReplay: false });
    renderPage();
    await verifyVideo();
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));

    expect(await screen.findByText("곡 제안 접수 완료")).toBeTruthy();
    expect(screen.getByRole("link", { name: "내 제안에서 확인" }).getAttribute("href")).toBe("/play/submissions");
    expect(screen.queryByLabelText("YouTube 영상 URL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 곡 제안" }));
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe("");
  });

  it("registers route and browser-leave protection while the form is dirty", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "draft" } });
    const latestOptions = mocks.blocker.mock.calls.at(-1)?.[0];
    expect(latestOptions.disabled).toBe(false);
    expect(latestOptions.enableBeforeUnload).toBe(true);
  });
});
