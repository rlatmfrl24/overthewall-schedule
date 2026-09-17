// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPlaylistHeroTransition } from "./playlist-hero-transition";

const { animate } = vi.hoisted(() => ({ animate: vi.fn(() => ({ cancel: vi.fn() })) }));
vi.mock("animejs/waapi", () => ({ waapi: { animate } }));
const detail = "/play/playlists/defaults/cover";
let root: HTMLDivElement;
let controller: ReturnType<typeof createPlaylistHeroTransition>;
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });

function artwork(kind: "card" | "detail", key = detail) {
  const node = document.createElement("div");
  node.dataset.playlistHero = key;
  node.dataset.heroKind = kind;
  node.innerHTML = '<img src="/cover.jpg" alt="" />';
  node.getBoundingClientRect = () => kind === "card" ? rect(100, 200, 320, 320) : rect(20, 80, 208, 208);
  const wrapper = document.createElement("div");
  wrapper.className = kind === "card" ? "playlist-card-main" : "playlist-detail-heading";
  const title = document.createElement(kind === "card" ? "h3" : "h1");
  title.dataset.playlistHeroTitle = "";
  title.textContent = "함께 듣는 긴 플레이리스트 제목";
  title.style.fontSize = kind === "card" ? "48px" : "24px";
  title.style.textWrap = "balance";
  title.getBoundingClientRect = () => kind === "card" ? rect(124, 360, 272, 104) : rect(260, 100, 480, 28);
  wrapper.append(node, title);
  root.replaceChildren(wrapper);
  return node;
}
async function commit() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  root = document.createElement("div");
  root.getBoundingClientRect = () => rect(0, 64, 1000, 800);
  document.body.append(root);
  controller = createPlaylistHeroTransition(root, true);
});
afterEach(() => {
  controller.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

it("bridges a delayed route commit, restores the image and returns to the saved scroll position", async () => {
  const source = artwork("card");
  const sourceTitle = root.querySelector<HTMLElement>("[data-playlist-hero-title]")!;
  root.scrollTop = 420;
  controller.navigate("/play/playlists", detail);
  expect(source.style.visibility).toBe("hidden");
  expect(sourceTitle.style.opacity).toBe("0");
  expect(document.querySelector(".playlist-hero-title")?.textContent).toBe(sourceTitle.textContent);
  expect(document.querySelector('.playlist-hero-flight')?.getAttribute("data-direction")).toBe("open");
  // A query loading state does not discard the outgoing artwork.
  root.replaceChildren(document.createElement("p"));
  await commit();
  expect(animate).not.toHaveBeenCalled();
  const target = artwork("detail");
  const targetTitle = root.querySelector<HTMLElement>("[data-playlist-hero-title]")!;
  await commit();
  expect(root.scrollTop).toBe(0);
  expect(target.style.visibility).toBe("hidden");
  expect(targetTitle.style.opacity).toBe("0");
  expect(animate).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
    transform: ["translate(0px, 0px) scale(1)", "translate(136px, -260px) scale(0.5)"], opacity: [1, 0], duration: 360,
  }));
  expect(animate).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ translateX: -80, translateY: -120, width: 208, height: 208 }));
  const call = vi.mocked(animate).mock.calls.at(-1) as unknown as [Element, { onComplete: () => void }];
  call[1].onComplete();
  expect(target.style.visibility).toBe("");
  expect(targetTitle.style.opacity).toBe("");
  expect(sourceTitle.style.opacity).toBe("");
  expect(document.querySelector(".playlist-hero-layer")).toBeNull();
  controller.navigate(detail, "/play/playlists");
  const card = artwork("card");
  await commit();
  expect(root.scrollTop).toBe(420);
  expect(card.style.visibility).toBe("hidden");
  expect(animate).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
    transform: ["translate(0px, 0px) scale(1)", "translate(-136px, 260px) scale(2)"], opacity: [1, 0],
  }));
  expect(document.querySelector('.playlist-hero-flight')?.getAttribute("data-direction")).toBe("close");
});

it("keeps navigation and scroll restoration when motion is disabled", async () => {
  controller.dispose();
  controller = createPlaylistHeroTransition(root, false);
  artwork("card");
  root.scrollTop = 300;
  controller.navigate("/play/playlists", detail);
  artwork("detail");
  await commit();
  expect(root.scrollTop).toBe(0);
  controller.navigate(detail, "/play/playlists");
  artwork("card");
  await commit();
  expect(root.scrollTop).toBe(300);
  expect(animate).not.toHaveBeenCalled();
  expect(document.querySelector(".playlist-hero-layer")).toBeNull();
  expect(root.querySelector<HTMLElement>("[data-playlist-hero-title]")?.style.opacity).toBe("");
});

it.each(["resize", "wheel", "timeout", "navigation", "unmount"])("cleans up visibility and the transient layer on %s", async reason => {
  const source = artwork("card");
  controller.navigate("/play/playlists", detail);
  if (reason === "resize") window.dispatchEvent(new Event("resize"));
  if (reason === "wheel") root.dispatchEvent(new Event("wheel"));
  if (reason === "timeout") await vi.advanceTimersByTimeAsync(1200);
  if (reason === "navigation") controller.navigate(detail, "/play/songs");
  if (reason === "unmount") controller.dispose();
  expect(source.style.visibility).toBe("");
  expect(document.querySelector(".playlist-hero-layer")).toBeNull();
});

it("does not animate editor routes or another playlist's image", () => {
  artwork("card");
  controller.navigate("/play/playlists", "/play/playlists/new");
  controller.navigate("/play/playlists", "/play/playlists/another");
  expect(document.querySelector(".playlist-hero-layer")).toBeNull();
});

it("supports personal playlist identity without confusing it with a default playlist", async () => {
  const key = "/play/playlists/my-playlist";
  artwork("card", key);
  controller.navigate("/play/playlists", key);
  artwork("detail", key);
  await commit();
  expect(animate).toHaveBeenCalledTimes(5);
});
