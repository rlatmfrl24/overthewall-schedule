import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import { AppleMusicPlayer } from "./apple-music-player-ui";

type MobilePlayerPresentation = "full" | "launcher";

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
};

export function OtwPlayPlayerQueuePanel({ editing = false }: { editing?: boolean }) {
  const player = useOtwPlayPlayer();
  const hasQueue = player.queue.items.length > 0;
  const currentItemId = player.currentItem?.id ?? null;
  const previousPlaybackIntentVersionRef = useRef(0);
  const keepCompactRef = useRef(false);
  const playerSectionRef = useRef<HTMLElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const [mobilePresentation, setMobilePresentation] =
    useState<MobilePlayerPresentation>("launcher");
  const isDesktopPlayerViewport = useMediaQuery("(min-width: 1280px)");
  const mobilePlayerOpen = !editing && mobilePresentation === "full";

  useEffect(() => {
    if (currentItemId === null) {
      setMobilePresentation("launcher");
      keepCompactRef.current = false;
    } else if (
      player.playbackIntentVersion > previousPlaybackIntentVersionRef.current
    ) {
      if (!keepCompactRef.current) setMobilePresentation("full");
    }
    previousPlaybackIntentVersionRef.current = player.playbackIntentVersion;
  }, [currentItemId, player.playbackIntentVersion]);

  const playbackSurfaceActive =
    !editing && hasQueue;
  const setPlaybackSurfaceActive = player.setPlaybackSurfaceActive;

  useEffect(() => {
    setPlaybackSurfaceActive(playbackSurfaceActive);
    return () => setPlaybackSurfaceActive(false);
  }, [playbackSurfaceActive, setPlaybackSurfaceActive]);

  useEffect(() => {
    if (!mobilePlayerOpen || isDesktopPlayerViewport) return;
    focusReturnRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    playerSectionRef.current?.focus();
    return () => {
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    };
  }, [isDesktopPlayerViewport, mobilePlayerOpen]);

  const closeMobilePlayer = () => {
    keepCompactRef.current = true;
    setMobilePresentation("launcher");
  };

  const openMobilePlayer = () => {
    setMobilePresentation("full");
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!mobilePlayerOpen || isDesktopPlayerViewport || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobilePlayer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.closest("[hidden]"));
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };


  return <AppleMusicPlayer player={player} editing={editing} desktop={isDesktopPlayerViewport} open={mobilePlayerOpen}
    sectionRef={playerSectionRef} onKeyDown={handleDialogKeyDown} onClose={closeMobilePlayer} onLaunch={openMobilePlayer}
    onCompactResume={player.resume} />;
}
