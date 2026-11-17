import { waapi } from "animejs/waapi";

const isCollection = (path: string) => path === "/play" || path === "/play/playlists";
const isDetail = (path: string) => /^\/play\/playlists\/(?:defaults\/[^/]+|(?!new$)[^/]+)$/.test(path);
export type PlaylistHeroScrollPositions = Map<string, { top: number; left: number }>;

/** Reveal the destination in place; navigation and scroll restoration never wait for motion. */
export function createPlaylistHeroTransition(root: HTMLElement, enabled: boolean, scrollPositions: PlaylistHeroScrollPositions = new Map()) {
  let disposeTransition = () => {};

  const navigate = (from: string, to: string) => {
    disposeTransition();
    const opening = isCollection(from) && isDetail(to);
    const closing = isDetail(from) && isCollection(to);
    if (!opening && !closing) return;
    const key = opening ? to : from;
    const findArtwork = () => Array.from(root.querySelectorAll<HTMLElement>("[data-playlist-hero]"))
      .find(element => element.dataset.playlistHero === key && element.dataset.heroKind === (opening ? "detail" : "card"));
    if (opening) scrollPositions.set(from, { top: root.scrollTop, left: root.querySelector(".playlist-discovery-grid")?.scrollLeft ?? 0 });
    const keyboard = root.closest<HTMLElement>("[data-play-input]")?.dataset.playInput === "keyboard";
    let animation: ReturnType<typeof waapi.animate> | undefined;
    let stopped = false;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(arrive);
    });

    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      // Anime.js cancel commits the current frame; restore the live content instead.
      animation?.revert();
      window.removeEventListener("resize", finish);
      root.removeEventListener("wheel", finish);
      root.removeEventListener("touchmove", finish);
    };
    disposeTransition = finish;

    function arrive() {
      if (stopped) return;
      const target = findArtwork();
      if (!target) return;
      observer.disconnect();
      clearTimeout(timer);
      const position = closing ? scrollPositions.get(to) : undefined;
      root.scrollTop = position?.top ?? 0;
      const strip = root.querySelector(".playlist-discovery-grid");
      if (strip && position) strip.scrollLeft = position.left;
      // A direct detail URL or a return to a different collection has no saved position.
      if (closing) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      if (closing && document.activeElement === document.body) target.closest("a")?.focus({ preventScroll: true });
      const content = target.closest<HTMLElement>(opening ? ".playlist-detail-heading" : "a");
      if (!enabled || keyboard || !content || typeof content.animate !== "function") { finish(); return; }
      animation = waapi.animate(content, {
        transform: [`translateY(${opening ? 4 : 2}px)`, "translateY(0px)"],
        opacity: [0.72, 1], duration: opening ? 180 : 140,
        ease: "cubic-bezier(0.23, 1, 0.32, 1)", onComplete: finish,
      });
    }

    // Queries may resolve after the route commits; keep loading and error states visible.
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(finish, 1200);
    window.addEventListener("resize", finish);
    root.addEventListener("wheel", finish, { passive: true });
    root.addEventListener("touchmove", finish, { passive: true });
  };

  return { navigate, dispose: () => disposeTransition() };
}
