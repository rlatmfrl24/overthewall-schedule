import { createMemberFixture } from "@/test/member-fixtures";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchArtists: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  preflight: vi.fn(),
  members: vi.fn(),
  registerDirty: vi.fn(),
  editDetail: vi.fn(),
}));
vi.mock("../../api/submissions", () => ({
  searchOtwPlaySubmissionArtists: mocks.searchArtists,
  createOtwPlaySubmission: mocks.create,
  preflightOtwPlaySubmission: mocks.preflight,
  updateOtwPlaySubmission: mocks.update,
}));
vi.mock("@/features/members", () => ({ fetchActiveMembers: mocks.members }));
vi.mock("../../queries/use-member-submissions", () => ({
  useMyOtwPlaySubmission: mocks.editDetail,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

import { OtwPlaySubmissionPage } from "./submission-page";

const member = createMemberFixture({
    uid: 1,
    code: "member-one",
    name: "멤버 한명",
    oshi_mark: "🎵",
    youtube_channel_id: "UC123",
    unit_name: "Unit",
    is_deprecated: false
  });

const preflight = {
  video: { title: "영상 제목", channelName: "업로더", durationSeconds: 180 },
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
  tags: ["J-POP"],
  note: null,
  status: "pending_review",
  createdAt: 1,
  updatedAt: 1,
  originalArtists: [{ creditOrder: 0, displayName: "원곡 가수" }],
  participants: [{ creditOrder: 0, displayName: "멤버 한명", participantRole: "vocal" }],
  approvedSong: null,
} as const;

const renderPage = (editId?: string) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OtwPlaySubmissionPage editId={editId} initialKind="official_cover" />
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

const startNewSong = async () => {
  fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "테스트 커버" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(await screen.findByRole("button", { name: "새 곡 추가" }));
};

const completeDetails = async () => {
  if (!screen.queryByLabelText("원곡 가수 *")) await startNewSong();
  fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "테스트 커버" } });
  const artistInput = screen.getByLabelText("원곡 가수 *");
  fireEvent.change(artistInput, { target: { value: "원곡 가수" } });
  fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
  fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));
  await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(member.name) }).getAttribute("aria-pressed")).toBe("true"));
  fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
  await screen.findByText("관리자에게 전할 메모 (선택)");
};

