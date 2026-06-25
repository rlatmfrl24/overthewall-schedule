// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";
import {
  SCHEDULE_PLUS_EXTENSION_PROTOCOL,
  SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
} from "./schedule-plus-extension";
import type { MultiviewSource } from "./types";

const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useMultiviewSourcesMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("./use-multiview-sources", () => ({
  useMultiviewSources: useMultiviewSourcesMock,
}));

import { MultiviewPage } from "./multiview-page";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";
const CHANNEL_B = "19a1ed5c0829fa620fab900dba7e011c";

const makeMember = (uid: number, name: string, channelId: string): Member =>
  ({
    uid,
    code: `m${uid}`,
    name,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: `https://chzzk.naver.com/${channelId}`,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const memberA = makeMember(1, "라이브 멤버", CHANNEL_A);
const memberB = makeMember(2, "오프라인 멤버", CHANNEL_B);

const liveSource: MultiviewSource = {
  channelId: CHANNEL_A,
  member: memberA,
  isLive: true,
  liveStatus: {
    status: "OPEN",
    liveTitle: "테스트 라이브",
    channelName: "라이브 멤버",
    channelId: CHANNEL_A,
    concurrentUserCount: 1234,
  } as MultiviewSource["liveStatus"],
};

const offlineSource: MultiviewSource = {
  channelId: CHANNEL_B,
  member: memberB,
  isLive: false,
  liveStatus: null,
};

const renderPage = () => render(React.createElement(MultiviewPage));

type TestMediaQueryListener = (event?: MediaQueryListEvent) => void;

const installMatchMedia = (initialMatches: Record<string, boolean> = {}) => {
  const queries = new Map<
    string,
    { matches: boolean; listeners: Set<TestMediaQueryListener> }
  >();
  const getQuery = (query: string) => {
    let mediaQuery = queries.get(query);

    if (!mediaQuery) {
      mediaQuery = {
        matches: initialMatches[query] ?? false,
        listeners: new Set<TestMediaQueryListener>(),
      };
      queries.set(query, mediaQuery);
    }

    return mediaQuery;
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const mediaQuery = getQuery(query);

      return {
        get matches() {
          return mediaQuery.matches;
        },
        media: query,
        onchange: null,
        addEventListener: vi.fn(
          (_event: string, listener: TestMediaQueryListener) => {
            mediaQuery.listeners.add(listener);
          },
        ),
        removeEventListener: vi.fn(
          (_event: string, listener: TestMediaQueryListener) => {
            mediaQuery.listeners.delete(listener);
          },
        ),
        addListener: vi.fn((listener: TestMediaQueryListener) => {
          mediaQuery.listeners.add(listener);
        }),
        removeListener: vi.fn((listener: TestMediaQueryListener) => {
          mediaQuery.listeners.delete(listener);
        }),
        dispatchEvent: vi.fn(() => true),
      } as MediaQueryList;
    }),
  });

  return {
    setMatches: (query: string, matches: boolean) => {
      const mediaQuery = getQuery(query);
      mediaQuery.matches = matches;
      act(() => {
        mediaQuery.listeners.forEach((listener) => listener());
      });
    },
  };
};

