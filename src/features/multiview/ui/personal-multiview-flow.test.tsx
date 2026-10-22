// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import type { SavedMultiviewChannel } from "@contracts/multiview";
const session = vi.hoisted(() => ({ owner: "alice", isLoaded: true, isSignedIn: true }));
const login = vi.hoisted(() => ({ returnUrl: "" }));
vi.mock("@clerk/clerk-react", () => ({ useUser: () => ({ ...session, user: { id: session.owner } }), SignInButton: ({ children, forceRedirectUrl }: { children: React.ReactNode; forceRedirectUrl: string }) => <span onClick={() => { login.returnUrl = forceRedirectUrl; }}>{children}</span> }));
const defaultId = "f".repeat(32), id = "a".repeat(32);
vi.mock("@/features/schedule-board", () => ({ useScheduleData: () => ({ loading: false, members: [createMemberFixture({ uid: 1, code: "public", name: "기본 멤버", url_chzzk: `https://chzzk.naver.com/${defaultId}` })] }) }));
import { MultiviewPage } from "./multiview-page";
const saved = (channelId: string, name = "개인 채널"): SavedMultiviewChannel => ({ channelId, channelName: name, channelImageUrl: null, addedAt: 1 });
const content = (channelId: string) => ({ channelId, channelName: "공개 채널", channelImageUrl: "", status: "OPEN", liveTitle: "방송 중입니다", concurrentUserCount: 1, liveImageUrl: "", defaultThumbnailImageUrl: "" });
let rows: SavedMultiviewChannel[], failStatus: boolean, privateCalls: number;
beforeEach(() => {
  window.history.replaceState(null, "", "/multiview"); Object.assign(session, { owner: "alice", isLoaded: true, isSignedIn: true }); rows = []; failStatus = false; privateCalls = 0;
  Object.assign(window, { Clerk: { session: { getToken: async () => "own-token" } } });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path.startsWith("/api/live-status")) return Response.json({ items: [{ channelId: defaultId, content: content(defaultId) }] });
    privateCalls++;
    if (init.method === "POST") {
      if (rows.length >= 30) return Response.json({ error: { code: "MULTIVIEW_CHANNEL_LIMIT", message: "채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요." } }, { status: 409 });
      if (!rows.some(x => x.channelId === id)) rows.push(saved(id));
      return Response.json({ item: saved(id) });
    }
    if (init.method === "DELETE") { rows = rows.filter(x => !path.endsWith(x.channelId)); return Response.json({ deleted: true }); }
    if (path.endsWith("live-status")) return failStatus ? Response.json({ error: { message: "status failed" } }, { status: 503 }) : Response.json({ items: rows.map(x => ({ channelId: x.channelId, content: null })) });
    return Response.json({ items: [...rows], limit: 30 });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(window, "Clerk"); });
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MultiviewPage /></QueryClientProvider>); }
it("adds through the form, reads back, selects beside a default member and deletes without changing the shared URL", async () => {
  mount();
  const input = await screen.findByRole("textbox", { name: "치지직 채널 주소 또는 ID" });
  fireEvent.change(input, { target: { value: `https://chzzk.naver.com/${id}` } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  fireEvent.click(await screen.findByRole("button", { name: "개인 채널 선택" }));
  fireEvent.click(await screen.findByRole("button", { name: "기본 멤버 선택" }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([id, defaultId]));
  expect(screen.getByRole("link", { name: /Mul.Live에서 보기/ }).getAttribute("href")).toBe(`https://mul.live/${id}/${defaultId}`);
  fireEvent.click(screen.getByRole("button", { name: "개인 채널 저장 목록에서 삭제" }));
  await waitFor(() => expect(rows).toEqual([]));
  await waitFor(() => expect(screen.queryByRole("button", { name: "개인 채널 저장 목록에서 삭제" })).toBeNull());
  expect(new URLSearchParams(window.location.search).getAll("c")).toEqual([id, defaultId]);
  expect(document.querySelector("iframe")).toBeNull();
});
it("retains anonymous member selection and avoids all personal requests", async () => {
  session.isSignedIn = false;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "기본 멤버 선택" }));
  expect(screen.getByRole("link", { name: /Mul.Live에서 보기/ }).getAttribute("href")).toBe(`https://mul.live/${defaultId}`);
  expect(privateCalls).toBe(0);
});
it("passes the current selected channels to Clerk when starting login", async () => {
  session.isSignedIn = false; login.returnUrl = "";
  mount();
  await screen.findByText("LIVE");
  fireEvent.click(screen.getByRole("button", { name: "기본 멤버 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(new URL(login.returnUrl, "http://localhost:5173").searchParams.getAll("c")).toEqual([defaultId]);
});
it("preserves shared selections while thirty saved channels load and still limits selection to eight", async () => {
  rows = Array.from({ length: 30 }, (_, n) => saved((n + 1).toString(16).padStart(32, "0"), `채널${n + 1}`));
  const selected = rows.slice(0, 8).map(x => x.channelId);
  window.history.replaceState(null, "", `/multiview?${selected.map(x => `c=${x}`).join("&")}`);
  mount();
  await screen.findByRole("button", { name: "채널1 선택 해제" });
  expect(new URLSearchParams(window.location.search).getAll("c")).toEqual(selected);
  expect((screen.getByRole("button", { name: "채널9 선택 불가 (최대 8개)" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("저장 30/30")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "치지직 채널 주소 또는 ID" }), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  await screen.findByText("채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요.");
  expect(rows).toHaveLength(30);
});
it("keeps healthy public LIVE when private statuses fail", async () => {
  rows = [saved(id)]; failStatus = true;
  mount();
  await screen.findByRole("button", { name: "개인 채널 선택" });
  expect(await screen.findByText("LIVE")).toBeTruthy();
  expect(screen.getByRole("button", { name: "기본 멤버 선택" })).toBeTruthy();
});