describe("OtwPlaySubmissionPage", () => {
  it("searches first and submits the selected existing artist ID", async () => {
    mocks.searchArtists.mockResolvedValue([{ entityId: "iu", displayName: "아이유", memberUid: null, entityKind: "person" }]);
    renderPage();
    await verifyVideo(); await startNewSong();
    fireEvent.change(screen.getByLabelText("원곡 가수 *"), { target: { value: "IU" } });
    expect(screen.queryByRole("button", { name: /새 가수로 추가/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /아이유/ }));
    expect(mocks.searchArtists).toHaveBeenCalledWith("IU");
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "검수 요청하기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      originalArtists: [{ kind: "external", displayName: "아이유", entityId: "iu" }],
    })));
  });

  it("does not offer new artists on search failure or use a stale search result", async () => {
    mocks.searchArtists.mockRejectedValue(new Error("offline"));
    renderPage(); await verifyVideo(); await startNewSong();
    fireEvent.change(screen.getByLabelText("원곡 가수 *"), { target: { value: "IU" } });
    await screen.findByText("가수 검색에 실패했습니다. 다시 검색해 주세요.");
    expect(screen.queryByRole("button", { name: /새 가수로 추가/ })).toBeNull();
    mocks.searchArtists.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
    await screen.findByRole("button", { name: /새 가수로 추가/ });
    fireEvent.change(screen.getByLabelText("원곡 가수 *"), { target: { value: "다른 가수" } });
    expect(screen.queryByRole("button", { name: /새 가수로 추가/ })).toBeNull();
  });

  beforeEach(() => {
    // jsdom has no layout engine; content resizing is also verified in the browser.
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.searchArtists.mockReset().mockResolvedValue([]);
    mocks.members.mockResolvedValue([member]);
    mocks.preflight.mockResolvedValue(preflight);
    mocks.create.mockRejectedValue(new Error("network failed"));
    mocks.update.mockRejectedValue(new Error("network failed"));
    mocks.editDetail.mockReturnValue({ isPending: false, data: null });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps the final step visible and locks navigation until the save settles", async () => {
    let rejectSave!: (reason: Error) => void;
    mocks.create.mockReturnValueOnce(new Promise((_, reject) => { rejectSave = reject; }));
    renderPage();
    expect((screen.getByRole("button", { name: "4. 확인" }) as HTMLButtonElement).disabled).toBe(true);
    await verifyVideo();
    await startNewSong();
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));
    await screen.findByRole("button", { name: "제출 중" });
    expect(screen.getByRole("heading", { name: "이 내용으로 보낼까요?" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "2. 노래" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "노래 수정" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => rejectSave(new Error("offline")));
    await screen.findByRole("button", { name: "검수 요청하기" });
    fireEvent.click(screen.getByRole("button", { name: "2. 노래" }));
    expect(screen.getByRole("heading", { name: "어떤 노래인가요?" })).toBeTruthy();
    expect((screen.getByLabelText("곡명 *") as HTMLInputElement).value).toBe("테스트 커버");
  });

  it("separates song and singer questions while retaining input between steps", async () => {
    renderPage();
    await verifyVideo();
    await startNewSong();
    expect(screen.getByRole("heading", { name: "어떤 노래인가요?" })).toBeTruthy();
    expect(screen.queryByLabelText("OTW 참여 멤버 *")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "J-POP" }));
    fireEvent.change(screen.getByLabelText("원곡 가수 *"), { target: { value: "원곡 가수" } });
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    expect(screen.getByRole("heading", { name: "누가 불렀나요?" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("장르(분류)")).toBeNull());
    fireEvent.change(screen.getByLabelText("외부 참여자"), { target: { value: "게스트" } });
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    expect(screen.queryByPlaceholderText("멤버 이름·코드·유닛 검색")).toBeNull();
    expect(screen.queryByText("테스트 커버")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    expect(document.activeElement).toBe(screen.getByLabelText("OTW 참여 멤버 *"));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(member.name) }));
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    expect(screen.getByRole("heading", { name: "이 내용으로 보낼까요?" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "가창자" })).getByText("게스트")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "노래 수정" }));
    expect(screen.getByLabelText("선택한 장르(분류)").textContent).toContain("J-POP");
    expect(screen.getByRole("button", { name: "원곡 가수 제거" })).toBeTruthy();
  });

  it("shows the canonical video preview and blocks a duplicate without losing the URL", async () => {
    mocks.preflight.mockResolvedValueOnce({ ...preflight, duplicate: "pending" });
    renderPage();
    expect(screen.getByText("노래 영상 추가 제안")).toBeTruthy();
    expect(screen.getByRole("link", { name: "OTW Play로 돌아가기" }).getAttribute("href")).toBe("/play");
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));

    expect((await screen.findAllByText(/검토 중인 영상/)).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("https://youtu.be/dQw4w9WgXcQ")).toBeTruthy();
    expect(screen.queryByLabelText("곡명 *")).toBeNull();
  });

  it("preserves the URL and focuses it after metadata failure, then retries normally", async () => {
    mocks.preflight.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    const retry = await screen.findByRole("button", { name: "영상 확인 다시 시도" });
    expect(document.activeElement).toBe(screen.getByLabelText("YouTube 영상 URL"));
    expect(screen.getByDisplayValue("https://youtu.be/dQw4w9WgXcQ")).toBeTruthy();
    fireEvent.click(retry);
    await screen.findByLabelText("곡명 *");
    expect(mocks.preflight).toHaveBeenCalledTimes(2);
  });

  it("ignores a late preflight response after the URL changes", async () => {
    let resolvePreflight!: (value: typeof preflight) => void;
    mocks.preflight.mockReturnValueOnce(new Promise((resolve) => {
      resolvePreflight = resolve;
    }));
    renderPage();
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), {
      target: { value: "https://youtu.be/AAAAAAAAAAA" },
    });
    await act(async () => resolvePreflight(preflight));
    expect(screen.queryByLabelText("곡명 *")).toBeNull();
    expect(screen.getByDisplayValue("https://youtu.be/AAAAAAAAAAA")).toBeTruthy();
  });

  it("discards browser drafts and starts blank after leaving the page or restoring from BFCache", async () => {
    sessionStorage.setItem("otw-play:member-submission-draft:v1", JSON.stringify({ youtubeUrl: "old input", title: "old song" }));
    sessionStorage.setItem("unrelated-draft", "keep");
    const first = renderPage();
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    expect(sessionStorage.getItem("otw-play:member-submission-draft:v1")).toBeNull();
    first.unmount();
    renderPage();
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "another input" } });
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => { window.dispatchEvent(restored); });
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe("");
    expect(sessionStorage.getItem("unrelated-draft")).toBe("keep");
  });

  it("ignores an old edit draft and uses the saved proposal with its server version", async () => {
    sessionStorage.setItem(
      "otw-play:member-submission-draft:v1:edit:proposal-one",
      JSON.stringify({
        step: 2,
        clientRequestId: "request-one",
        expectedVersion: 6,
        youtubeUrl: "https://youtu.be/BBBBBBBBBBB",
        title: "저장하지 않은 제목",
        songMode: "new",
        suggestedSongId: null,
        originalArtists: ["수정 중인 가수"],
        memberUids: [1],
        externalParticipants: [],
        memberRoles: { 1: "vocal" },
        externalRoles: {},
        note: "저장하지 않은 메모",
        preflight,
      }),
    );
    mocks.editDetail.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        ...submission,
        version: 7,
        editable: true,
        withdrawable: true,
        originalArtists: [{
          creditOrder: 0,
          memberUid: null,
          displayName: "원곡 가수",
        }],
        participants: [{
          creditOrder: 0,
          memberUid: 1,
          displayName: "멤버 한명",
          participantRole: "vocal",
        }],
      },
    });

    renderPage("proposal-one");

    expect(screen.queryByText("저장하지 않은 제목")).toBeNull();
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe(preflight.canonicalUrl);
    expect(sessionStorage.getItem("otw-play:member-submission-draft:v1:edit:proposal-one")).toBeNull();
    await verifyVideo();
    expect((screen.getByLabelText("곡명 *") as HTMLInputElement).value).toBe("테스트 커버");
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      "proposal-one",
      expect.objectContaining({ expectedVersion: 7, title: "테스트 커버" }),
    ));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("searches candidates explicitly, prefills the snapshot, and clears the selection", async () => {
    renderPage();
    await verifyVideo();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "찾을 곡" } });
    mocks.preflight.mockResolvedValueOnce({
      ...preflight,
      songCandidates: [{ id: "song-one", title: "기존 곡", originalArtists: ["기존 가수"] }],
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: /기존 곡.*기존 가수/ }));

    expect(screen.getByText("연결한 곡")).toBeTruthy();
    expect(screen.queryByLabelText("원곡 가수 *")).toBeNull();
    expect(screen.getAllByText("기존 가수").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "다른 곡 검색" }));
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "새 곡 추가" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    expect(screen.getByRole("alert").textContent).toContain("곡명과 원곡 가수");
  });

  it("requires a successful search before new-song entry and discards stale results", async () => {
    renderPage();
    await verifyVideo();
    expect(screen.queryByLabelText("원곡 가수 *")).toBeNull();
    expect(screen.queryByRole("button", { name: "새 곡 추가" })).toBeNull();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "첫 검색" } });
    mocks.preflight.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    await screen.findByText("기존 곡 검색에 실패했습니다.");
    expect(screen.queryByRole("button", { name: "새 곡 추가" })).toBeNull();
    let resolveSearch!: (value: typeof preflight) => void;
    mocks.preflight.mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "다른 곡" } });
    await act(async () => resolveSearch(preflight));
    await waitFor(() => expect(screen.getByRole("button", { name: "검색" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("button", { name: "새 곡 추가" })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("곡명 *"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "새 곡 추가" }));
    expect(screen.getByDisplayValue("다른 곡")).toBeTruthy();
    expect(screen.getByLabelText("원곡 가수 *")).toBeTruthy();
  });

  it("submits the selected catalog song without requiring new-song inputs", async () => {
    renderPage();
    await verifyVideo();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "기존 곡" } });
    mocks.preflight.mockResolvedValueOnce({ ...preflight, songCandidates: [{ id: "song-one", title: "기존 곡", originalArtists: ["기존 가수"] }] });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: /기존 곡.*기존 가수/ }));
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "검수 요청하기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ suggestedSongId: "song-one", title: "기존 곡", tags: [], originalArtists: [{ kind: "external", displayName: "기존 가수" }] })));
  });

  it("adds chips explicitly and selects member cards without a search field", async () => {
    renderPage();
    await verifyVideo();
    await startNewSong();
    const artistInput = screen.getByLabelText("원곡 가수 *");
    fireEvent.change(artistInput, { target: { value: "가수 A" } });
    fireEvent.blur(artistInput);
    expect(screen.queryByText("가수 A")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    expect(screen.getByText("가수 A")).toBeTruthy();

    fireEvent.change(artistInput, { target: { value: "  가수 A  " } });
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    expect(screen.getByRole("alert", { name: "" }).textContent).toContain("이미 추가한 이름");
    fireEvent.change(artistInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    expect(await screen.findByRole("button", { name: /멤버 한명/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));
    expect(screen.getByRole("button", { name: /멤버 한명/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("submits the selected singing role for each participant", async () => {
    renderPage();
    await verifyVideo();
    fireEvent.change(screen.getByLabelText("곡명 *"), { target: { value: "테스트 커버" } });
    await startNewSong();
    const artistInput = screen.getByLabelText("원곡 가수 *");
    fireEvent.change(artistInput, { target: { value: "원곡 가수" } });
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));

    fireEvent.click(await screen.findByLabelText("🎵 멤버 한명 가창 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "코러스" }));
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    expect(await within(screen.getByRole("region", { name: "가창자" })).findByText("OTW 멤버 · 코러스")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]?.[0].participants).toEqual([
      { kind: "member", memberUid: 1, participantRole: "chorus" },
    ]);
  });

  it("submits editable genre classifications only for a new song", async () => {
    renderPage();
    await verifyVideo();
    await startNewSong();
    fireEvent.click(screen.getByRole("button", { name: "J-POP" }));
    expect(screen.getByLabelText("선택한 장르(분류)").textContent).toContain("J-POP");
    await completeDetails();
    expect(within(screen.getByRole("region", { name: "노래 정보" })).getByText("장르(분류)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]?.[0].tags).toEqual(["J-POP"]);
  });

  it("keeps wizard values and the idempotency key after a submit failure", async () => {
    renderPage();
    await verifyVideo();
    await completeDetails();
    fireEvent.change(screen.getByLabelText("관리자에게 전할 메모 (선택)"), {
      target: { value: "이 입력은 유지되어야 합니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));
    await screen.findByText("제안 제출에 실패했습니다.");

    expect(screen.getByDisplayValue("이 입력은 유지되어야 합니다.")).toBeTruthy();
    const firstRequestId = mocks.create.mock.calls[0]?.[0].clientRequestId;
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0].clientRequestId).toBe(firstRequestId);
  });

  it("keeps the authoritative success result until the member starts another proposal", async () => {
    mocks.create.mockResolvedValue({ data: submission, idempotentReplay: false });
    renderPage();
    await verifyVideo();
    await completeDetails();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청하기" }));

    expect(await screen.findByText("곡 제안 접수 완료")).toBeTruthy();
    expect(screen.getByRole("link", { name: "내 제안에서 확인" }).getAttribute("href")).toBe("/play/submissions");
    expect(screen.queryByLabelText("YouTube 영상 URL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 곡 제안" }));
    expect((screen.getByLabelText("YouTube 영상 URL") as HTMLInputElement).value).toBe("");
  });

  it("registers route and browser-leave protection while the form is dirty", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><UnsavedChangesContext value={{ register: mocks.registerDirty, confirm: async () => false }}><OtwPlaySubmissionPage /></UnsavedChangesContext></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "draft" } });
    expect(mocks.registerDirty.mock.calls.at(-1)?.[1]).toBe(true);
    const leave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
  });
  it("does not block navigation just because the entry point preselected a kind", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><UnsavedChangesContext value={{ register: mocks.registerDirty, confirm: async () => false }}><OtwPlaySubmissionPage initialKind="official_cover" /></UnsavedChangesContext></QueryClientProvider>);
    expect(mocks.registerDirty.mock.calls.at(-1)?.[1]).toBe(false);
    fireEvent.change(screen.getByLabelText("YouTube 영상 URL"), { target: { value: "draft" } });
    expect(mocks.registerDirty.mock.calls.at(-1)?.[1]).toBe(true);
  });
  it("requires explicit artist selection before continuing, including after IME composition", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /노래 클립.*방송에서/ }));
    await verifyVideo(); await startNewSong();
    fireEvent.change(screen.getByLabelText("원곡 가수 *"), { target: { value: "원곡 가수" } });
    fireEvent.keyDown(screen.getByLabelText("원곡 가수 *"), { key: "Enter", isComposing: true });
    expect(screen.queryByLabelText("원곡 가수 선택 목록")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    expect(screen.getByRole("alert").textContent).toContain("검색 결과에서 원곡 가수를 선택");
    fireEvent.click(await screen.findByRole("button", { name: /새 가수로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: "가창자 선택하기" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(member.name) }));
    fireEvent.change(screen.getByLabelText("방송일 (선택)"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "제안 내용 확인하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "검수 요청하기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ submissionKind: "singing_clip", broadcast: { performedOn: "2026-09-01", dateEvidence: null, originalUrl: null, extent: null }, originalArtists: [{ kind: "external", displayName: "원곡 가수" }] })));
  });

});
