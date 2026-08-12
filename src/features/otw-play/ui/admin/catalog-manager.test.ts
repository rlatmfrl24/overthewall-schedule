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
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";

const fetchCatalogMock = vi.hoisted(() => vi.fn());
const fetchProposalsMock = vi.hoisted(() => vi.fn());
const updateEntityMock = vi.hoisted(() => vi.fn());
const preflightEntryMock = vi.hoisted(() => vi.fn());
const createEntryMock = vi.hoisted(() => vi.fn());
const fetchMembersMock = vi.hoisted(() => vi.fn());
const rejectProposalMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/admin")>();
  return {
    ...actual,
    fetchOtwPlayAdminCatalog: fetchCatalogMock,
    fetchOtwPlayAdminProposals: fetchProposalsMock,
    updateOtwPlayEntity: updateEntityMock,
    preflightOtwPlayCatalogEntry: preflightEntryMock,
    createOtwPlayCatalogEntry: createEntryMock,
    rejectOtwPlayProposal: rejectProposalMock,
  };
});

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/features/members", () => ({
  fetchActiveMembers: fetchMembersMock,
}));

const catalog = {
  revision: 7,
  readModelRevision: 7,
  songs: [],
  performances: [],
  entities: [],
  channels: [],
};

const proposal = {
  id: "proposal-1",
  submittedByUserId: "member-1",
  submittedUrl: "https://youtu.be/dQw4w9WgXcQ",
  youtubeVideoId: "dQw4w9WgXcQ",
  segmentStartSeconds: 0,
  submittedTitle: "검수할 공식 커버",
  suggestedSongId: null,
  submittedNote: "제출 메모",
  status: "pending_review" as const,
  version: 2,
  reviewedByUserId: null,
  reviewedAt: null,
  reviewResultCode: null,
  reviewNote: null,
  approvedPerformanceId: null,
  createdAt: 1_788_000_000_000,
  participants: [
    {
      creditOrder: 0,
      resolvedEntityId: null,
      submittedNameSnapshot: "참여자",
      participantRole: "vocal" as const,
    },
  ],
  originalArtists: [
    {
      creditOrder: 0,
      resolvedEntityId: null,
      submittedNameSnapshot: "원곡 가수",
    },
  ],
};