describe("MultiviewPage", () => {
  beforeEach(() => {
    installMatchMedia();
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });
    window.history.replaceState(null, "", "/multiview");
    window.localStorage.clear();
    useScheduleDataMock.mockReturnValue({
      members: [memberA, memberB],
    });
    useMultiviewSourcesMock.mockReturnValue({
      sources: [liveSource, offlineSource],
      loading: false,
      hasLoaded: true,
      reload: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the source panel as a reserved left column with simplified controls", () => {
    renderPage();

    expect(screen.queryByTestId("multiview-toolbar")).toBeNull();
    expect(screen.queryByTestId("multiview-source-panel")).toBeNull();
    expect(screen.getByTestId("multiview-source-rail")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));

    const panel = screen.getByTestId("multiview-source-panel");
    expect(panel.className).not.toContain("absolute");
    expect(panel.className).toContain("shrink-0");
    expect(screen.getByTestId("multiview-canvas").contains(panel)).toBe(false);
    expect(within(panel).queryByText("Mul.Live")).toBeNull();
    expect(within(panel).queryByLabelText("CHZZK 채널 ID 또는 URL")).toBeNull();
    expect(within(panel).queryByLabelText("멀티뷰 배치")).toBeNull();
    expect(within(panel).queryByLabelText("프레임 크기")).toBeNull();
    expect(within(panel).queryByLabelText("채팅 열기")).toBeNull();
    expect(within(panel).queryByLabelText("라이브 상태 갱신")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "라이브 멤버 테스트 라이브 1,234명 시청 중 멀티뷰 선택",
      }),
    ).toBeTruthy();
    expect(within(panel).getByText("테스트 라이브")).toBeTruthy();
    expect(within(panel).getByText("1,234명 시청 중")).toBeTruthy();
  });

  it("uses shared theme tokens for the multiview shell", () => {
    renderPage();

    expect(screen.getByTestId("multiview-root").className).toContain(
      "bg-background",
    );
    expect(screen.getByTestId("multiview-canvas").className).toContain(
      "bg-muted/30",
    );
    expect(screen.getByTestId("multiview-source-rail").className).toContain(
      "bg-card",
    );

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));

    const panel = screen.getByTestId("multiview-source-panel");
    expect(panel.className).toContain("bg-card");
    expect(panel.className).toContain("border-border");

    fireEvent.click(
      screen.getByRole("button", {
        name: "라이브 멤버 테스트 라이브 1,234명 시청 중 멀티뷰 선택",
      }),
    );

    const tile = screen.getByTestId("multiview-player-tile");
    expect(tile.className).toContain("bg-card");
    expect(tile.className).toContain("border-border");
    expect(screen.getByTestId("multiview-chat-dock").className).toContain(
      "bg-card",
    );
  });

  it("shows only extension connection status in the source panel", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));

    const panel = screen.getByTestId("schedule-plus-extension-panel");
    expect(within(panel).getByTestId("schedule-plus-extension-icon")).toBeTruthy();
    expect(within(panel).getByText("OTW Schedule +")).toBeTruthy();
    expect(within(panel).getByText("확장 미설치")).toBeTruthy();
    expect(within(panel).getByText("확장 설치 권장")).toBeTruthy();
    expect(
      within(panel).getByText("확장을 설치하면 화면 자동 정리와 채팅 로그인", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("link", { name: "설치 안내 보기" }),
    ).toBeTruthy();
    expect(within(panel).queryByText("개인정보 안내")).toBeNull();
    expect(within(panel).queryByText("도움말")).toBeNull();
    expect(within(panel).queryByLabelText("화면 자동 정리")).toBeNull();
    expect(within(panel).queryByLabelText("채팅 로그인")).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
            version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
            direction: "extension-to-web",
            type: "CAPABILITIES",
            payload: {
              capabilities: ["wideMode", "chatLoginBridge"],
              chatLoginBridgeStatus: "enabled",
              playerOptimizationEnabled: true,
            },
          },
          origin: window.location.origin,
          source: window,
        }),
      );
    });

    expect(within(panel).getByText("확장 연결됨")).toBeTruthy();
    expect(within(panel).queryByText("확장 설치 권장")).toBeNull();
    expect(within(panel).queryByRole("link", { name: "설치 안내 보기" }))
      .toBeNull();
    expect(within(panel).queryByLabelText("화면 자동 정리")).toBeNull();
    expect(within(panel).queryByLabelText("채팅 로그인")).toBeNull();
  });

  it("auto-collapses the source panel into a reserved rail when the viewport becomes narrow", () => {
    const media = installMatchMedia({
      "(min-width: 1024px)": true,
    });

    renderPage();

    expect(screen.getByTestId("multiview-source-panel")).toBeTruthy();

    media.setMatches("(min-width: 1024px)", false);

    expect(screen.queryByTestId("multiview-source-panel")).toBeNull();
    expect(screen.getByTestId("multiview-source-rail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "멀티뷰 패널 열기" })).toBeTruthy();
  });

  it("adds a source from the source panel and renders a scaled CHZZK iframe tile without tile scrollbars", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "라이브 멤버 테스트 라이브 1,234명 시청 중 멀티뷰 선택",
      }),
    );

    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([
      CHANNEL_A,
    ]);

    const panel = screen.getByTestId("multiview-source-panel");
    expect(
      within(panel).getByText("현재 화면이 불편하다면", { exact: false }),
    ).toBeTruthy();
    expect(
      within(panel).getByLabelText(
        "현재 화면이 불편하다면 Mul.Live에서 현재 선택 방송 열기",
      ),
    ).toBeTruthy();

    const tile = screen.getByTestId("multiview-player-tile");
    expect(tile.className).toContain("min-w-0");
    expect(tile.className).toContain("min-h-0");
    expect(screen.getByTestId("multiview-canvas").className).toContain(
      "overflow-hidden",
    );
    expect(screen.getByTestId("multiview-frame-scroll").className).toContain(
      "overflow-hidden",
    );
    const liveFrame = screen.getByTestId("multiview-live-frame");
    expect(liveFrame.getAttribute("data-channel-id")).toBe(CHANNEL_A);
    expect(liveFrame.className).toContain(
      "scale-[var(--mv-frame-scale)]",
    );
    expect(liveFrame.className).toContain(
      "w-[var(--mv-frame-width)]",
    );
    expect(liveFrame.getAttribute("scrolling")).toBe("no");
    expect(screen.getByTestId("multiview-player-grid").getAttribute("style"))
      .toContain("--mv-frame-scale:");
    expect(screen.getByTestId("multiview-player-grid").getAttribute("style"))
      .toContain("--mv-frame-width:");
  });

  it("keeps the CHZZK live iframe mounted across extension status updates", () => {
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_A}`);

    renderPage();

    const liveFrame = screen.getByTestId("multiview-live-frame");
    expect(liveFrame.getAttribute("src")).toContain(CHANNEL_A);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
            version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
            direction: "extension-to-web",
            type: "TILE_STATUS",
            payload: {
              statuses: {
                [CHANNEL_A]: "selector_missing",
              },
            },
          },
          origin: window.location.origin,
          source: window,
        }),
      );
    });

    expect(screen.getByTestId("multiview-live-frame")).toBe(liveFrame);
    expect(screen.getByTestId("multiview-live-frame").getAttribute("src"))
      .toContain(CHANNEL_A);
  });

  it("requests player optimization only for newly added channels", () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window, "postMessage");
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_A}`);

    renderPage();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
            version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
            direction: "extension-to-web",
            type: "CAPABILITIES",
            payload: {
              capabilities: ["wideMode", "chatLoginBridge"],
              chatLoginBridgeStatus: "disabled",
              playerOptimizationEnabled: true,
            },
          },
          origin: window.location.origin,
          source: window,
        }),
      );
      vi.advanceTimersByTime(3000);
    });

    postMessage.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "오프라인 멤버 멀티뷰 선택",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "그래도 추가" }));

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const wideModeRequests = postMessage.mock.calls
      .map(([message]) => message)
      .filter(
        (message): message is { payload: { channelIds: string[] }; type: string } =>
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "REQUEST_WIDE_MODE" &&
          "payload" in message &&
          typeof message.payload === "object" &&
          message.payload !== null &&
          "channelIds" in message.payload &&
          Array.isArray(message.payload.channelIds),
      );

    expect(wideModeRequests.length).toBeGreaterThan(0);
    expect(
      wideModeRequests.every(
        (message) =>
          message.payload.channelIds.length === 1 &&
          message.payload.channelIds[0] === CHANNEL_B,
      ),
    ).toBe(true);
  });

  it("warns before adding a member that is not currently live", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "멀티뷰 패널 열기" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "오프라인 멤버 멀티뷰 선택",
      }),
    );

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("현재 방송 중이 아닙니다")).toBeTruthy();
    expect(
      screen.getByText(
        "오프라인 멤버님은 현재 생방송 중이 아닙니다. 그래도 멀티뷰 창을 추가할까요?",
      ),
    ).toBeTruthy();
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "오프라인 멤버 멀티뷰 선택",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "그래도 추가" }));

    expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([
      CHANNEL_B,
    ]);
    expect(screen.getByTestId("multiview-live-frame")).toBeTruthy();
  });

  it("ignores removed focus layout URLs and does not render focus controls", () => {
    window.history.replaceState(
      null,
      "",
      `/multiview?c=${CHANNEL_A}&c=${CHANNEL_B}&chat=${CHANNEL_A}&layout=focus`,
    );

    renderPage();

    const tiles = screen.getAllByTestId("multiview-player-tile");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]?.hasAttribute("data-focused")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("layout")).toBeNull();
    expect(screen.queryByRole("button", { name: "라이브 멤버 포커스" })).toBeNull();
  });

  it("restores chat in a reserved right dock outside the canvas", () => {
    window.history.replaceState(
      null,
      "",
      `/multiview?c=${CHANNEL_A}&c=${CHANNEL_B}&chat=${CHANNEL_A}`,
    );

    renderPage();

    const dock = screen.getByTestId("multiview-chat-dock");

    expect(dock).toBeTruthy();
    expect(dock.className).not.toContain("absolute");
    expect(dock.className).toContain("shrink-0");
    expect(screen.getByTestId("multiview-canvas").contains(dock)).toBe(false);
    expect(
      within(dock).getByTitle("라이브 멤버 CHZZK chat").getAttribute("src"),
    ).toContain(CHANNEL_A);
  });

  it("does not mount the chat dock iframe on compact viewports", () => {
    installMatchMedia({
      "(max-width: 1279px)": true,
    });
    window.history.replaceState(
      null,
      "",
      `/multiview?c=${CHANNEL_A}&chat=${CHANNEL_A}`,
    );

    renderPage();

    expect(screen.queryByTestId("multiview-chat-dock")).toBeNull();
    expect(screen.queryByTestId("multiview-chat-rail")).toBeNull();
    expect(screen.queryByTitle("라이브 멤버 CHZZK chat")).toBeNull();
    expect(screen.getByTestId("multiview-live-frame")).toBeTruthy();
  });

  it("loads only the chat iframe credentialless while chat login bridge is disabled", () => {
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_A}`);

    renderPage();

    expect(
      screen
        .getByTitle("라이브 멤버 CHZZK chat")
        .hasAttribute("credentialless"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("multiview-live-frame")
        .hasAttribute("credentialless"),
    ).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
            version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
            direction: "extension-to-web",
            type: "CAPABILITIES",
            payload: {
              capabilities: ["wideMode", "chatLoginBridge"],
              chatLoginBridgeStatus: "enabled",
            },
          },
          origin: window.location.origin,
          source: window,
        }),
      );
    });

    expect(
      screen
        .getByTitle("라이브 멤버 CHZZK chat")
        .hasAttribute("credentialless"),
    ).toBe(false);
  });

  it("opens the right chat dock by default when channels are restored", () => {
    window.history.replaceState(null, "", `/multiview?c=${CHANNEL_A}`);

    renderPage();

    expect(screen.getByTestId("multiview-chat-dock")).toBeTruthy();
  });

  it("keeps selected order unchanged without focus controls", () => {
    window.history.replaceState(
      null,
      "",
      `/multiview?c=${CHANNEL_A}&c=${CHANNEL_B}`,
    );

    renderPage();

    const params = new URLSearchParams(window.location.search);
    expect(params.getAll("c")).toEqual([CHANNEL_A, CHANNEL_B]);
    expect(params.get("layout")).toBeNull();
    expect(screen.queryByRole("button", { name: "오프라인 멤버 포커스" })).toBeNull();
  });
});
