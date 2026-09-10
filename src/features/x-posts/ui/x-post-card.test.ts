// @vitest-environment jsdom
import type { MemberDto } from "@contracts/members";
import type { XLinkedPostPreviewDto } from "@contracts/x-posts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { XPostViewModel } from "../model/types";
import { XPostCard } from "./x-post-card";

const makePost = (overrides: Partial<XPostViewModel> = {}): XPostViewModel => ({
  id: "p1",
  text: "링크 확인 https://t.co/link",
  createdAt: "2026-05-27T12:00:00Z",
  url: "https://x.com/otw/status/p1",
  username: "otw",
  metrics: {
    likeCount: 1,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
  },
  media: [],
  ...overrides,
});

const makeLinkedPost = (
  overrides: Partial<XLinkedPostPreviewDto> = {},
): XLinkedPostPreviewDto => ({
  id: "9876543210",
  text: "linked post body",
  createdAt: "2026-05-27T11:00:00Z",
  url: "https://x.com/linked/status/9876543210",
  username: "linked",
  name: "Linked Member",
  profileImageUrl: null,
  metrics: {
    likeCount: 7,
    replyCount: 1,
    repostCount: 2,
    quoteCount: 3,
  },
  media: [],
  ...overrides,
});

const member: MemberDto = {
  uid: 1,
  code: "otw",
  name: "테스트 멤버",
  main_color: "#123456",
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
};

const renderCard = (post: XPostViewModel, props = {}) =>
  render(createElement(XPostCard, { post, ...props }));

