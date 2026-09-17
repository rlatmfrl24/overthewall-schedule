import { useEffect, useRef, useState } from "react";
import { useAnimations } from "@/shared/ui/animation-provider";

const ROTATION_DELAY = 4_000;

export function useFeaturedCarousel(count: number) {
  const [selection, setSelection] = useState({ index: 0, revision: 0, animate: true });
  const progressRef = useRef<HTMLSpanElement>(null);
  const progressAnimation = useRef<Animation | null>(null);
  const remainingTime = useRef(ROTATION_DELAY);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const { enabled } = useAnimations();
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const motionEnabled = enabled && !reduced;
  const rotating = count > 1 && !focused && !hovered && !hidden && motionEnabled;
  useEffect(() => {
    remainingTime.current = ROTATION_DELAY;
    return () => {
      progressAnimation.current?.cancel();
      progressAnimation.current = null;
    };
  }, [count, selection, motionEnabled]);

  useEffect(() => {
    if (!rotating) return;
    // Preserve elapsed dwell across pauses; only a new selection resets it.
    const animation = progressAnimation.current ?? progressRef.current?.animate?.(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: ROTATION_DELAY, easing: "linear", fill: "forwards" },
    ) ?? null;
    if (progressAnimation.current) {
      progressAnimation.current.currentTime = ROTATION_DELAY - remainingTime.current;
      progressAnimation.current.play();
    }
    progressAnimation.current = animation;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => setSelection(current => ({
      index: (current.index + 1) % count, revision: current.revision + 1, animate: true,
    })), remainingTime.current);
    return () => {
      window.clearTimeout(timer);
      remainingTime.current = Math.max(0, remainingTime.current - (performance.now() - startedAt));
      animation?.pause();
    };
  }, [count, selection, rotating, motionEnabled]);

  return {
    activeIndex: count ? selection.index % count : 0,
    progressRef,
    motionEnabled: motionEnabled && selection.animate,
    autoEnabled: motionEnabled,
    select: (index: number, animate = true) => setSelection(current => ({ index, revision: current.revision + 1, animate })),
    move: (direction: -1 | 1, animate = true) => {
      if (count > 1) setSelection(current => ({ index: (current.index + direction + count) % count, revision: current.revision + 1, animate }));
    },
    setFocused,
    setHovered,
    rotating,
  };
}