describe("OtwPlayCatalogManager", () => {
  beforeEach(() => {
    fetchCatalogMock.mockResolvedValue(catalog);
    fetchProposalsMock.mockResolvedValue([proposal]);
    rejectProposalMock.mockResolvedValue({
      data: { ...proposal, status: "rejected", version: 3 },
      catalogRevision: 7,
    });
    updateEntityMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    fetchMembersMock.mockResolvedValue([
      {
        uid: 1,
        code: "member",
        name: "현재 멤버",
        oshi_mark: "🌙",
        unit_name: "테스트 유닛",
      },
    ]);
    preflightEntryMock.mockResolvedValue({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "확인된 영상",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: 1,
        availabilityStatus: "playable",
        channelId: `UC${"M".repeat(22)}`,
        channelTitle: "현재 멤버 채널",
      },
      channel: {
        state: "recognized_member",
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: "member_main",
        memberUid: 1,
      },
      duplicate: null,
    });
    createEntryMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps proposal approval closed while showing the no-cookie review player", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    const player = await screen.findByTitle("검수할 공식 커버 검수 영상");
    expect(player.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(
      (screen.getByRole("button", { name: "승인" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/GATE-01이 확정될 때까지/)).toBeTruthy();
  });

  it("rejects with an internal reason and then refetches authoritative state", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    const rejectButton = await screen.findByRole("button", { name: "거절" });
    expect((rejectButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("검수할 공식 커버 거절 코드"), {
      target: { value: "duplicate" },
    });
    fireEvent.click(rejectButton);

    await waitFor(() =>
      expect(rejectProposalMock).toHaveBeenCalledWith("proposal-1", {
        expectedVersion: 2,
        resultCode: "duplicate",
      }),
    );
    await waitFor(() => {
      expect(fetchCatalogMock.mock.calls.length).toBeGreaterThan(1);
      expect(fetchProposalsMock.mock.calls.length).toBeGreaterThan(1);
    });
    expect(toastMock).toHaveBeenCalledWith({
      variant: "success",
      description: "제안 거절 작업을 완료했습니다.",
    });
  });

  it("keeps advanced identity edits after a failed command without exposing slug editing", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      entities: [
        {
          id: "external-1",
          memberUid: null,
          entityKind: "person",
          displayName: "외부 인물",
          normalizedName: "외부 인물",
          slug: "external-person-a1b2c3d4",
          version: 2,
          archivedAt: null,
        },
      ],
    });
    updateEntityMock.mockRejectedValueOnce(new Error("write failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("button", { name: "고급 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "외부 인물 수정" }));
    const nameInput = screen.getByLabelText(
      "외부 identity 표시명",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "입력 보존" } });
    expect(screen.queryByLabelText(/slug/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        variant: "error",
        description: "외부 identity 수정 작업에 실패했습니다.",
      }),
    );
    expect(nameInput.value).toBe("입력 보존");
    consoleError.mockRestore();
  });

  it("presents advanced channel data as a labeled correction form", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("button", { name: "고급 관리" }));

    expect(screen.getByText("채널 수동 등록")).toBeTruthy();
    expect(screen.getByText(/예외 보정용/)).toBeTruthy();
    const channelId = screen.getByLabelText("YouTube channel ID");
    const displayName = screen.getByLabelText("채널 표시명");
    const submit = screen.getByRole("button", { name: "채널 확인 후 등록" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(channelId, { target: { value: `UC${"F".repeat(22)}` } });
    fireEvent.change(displayName, { target: { value: "정리된 공식 채널" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("채널 역할")).toBeTruthy();
    expect(screen.getByText("등록된 채널")).toBeTruthy();
  });

  it("disables catalog writes while the public read model revision is stale", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      revision: 8,
      readModelRevision: 7,
    });
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "관리자 쓰기를 중단했습니다",
    );
    fireEvent.click(screen.getByRole("button", { name: "고급 관리" }));
    expect(
      (screen.getByRole("button", { name: "채널 확인 후 등록" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows only workflow sections and suggests current members without a prerequisite identity screen", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    await screen.findByText("OTW Play 카탈로그");
    expect(screen.getByRole("button", { name: "카탈로그" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "제안 검수" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "곡" })).toBeNull();
    expect(screen.queryByRole("button", { name: "가창" })).toBeNull();
    expect(screen.queryByRole("button", { name: "공식 채널" })).toBeNull();
    expect(screen.queryByRole("button", { name: "인물·그룹" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "새 영상 등록" }));
    const registrationDialog = await screen.findByRole("dialog", {
      name: "새 YouTube 영상 등록",
    });
    expect(registrationDialog.contains(document.activeElement)).toBe(true);
    fireEvent.change(await screen.findByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    expect(screen.queryByText("기존 곡 연결")).toBeNull();
    expect(screen.queryByText("새 곡 만들기")).toBeNull();
    const coverNext = screen.getByRole("button", { name: /다음/ });
    expect((coverNext as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "정식 원곡 제목" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "원곡 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    expect((coverNext as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    const participantSearch = screen.getByLabelText("가창 참여자 검색");
    fireEvent.change(participantSearch, {
      target: { value: "현재 멤버" },
    });
    await screen.findByRole("option", { name: /현재 멤버/ });
    fireEvent.keyDown(participantSearch, { key: "Enter" });
    expect(screen.getByText(/현재 멤버 🌙 · 테스트 유닛/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 멤버 제거" }));
    expect(screen.queryByText(/현재 멤버 🌙 · 테스트 유닛/)).toBeNull();
    fireEvent.change(participantSearch, { target: { value: "현재 멤버" } });
    fireEvent.keyDown(participantSearch, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "게시" }));
    await screen.findByText("이 영상을 게시할까요?");
    const publishButtons = screen.getAllByRole("button", { name: "게시" });
    fireEvent.click(publishButtons[publishButtons.length - 1]!);
    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicationTarget: "published",
          participants: [
            expect.objectContaining({
              subject: { kind: "member", memberUid: 1 },
            }),
          ],
          channel: {
            kind: "recognized_member",
            memberUid: 1,
            channelRole: "member_main",
          },
          relationType: "cover",
          song: {
            kind: "create",
            title: "정식 원곡 제목",
            isOtwOriginal: false,
            originalReleaseDate: null,
            originalReleasePrecision: "unknown",
            aliases: [],
            originalArtists: [
              {
                subject: {
                  kind: "new_external",
                  clientKey: expect.any(String),
                  displayName: "원곡 가수",
                  entityKind: "person",
                },
                creditOrder: 0,
                isPrimary: true,
              },
            ],
          },
        }),
      ),
    );
  });

  it("shows the actionable preflight API error and request id", async () => {
    preflightEntryMock.mockRejectedValueOnce(
      new ApiError("YouTube metadata is temporarily unavailable", 503, {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        fields: { youtube: "YouTube metadata request returned 403" },
        requestId: "request-preflight-1",
      }),
    );
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: {
        value:
          "https://www.youtube.com/watch?v=ASRCBcCY_qE&list=RDASRCBcCY_qE&start_radio=1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "YouTube metadata request returned 403",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "request-preflight-1",
    );
  });

  it("uses original-song participants as original artists without a song-link step", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: "original",
          song: { kind: "from_video" },
        }),
      ),
    );
  });

  it("keeps karaoke broadcasts out of the current catalog command", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /노래방송/ }));

    expect(
      screen.getByText(/다곡·타임스탬프 연결 기능이 준비될 때까지/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /다음/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createEntryMock).not.toHaveBeenCalled();
  });

  it("requires an explicit owner before saving an unknown channel", async () => {
    preflightEntryMock.mockResolvedValueOnce({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "미등록 채널 영상",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: 1,
        availabilityStatus: "playable",
        channelId: `UC${"U".repeat(22)}`,
        channelTitle: "미등록 채널",
      },
      channel: {
        state: "unknown",
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: null,
        memberUid: null,
      },
      duplicate: null,
    });
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText("채널: 미등록");
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "미등록 채널 원곡" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "미등록 채널 원곡 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));

    const nextButton = screen.getByRole("button", { name: /다음/ });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("채널 소유·연결 주체 검색"), {
      target: { value: "현재 멤버" },
    });
    const currentMemberButtons = await screen.findAllByRole("option", {
      name: /현재 멤버/,
    });
    fireEvent.click(currentMemberButtons[currentMemberButtons.length - 1]!);
    expect((nextButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextButton);
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicationTarget: "draft",
          channel: expect.objectContaining({
            kind: "pending",
            owners: [{ kind: "member", memberUid: 1 }],
          }),
        }),
      ),
    );
  });

  it("keeps the registration step and chips after an integrated command failure", async () => {
    createEntryMock.mockRejectedValueOnce(new Error("stale revision"));
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "실패 후 보존 원곡" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "입력 보존 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    expect((await screen.findByRole("alert")).textContent).toContain("stale revision");
    expect(screen.getByRole("dialog", { name: "새 YouTube 영상 등록" })).toBeTruthy();
    expect(screen.getAllByText(/현재 멤버/).length).toBeGreaterThan(0);
    expect(screen.getByText("실패 후 보존 원곡")).toBeTruthy();
    expect(screen.getByText(/입력 보존 가수/)).toBeTruthy();
  });
});