describe("XPostCard", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("프리뷰 가능한 링크는 본문 링크와 별도의 카드로 한 번만 표시한다", () => {
    renderCard(
      makePost({
        text: "링크 https://t.co/link https://t.co/link",
        links: [
          {
            url: "https://t.co/link",
            expandedUrl: "https://example.com/full",
            resolvedUrl: "https://example.com/full",
            displayUrl: "example.com/full",
            domain: "example.com",
            title: "Example Title",
            description: "Example description",
            imageUrl: "https://example.com/card.jpg",
            siteName: "Example",
            previewStatus: "ready",
          },
          {
            url: "https://t.co/link",
            expandedUrl: "https://example.com/full",
            displayUrl: "example.com/full",
            title: "Example Title",
            previewStatus: "ready",
          },
        ],
      }),
    );

    expect(screen.queryByRole("link", { name: "https://t.co/link" })).toBeNull();
    expect(screen.getAllByText("Example Title")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Example Title 열기" }).getAttribute("href"),
    ).toBe("https://example.com/full");
    fireEvent.error(screen.getByRole("img", { name: "링크 미리보기" }));
    expect(screen.getByText("이미지를 불러오지 못했습니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Example Title 열기" }).getAttribute("href")).toBe("https://example.com/full");
  });

  it("연결된 X 게시글 작성자와 본문, 미디어를 렌더링한다", () => {
    const { container } = renderCard(
      makePost({
        links: [
          {
            url: "https://t.co/link",
            expandedUrl: "https://x.com/linked/status/9876543210",
            displayUrl: "x.com/linked/status/9876543210",
            previewStatus: "ready",
            linkedPost: makeLinkedPost({
              media: [
                {
                  mediaKey: "m1",
                  type: "photo",
                  url: "https://pbs.twimg.com/media/photo.jpg",
                  previewImageUrl: null,
                  width: 1200,
                  height: 675,
                  altText: "linked media",
                },
              ],
            }),
          },
        ],
      }),
    );

    expect(screen.getByText("Linked Member")).toBeTruthy();
    expect(screen.getByText("linked post body")).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pbs.twimg.com/media/photo.jpg"]'),
    ).toBeTruthy();
  });

  it("프리뷰 정보가 없는 링크는 본문 원문 링크를 유지한다", () => {
    renderCard(
      makePost({
        links: [
          {
            url: "https://t.co/link",
            expandedUrl: null,
            displayUrl: null,
          },
        ],
      }),
    );

    expect(
      screen.getByRole("link", { name: "https://t.co/link" }).getAttribute("href"),
    ).toBe("https://t.co/link");
  });

  it("생략된 X status 프리뷰도 인라인 X 게시글 카드로 표시한다", () => {
    renderCard(
      makePost({
        links: [
          {
            url: "https://t.co/link",
            expandedUrl: "https://x.com/linked/status/9876543210",
            displayUrl: "x.com/linked/status/9876543210",
            previewStatus: "skipped",
          },
        ],
      }),
    );

    expect(screen.getByText("X 게시글 링크")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "x.com/linked/status/9876543210 열기" })
        .getAttribute("href"),
    ).toBe("https://x.com/linked/status/9876543210");
  });

  it("인용 게시글을 자동 노출하고 3줄로 축약하며 라벨과 중복 링크를 숨긴다", () => {
    const quoteId = "2059529979700846500";
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderCard(
      makePost({
        id: "2059529979700846592",
        text: "인용 내용 https://t.co/quote",
        links: [
          {
            url: "https://t.co/quote",
            expandedUrl: `https://x.com/linked/status/${quoteId}`,
            displayUrl: `x.com/linked/status/${quoteId}`,
            previewStatus: "ready",
          },
        ],
        quote: {
          postId: quoteId,
          post: makeLinkedPost({
            id: quoteId,
            url: `https://x.com/linked/status/${quoteId}`,
            text: "quoted post body",
          }),
        },
      }),
      {},
    );

    expect(screen.queryByText("인용")).toBeNull();
    expect(screen.queryByText("인용 게시글")).toBeNull();
    expect(screen.getAllByText("quoted post body")).toHaveLength(1);
    expect(screen.getByText("quoted post body").className).toContain("line-clamp-3");
    expect(screen.queryByText("https://t.co/quote")).toBeNull();
    const quoteLink = screen.getByRole("link", {
      name: "Linked Member 게시글 열기",
    });
    expect(quoteLink.getAttribute("href")).toBe(
      `https://x.com/linked/status/${quoteId}`,
    );
    quoteLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(quoteLink);
    expect(open).not.toHaveBeenCalled();
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("답글 맥락은 접혀 있고 펼치면 원문을 표시하며 선두 멘션만 제거한다", () => {
    const replyToPostId = "2059529979700846500";
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderCard(
      makePost({
        id: "2059529979700846592",
        text: "@parent @second\n실제 답글 @middle #오버더월",
        reply: {
          postId: replyToPostId,
          conversationId: replyToPostId,
          post: makeLinkedPost({
            id: replyToPostId,
            text: "parent post body",
            url: `https://x.com/parent/status/${replyToPostId}`,
            username: "parent",
            name: "Parent Member",
            media: [
              {
                mediaKey: "parent-media",
                type: "photo",
                url: "https://pbs.twimg.com/media/parent.jpg",
                previewImageUrl: null,
                width: 100,
                height: 100,
                altText: "parent media",
              },
            ],
          }),
        },
      }),
      {},
    );

    expect(screen.queryByText("parent post body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "대화 보기" }));
    const parentText = screen.getByText("parent post body");
    const replyText = screen.getByText((content, element) =>
      element?.tagName === "DIV" && content.includes("실제 답글"),
    );
    expect(
      replyText.compareDocumentPosition(parentText) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(parentText.className).toContain("line-clamp-2");
    expect(screen.queryByRole("link", { name: "@second" })).toBeNull();
    expect(screen.getByRole("link", { name: "@middle" }).getAttribute("href"))
      .toBe("https://x.com/middle");
    expect(screen.getByRole("link", { name: "#오버더월" })).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pbs.twimg.com/media/parent.jpg"]'),
    ).toBeTruthy();
    const parentLink = screen.getByRole("link", {
      name: "Parent Member 답글 원문 열기",
    });
    parentLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(parentLink);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText("답글")).toBeNull();
    expect(screen.queryByRole("button", { name: /관련 트윗/ })).toBeNull();
  });

  it("피드에서는 확보된 답글 원문을 바로 보여주고 접기 전환을 두지 않는다", () => {
    const parent = makeLinkedPost({ text: "함께 읽는 답글 원문" });
    const { container } = renderCard(makePost({ replyTargetMemberName: "답글 멤버",
      reply: { postId: parent.id, conversationId: null, post: parent } }), { appearance: "feed" });
    expect(screen.getByText("답글 멤버에게 답글")).toBeTruthy();
    expect(screen.getByText("함께 읽는 답글 원문")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /대화 보기|대화 접기/ })).toBeNull();
    const parentLink = screen.getByRole("link", { name: "Linked Member 답글 원문 열기" });
    expect(parentLink.getAttribute("href")).toBe(parent.url);
    expect(parentLink.getAttribute("target")).toBe("_blank");
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("작성자 정보가 없어도 확보된 답글 원문과 직접 링크를 표시한다", () => {
    const parent = makeLinkedPost({ username: "i", name: null, text: "확보된 원문", url: "https://x.com/i/web/status/9876543210" });
    renderCard(makePost({ reply: { postId: parent.id, conversationId: null, post: parent } }));
    fireEvent.click(screen.getByRole("button", { name: "대화 보기" }));
    expect(screen.getByText("작성자 정보 없음")).toBeTruthy();
    expect(screen.getByText("확보된 원문")).toBeTruthy();
    expect(screen.queryByText("@i")).toBeNull();
    expect(screen.getByRole("link", { name: "작성자 정보 없음 답글 원문 열기" }).getAttribute("href")).toBe(parent.url);
  });

  it("답글 원문의 이름이 없으면 계정명을 한 번만 표시한다", () => {
    const parent = makeLinkedPost({ name: null, username: "parent" });
    renderCard(makePost({ reply: { postId: parent.id, conversationId: null, post: parent } }), { appearance: "feed" });
    expect(screen.getAllByText("@parent")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "@parent 답글 원문 열기" })).toBeTruthy();
  });

  it.each([
    [undefined, undefined, "다른 게시글에 답글"],
    ["external", undefined, "@external에게 답글"],
    ["parent_member", "멤버 이름", "멤버 이름에게 답글"],
  ])("미확보 답글은 관계와 직접 대상 링크로 정상 표시한다 (%s)", (targetUsername, replyTargetMemberName, label) => {
    renderCard(makePost({ replyTargetMemberName,
      reply: { postId: "parent", conversationId: "thread-root", targetUsername, post: null } }));
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("link", { name: "답글 원문 열기" }).getAttribute("href"))
      .toBe("https://x.com/i/web/status/parent");
    expect(screen.queryByRole("button", { name: "저장된 원문 다시 확인" })).toBeNull();
    expect(screen.queryByText(/준비되지/)).toBeNull();
  });

  it("미디어로 표시되는 URL만 있는 본문도 중복 링크를 되살리지 않는다", () => {
    renderCard(makePost({ id: "123456789", text: "https://t.co/photo", links: [{ url: "https://t.co/photo", expandedUrl: "https://x.com/otw/status/123456789/photo/1", displayUrl: null }], media: [{ mediaKey: "photo", type: "photo", url: "https://example.com/photo.jpg", previewImageUrl: null, width: 100, height: 100, altText: "사진" }] }));
    expect(screen.queryByText("https://t.co/photo")).toBeNull();
    expect(screen.getByRole("button", { name: /이미지 1 확대/ })).toBeTruthy();
  });

  it("멘션과 해시태그를 X 링크로 만들고 헤더에 정확한 작성 시각을 노출한다", () => {
    const createdAt = "2026-05-27T12:00:34Z";
    renderCard(
      makePost({
        text: "안녕하세요 @otw_member #오버더월",
        createdAt,
      }),
    );

    expect(screen.getByRole("link", { name: "@otw_member" }).getAttribute("href"))
      .toBe("https://x.com/otw_member");
    expect(screen.getByRole("link", { name: "#오버더월" }).getAttribute("href"))
      .toBe(`https://x.com/hashtag/${encodeURIComponent("오버더월")}`);
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "TIME" && element.getAttribute("datetime") === createdAt,
      ),
    ).toBeTruthy();
  });

  it("카페 카드와 동일한 좌측 정렬 푸터와 멤버 컬러를 사용한다", () => {
    const { container } = renderCard(
      makePost({
        metrics: {
          replyCount: 0,
          repostCount: 2,
          quoteCount: 3,
          likeCount: 7,
        },
      }),
      { member },
    );

    const article = container.querySelector("article");
    const footer = screen.getByLabelText("답글 0개").parentElement;
    expect(article?.className).toContain("p-3");
    expect(article?.className).toContain("sm:p-4");
    expect(article?.className).toContain("border-l-4");
    expect(article?.style.borderLeftColor).toBe("rgb(18, 52, 86)");
    expect(footer?.className).toContain("flex");
    expect(footer?.className).not.toContain("grid-cols-4");
    expect(screen.getByLabelText("답글 0개").textContent).toBe("");
    expect(screen.getByLabelText("재게시 5개").textContent).toBe("5");
    expect(screen.getByLabelText("좋아요 7개").textContent).toBe("7");
    expect(screen.getByRole("button", { name: /공유$/ })).toBeTruthy();
  });

  it("공유 버튼은 카드 이동 없이 Web Share를 사용한다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    const post = makePost();
    const { container } = renderCard(post, {});

    fireEvent.click(screen.getByRole("button", { name: /공유$/ }).querySelector("svg")!);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector("article")!);
    expect(open).not.toHaveBeenCalled();
  });

  it("Web Share가 없으면 같은 공유 버튼에서 링크 복사로 대체한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const post = makePost();
    renderCard(post, {});

    fireEvent.click(screen.getByRole("button", { name: /공유$/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(post.url));
    expect(screen.getByRole("status").textContent).toBe("링크 복사됨");
    expect(open).not.toHaveBeenCalled();
  });
});
