import { useEffect, useState } from "react";

const ROTATION_DELAY = 6_000;

export function useFeaturedCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [motionOverride, setMotionOverride] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      setReducedMotion(media?.matches ?? false);
      setMotionOverride(false);
    };
    const onVisibility = () => setHidden(document.hidden);
    media?.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media?.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const paused = userPaused || (reducedMotion && !motionOverride);
  const rotating = count > 1 && !paused && !hovered && !hidden;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), ROTATION_DELAY);
    return () => window.clearTimeout(timer);
  }, [count, index, rotating]);

  return {
    activeIndex: count ? index % count : 0,
    select: setIndex,
    move: (direction: -1 | 1) => {
      if (count > 1) setIndex((current) => (current + direction + count) % count);
    },
    paused,
    setPaused: (next: boolean) => {
      setUserPaused(next);
      if (!next) setMotionOverride(true);
    },
    setHovered,
    reducedMotion,
    rotating,
  };
}
