// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  preflight: vi.fn(),
  members: vi.fn(),
}));
vi.mock("../../api/submissions", () => ({
  createOtwPlaySubmission: mocks.create,
  preflightOtwPlaySubmission: mocks.preflight,
}));
vi.mock("@/features/members", () => ({ fetchActiveMembers: mocks.members }));

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

describe("OtwPlaySubmissionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.members.mockResolvedValue([member]);
    mocks.preflight.mockResolvedValue({
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      duplicate: null,
      songCandidates: [],
    });
    mocks.create.mockRejectedValue(new Error("network failed"));
  });
  afterEach(cleanup);

  it("keeps the wizard values and idempotency key after a submit failure", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
    await screen.findByLabelText("곡명");

    fireEvent.change(screen.getByLabelText("곡명"), {
      target: { value: "테스트 커버" },
    });
    const chipInputs = screen.getAllByPlaceholderText("이름 입력 후 Enter");
    fireEvent.change(chipInputs[0]!, { target: { value: "원곡 가수" } });
    fireEvent.keyDown(chipInputs[0]!, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /멤버 한명/ }));
    fireEvent.click(screen.getByRole("button", { name: /검토하기/ }));

    expect(await screen.findByText("테스트 커버")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("관리자에게 전할 메모 (선택)"), {
      target: { value: "이 입력은 유지되어야 합니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
    await screen.findByText("제안 제출에 실패했습니다.");

    expect(screen.getByDisplayValue("이 입력은 유지되어야 합니다.")).toBeTruthy();
    expect(screen.getByText("테스트 커버")).toBeTruthy();
    const firstRequestId = mocks.create.mock.calls[0]?.[0].clientRequestId;

    fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0].clientRequestId).toBe(firstRequestId);
  });
});
