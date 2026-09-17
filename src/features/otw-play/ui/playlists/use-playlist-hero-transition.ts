import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAnimations } from "@/shared/ui/animation-provider";
import { createPlaylistHeroTransition, type PlaylistHeroScrollPositions } from "./playlist-hero-transition";

export function usePlaylistHeroTransition() {
  const root = useRef<HTMLElement>(null);
  const router = useRouter();
  const positions = useRef<PlaylistHeroScrollPositions>(new Map());
  const { enabled } = useAnimations();
  useEffect(() => {
    if (!root.current) return;
    const transition = createPlaylistHeroTransition(root.current, enabled, positions.current);
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ fromLocation, toLocation }) => {
      transition.navigate(fromLocation?.pathname ?? "", toLocation.pathname);
    });
    return () => { unsubscribe(); transition.dispose(); };
  }, [router, enabled]);
  return root;
}
