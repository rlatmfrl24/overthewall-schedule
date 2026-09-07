import { useEffect, useState } from "react";

const ROTATION_DELAY = 6_000;

export function useFeaturedCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      setReducedMotion(media?.matches ?? false);
    };
    const onVisibility = () => setHidden(document.hidden);
    media?.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media?.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const rotating = count > 1 && !focused && !hovered && !hidden && !reducedMotion;
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
    setFocused,
    setHovered,
    rotating,
  };
}
