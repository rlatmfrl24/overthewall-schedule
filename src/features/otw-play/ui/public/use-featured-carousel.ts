import { useEffect, useState } from "react";
import { useAnimations } from "@/shared/ui/animation-provider";

const ROTATION_DELAY = 7_000;

export function useFeaturedCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const { enabled } = useAnimations();

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const rotating = count > 1 && !focused && !hovered && !hidden && enabled;
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
